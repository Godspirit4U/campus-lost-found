const { ZodError } = require('zod');

function notFound(req, res) {
  // API callers always get JSON; browsers get the styled 404 page.
  if (req.accepts('html') && !req.originalUrl.startsWith('/api')) {
    return res.status(404).sendFile(require('path').join(__dirname, '..', '..', 'public', '404.html'));
  }
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
}

/**
 * Single error funnel. Clients get a short message and a request id; the stack
 * trace stays in the server log, never in the response body.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid identifier format.' });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ success: false, message: `That ${field} is already in use.` });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Image is larger than 5 MB.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Too many files. A maximum of 3 images is allowed.' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  console.error(`[error ${requestId}]`, err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong on our side. Please try again.',
    requestId,
  });
}

module.exports = { notFound, errorHandler };
