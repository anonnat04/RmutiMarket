const Mailjet = require("node-mailjet");

/**
 * Initialize Mailjet Client if valid API keys are configured
 */
function getMailjetClient() {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  if (!apiKey || !secretKey) return null;
  if (apiKey.includes("your-mailjet") || apiKey.includes("your_mailjet") || secretKey.includes("your-mailjet") || secretKey.includes("your_mailjet")) {
    return null;
  }
  return Mailjet.apiConnect(apiKey, secretKey);
}

/**
 * Parse configured sender name and email
 */
function parseSender() {
  const email = process.env.MAILJET_SENDER_EMAIL || process.env.MAILJET_FROM_EMAIL || "noreply@campusmarket.rmuti.ac.th";
  const name = process.env.MAILJET_SENDER_NAME || process.env.MAILJET_FROM_NAME || "RMUTI Campus Market";
  return { name, email };
}

/**
 * Send an email message with HTML and plain-text fallback
 */
async function sendEmail({ to, subject, text, html }) {
  const client = getMailjetClient();
  const sender = parseSender();

  // If no Mailjet credentials provided, gracefully log to console in development
  if (!client) {
    console.log(`\n======================================================`);
    console.log(`📬 [EMAIL SIMULATOR / DEV LOG]`);
    console.log(`To      : ${to}`);
    console.log(`From    : ${sender.name} <${sender.email}>`);
    console.log(`Subject : ${subject}`);
    console.log(`Body    :\n${text}`);
    console.log(`======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const result = await client.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: { Email: sender.email, Name: sender.name },
          To: [{ Email: to }],
          Subject: subject,
          TextPart: text,
          HTMLPart: html,
        },
      ],
    });
    console.log(`✅ [Mailjet] Email sent successfully to ${to}`);
    return { success: true, result };
  } catch (err) {
    console.warn(`⚠️ [Mailjet Error] Failed to send email via Mailjet API (${err.message || err.statusCode}).`);
    console.log(`\n======================================================`);
    console.log(`📬 [EMAIL FALLBACK CONSOLE LOG]`);
    console.log(`To      : ${to}`);
    console.log(`Subject : ${subject}`);
    console.log(`Body    :\n${text}`);
    console.log(`======================================================\n`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEmail,
  parseSender,
};
