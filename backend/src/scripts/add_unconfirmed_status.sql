-- Required for the 24-hour delivery confirmation timeout.
-- Run once against the Supabase database before deploying the backend change.
INSERT INTO public.transaction_status (id, name)
VALUES (6, 'ยังไม่ยืนยัน (UNCONFIRMED)')
ON CONFLICT (id) DO NOTHING;
