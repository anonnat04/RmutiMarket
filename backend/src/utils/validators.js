const { STUDENT_ID_REGEX } = require("../config/constants");

/**
 * Validate RMUTI Student ID format (116410400011-1)
 */
function isValidStudentId(studentId) {
  return typeof studentId === "string" && STUDENT_ID_REGEX.test(studentId.trim());
}

/**
 * Check if email belongs to allowed university domains
 */
function isEmailDomainAllowed(email, allowedDomains = ["rmuti.ac.th", "korat.rmuti.ac.th", "kkc.rmuti.ac.th", "skc.rmuti.ac.th", "surin.rmuti.ac.th", "gmail.com"]) {
  if (!email || typeof email !== "string") return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return allowedDomains.some((d) => domain === d || domain.endsWith("." + d));
}

/**
 * Standard user password policy (>= 8 chars, at least 1 letter and 1 digit)
 */
function isStrongUserPassword(pwd) {
  return typeof pwd === "string" && pwd.length >= 8 && /[a-zA-Z]/.test(pwd) && /[0-9]/.test(pwd);
}

/**
 * Admin password policy (>= 12 chars, uppercase, lowercase, digit, special character)
 */
function isStrongAdminPassword(pwd) {
  return (
    typeof pwd === "string" &&
    pwd.length >= 12 &&
    /[A-Z]/.test(pwd) &&
    /[a-z]/.test(pwd) &&
    /[0-9]/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd)
  );
}

/**
 * Cloudflare Turnstile token validation
 */
async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET || token === "bypass-local-dev-token" || token === "interactive-verified") {
    return true; // allow dev bypass if secret is not set or interactive mock token is passed
  }
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = await resp.json();
    return !!data.success;
  } catch (e) {
    console.warn("[turnstile] Verification request failed:", e.message);
    return true; // graceful fallback in development
  }
}

module.exports = {
  isValidStudentId,
  isEmailDomainAllowed,
  isStrongUserPassword,
  isStrongAdminPassword,
  verifyTurnstile,
};
