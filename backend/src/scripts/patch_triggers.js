require('dotenv').config();
const { Client } = require('pg');

// Supabase PostgreSQL connection details
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// We need to construct this from the project ref
const projectRef = 'itbhouqwcugfuryrckcl';

// Supabase session pooler connection (port 5432 for IPv4 compatible, or 6543 for Supavisor)
// The host pattern for direct connection is: db.[project-ref].supabase.co:5432
const client = new Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

const patchSQL = `
-- Fix T1: appointment_status has no 'code' column → use 'name' instead
CREATE OR REPLACE FUNCTION check_single_active_appointment()
RETURNS TRIGGER AS $$
DECLARE
  v_cancelled_id integer;
  active_count   integer;
BEGIN
  SELECT id INTO v_cancelled_id FROM public.appointment_status WHERE name = 'ยกเลิก' LIMIT 1;

  IF v_cancelled_id IS NOT NULL AND NEW.status_id <> v_cancelled_id THEN
    SELECT COUNT(*) INTO active_count
      FROM public.appointments
     WHERE transaction_id = NEW.transaction_id
       AND id IS DISTINCT FROM NEW.id
       AND status_id <> v_cancelled_id;

    IF active_count > 0 THEN
      RAISE EXCEPTION 'ธุรกรรมนี้มีนัดหมายที่ยังดำเนินการอยู่แล้ว ไม่สามารถสร้างนัดหมายซ้ำได้ (ต้องยกเลิกนัดเดิมก่อน)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix T2: appointment_status overlap check - use name instead of code
CREATE OR REPLACE FUNCTION check_appointment_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_buyer_id      bigint;
  v_seller_id     bigint;
  v_cancelled_id  integer;
  overlap_count   integer;
BEGIN
  SELECT t.buyer_id, t.seller_id INTO v_buyer_id, v_seller_id
    FROM public.transactions t WHERE t.id = NEW.transaction_id;

  SELECT id INTO v_cancelled_id FROM public.appointment_status WHERE name = 'ยกเลิก' LIMIT 1;

  IF NEW.status_id = v_cancelled_id OR v_cancelled_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO overlap_count
    FROM public.appointments a
    JOIN public.transactions t ON a.transaction_id = t.id
   WHERE a.id IS DISTINCT FROM NEW.id
     AND a.appointment_date = NEW.appointment_date
     AND a.status_id <> v_cancelled_id
     AND ABS(EXTRACT(EPOCH FROM (a.appointment_time - NEW.appointment_time))) < 2400
     AND (
           t.buyer_id  IN (v_buyer_id, v_seller_id)
        OR t.seller_id IN (v_buyer_id, v_seller_id)
     );

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'ไม่สามารถนัดหมายซ้อนเวลาได้ กรุณาเลือกเวลาห่างกันอย่างน้อย 40 นาที';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix T3: late cancellation - use name instead of code
CREATE OR REPLACE FUNCTION check_late_cancellation()
RETURNS TRIGGER AS $$
DECLARE
  v_cancelled_id    integer;
  v_current_score   integer;
  v_new_score       integer;
  v_appt_datetime   timestamp with time zone;
BEGIN
  SELECT id INTO v_cancelled_id FROM public.appointment_status WHERE name = 'ยกเลิก' LIMIT 1;

  IF v_cancelled_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status_id = v_cancelled_id AND (OLD.status_id IS DISTINCT FROM v_cancelled_id) THEN
    v_appt_datetime := (NEW.appointment_date::text || ' ' || NEW.appointment_time::text)::timestamp with time zone;

    IF v_appt_datetime - now() < INTERVAL '2 hours' AND NEW.cancelled_by IS NOT NULL THEN
      SELECT trust_score INTO v_current_score FROM public.users WHERE id = NEW.cancelled_by;
      v_new_score := GREATEST(0, v_current_score - 10);
      UPDATE public.users SET trust_score = v_new_score, updated_at = now() WHERE id = NEW.cancelled_by;

      INSERT INTO public.user_score_history (user_id, change_amount, score_after, source_type, source_id, reason)
      VALUES (NEW.cancelled_by, -10, v_new_score, 'PENALTY', NEW.id, 'LATE_CANCEL')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix process_no_show_penalties: use name instead of code
CREATE OR REPLACE FUNCTION process_no_show_penalties()
RETURNS void AS $$
DECLARE
  rec             RECORD;
  v_confirmed_id  integer;
  v_no_show_id    integer;
  v_current_score integer;
  v_new_score     integer;
BEGIN
  SELECT id INTO v_confirmed_id FROM public.appointment_status WHERE name = 'นัดหมายเรียบร้อย' LIMIT 1;
  SELECT id INTO v_no_show_id   FROM public.appointment_status WHERE name = 'ไม่มาตามนัด' LIMIT 1;

  IF v_confirmed_id IS NULL OR v_no_show_id IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT a.id AS appointment_id, t.buyer_id, t.seller_id,
           a.buyer_checked_in, a.seller_checked_in
      FROM public.appointments a
      JOIN public.transactions t ON a.transaction_id = t.id
     WHERE a.status_id = v_confirmed_id
       AND ((a.appointment_date::text || ' ' || a.appointment_time::text)::timestamp with time zone + INTERVAL '30 minutes') < now()
       AND (a.buyer_checked_in = false OR a.seller_checked_in = false)
  LOOP
    IF rec.buyer_checked_in = false THEN
      SELECT trust_score INTO v_current_score FROM public.users WHERE id = rec.buyer_id;
      v_new_score := GREATEST(0, v_current_score - 30);
      UPDATE public.users SET trust_score = v_new_score, updated_at = now() WHERE id = rec.buyer_id;
      INSERT INTO public.user_score_history (user_id, change_amount, score_after, source_type, source_id, reason)
      VALUES (rec.buyer_id, -30, v_new_score, 'PENALTY', rec.appointment_id, 'NO_SHOW')
      ON CONFLICT DO NOTHING;
    END IF;

    IF rec.seller_checked_in = false THEN
      SELECT trust_score INTO v_current_score FROM public.users WHERE id = rec.seller_id;
      v_new_score := GREATEST(0, v_current_score - 30);
      UPDATE public.users SET trust_score = v_new_score, updated_at = now() WHERE id = rec.seller_id;
      INSERT INTO public.user_score_history (user_id, change_amount, score_after, source_type, source_id, reason)
      VALUES (rec.seller_id, -30, v_new_score, 'PENALTY', rec.appointment_id, 'NO_SHOW')
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.appointments SET status_id = v_no_show_id WHERE id = rec.appointment_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
-- Fix recover_score_on_deal: use name instead of code
CREATE OR REPLACE FUNCTION recover_score_on_deal()
RETURNS TRIGGER AS $$
DECLARE
  v_completed_id integer;
  v_current_score integer;
  v_new_score integer;
  v_change integer;
BEGIN
  SELECT id INTO v_completed_id FROM public.transaction_status WHERE name = 'ซื้อขายเสร็จ' LIMIT 1;

  IF v_completed_id IS NOT NULL AND NEW.status_id = v_completed_id AND OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    SELECT trust_score INTO v_current_score FROM public.users WHERE id = NEW.seller_id;

    IF v_current_score IS NOT NULL AND v_current_score < 100 THEN
      v_new_score := LEAST(100, v_current_score + 20);
      v_change := v_new_score - v_current_score;

      UPDATE public.users
         SET trust_score = v_new_score,
             successful_deal_count = successful_deal_count + 1,
             updated_at = now()
       WHERE id = NEW.seller_id;

      INSERT INTO public.user_score_history (user_id, change_amount, score_after, source_type, source_id, reason)
      VALUES (NEW.seller_id, v_change, v_new_score, 'RECOVERY', NEW.id, 'SUCCESSFUL_DEAL')
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.users
         SET successful_deal_count = successful_deal_count + 1,
             updated_at = now()
       WHERE id = NEW.seller_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL directly');
    await client.query(patchSQL);
    console.log('✅ All 4 trigger functions patched successfully!');
    console.log('   - check_single_active_appointment: now uses name = \'ยกเลิก\'');
    console.log('   - check_appointment_overlap: now uses name = \'ยกเลิก\'');
    console.log('   - check_late_cancellation: now uses name = \'ยกเลิก\'');
    console.log('   - process_no_show_penalties: now uses name = \'นัดหมายเรียบร้อย\'/\'ไม่มาตามนัด\'');
  } catch (err) {
    console.error('❌ Failed:', err.message);
    console.log('\nSince direct DB connection failed, please run this SQL manually in Supabase SQL Editor:');
    console.log('https://app.supabase.com/project/itbhouqwcugfuryrckcl/sql/new');
    console.log('\n--- SQL TO RUN ---');
    console.log(patchSQL);
    console.log('--- END SQL ---');
  } finally {
    await client.end().catch(() => {});
    process.exit(0);
  }
}

main();
