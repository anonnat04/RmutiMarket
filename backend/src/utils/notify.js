const { supabase } = require("../config/db");
const { sendNotificationToUser } = require("../services/chatSocket");

/**
 * Insert a notification into the database and emit it in real time via Socket.IO.
 */
async function sendUserNotification({
  userId,
  type = "system",
  title,
  message,
  referenceType = null,
  referenceId = null,
}) {
  if (!userId || !title) return null;
  try {
    const payload = {
      user_id: userId,
      type,
      title,
      message: message || "",
      is_read: false,
    };
    if (referenceType) payload.reference_type = referenceType;
    if (referenceId != null) payload.reference_id = Number(referenceId) || null;

    const { data, error } = await supabase
      .from("notifications")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.warn("[sendUserNotification] insert error:", error.message);
      return null;
    }

    if (data) {
      sendNotificationToUser(userId, data);
    }
    return data;
  } catch (err) {
    console.warn("[sendUserNotification] unexpected error:", err.message);
    return null;
  }
}

module.exports = { sendUserNotification };
