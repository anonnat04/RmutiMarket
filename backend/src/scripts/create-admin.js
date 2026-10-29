/**
 * scripts/create-admin.js
 *
 * Creates (or resets) the first admin account using Supabase client.
 *
 * Usage:
 *   node src/scripts/create-admin.js
 *   or:
 *   node src/scripts/create-admin.js admin@rmuti.ac.th "ผู้ดูแลระบบกลาง"
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { supabase } = require("../config/db");

function generateStrongPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()-_=+";
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const email = process.env.ADMIN_EMAIL || process.argv[2] || "admin@rmuti.ac.th";
  const fullName = process.env.ADMIN_FULL_NAME || process.argv[3] || "ผู้ดูแลระบบ RMUTI Market";

  if (!email) {
    console.error("❌ ADMIN_EMAIL must be set in .env or passed as argument.");
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = generateStrongPassword();
    generated = true;
  }

  const passwordHash = await bcrypt.hash(password, 14);
  const { data: existing, error: findError } = await supabase
    .from("admins")
    .select("id")
    .eq("email", email.toLowerCase())
    .limit(1);

  if (findError) {
    throw findError;
  }

  if (existing && existing[0]) {
    const { error: updateError } = await supabase
      .from("admins")
      .update({
        password_hash: passwordHash,
        full_name: fullName,
        must_change_password: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing[0].id);

    if (updateError) throw updateError;
    console.log(`\n✅ Existing admin account updated: ${email}`);
  } else {
    const { error: insertError } = await supabase
      .from("admins")
      .insert({
        email: email.toLowerCase(),
        full_name: fullName,
        password_hash: passwordHash,
        role: "super_admin",
        must_change_password: true,
      });

    if (insertError) throw insertError;
    console.log(`\n✅ New super_admin account created: ${email}`);
  }

  console.log("========================================================");
  console.log(`Admin Email  : ${email}`);
  console.log(`Admin Name   : ${fullName}`);
  if (generated) {
    console.log("⚠️  Temporary Password (shown ONCE — please copy now):");
    console.log(`   >>> ${password} <<<`);
  } else {
    console.log("ℹ️  Used ADMIN_PASSWORD from .env file.");
  }
  console.log("--------------------------------------------------------");
  console.log("ℹ️  This account MUST change its password immediately upon first login.");
  console.log("========================================================\n");
}

main()
  .catch((err) => {
    console.error("❌ Failed to create admin:", err.message);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
