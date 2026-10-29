const { createClient } = require("@supabase/supabase-js");

const rawUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : "";
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "") : "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.trim() : "";

const isPlaceholder =
  !supabaseUrl ||
  !supabaseServiceKey ||
  supabaseUrl.includes("YOUR_PROJECT_ID") ||
  supabaseServiceKey.includes("YOUR_SERVICE_ROLE_KEY");

if (isPlaceholder) {
  console.warn("\x1b[33m⚠️  [Database Warning] SUPABASE_URL หรือ SUPABASE_SERVICE_KEY ยังเป็นค่าเริ่มต้น (Placeholder)\x1b[0m");
  console.warn("\x1b[33m   → กรุณานำ URL และ Key จาก Supabase Dashboard มาใส่ใน backend/.env เพื่อเชื่อมต่อฐานข้อมูลจริง\x1b[0m");
}

/**
 * supabase — Service Role client (bypasses RLS, for backend use ONLY).
 * Never expose this key to the frontend.
 */
const supabase = createClient(
  supabaseUrl || "https://placeholder-project.supabase.co",
  supabaseServiceKey || "placeholder-key",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  }
);

/**
 * Convenience wrapper: run raw SQL via Supabase's rpc or pg REST.
 * Most operations should use supabase.from(...).select/insert/update/delete
 * instead of raw SQL.
 */
async function sql(query, params = []) {
  const { data, error } = await supabase.rpc("exec_sql", {
    query,
    params,
  });
  if (error) throw error;
  return data;
}

// Verify connection on startup
supabase
  .from("users")
  .select("id")
  .limit(1)
  .then(({ error }) => {
    if (error) {
      console.error("❌ [Database] Supabase connection failed:", error.message);
      console.error("   → ตรวจสอบ SUPABASE_URL และ SUPABASE_SERVICE_KEY ใน .env");
    } else {
      console.log("✅ [Database] Connected to Supabase PostgreSQL.");
      console.log(`🌐 [Database] Project URL: ${supabaseUrl}`);
    }
  });

module.exports = { supabase, sql };
