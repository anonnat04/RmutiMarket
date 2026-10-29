/**
 * Standard API response helper functions
 */
function sendSuccess(res, data = {}, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    ...data,
  });
}

function sendError(res, error = "An error occurred", statusCode = 400, details = null) {
  return res.status(statusCode).json({
    success: false,
    error,
    ...(details ? { details } : {}),
  });
}

module.exports = {
  sendSuccess,
  sendError,
};
