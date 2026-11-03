const { ZodError } = require('zod');

/**
 * Turns a zod schema into Express middleware. Validation happens at the route
 * boundary, before any controller or database call runs.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please check the highlighted fields.',
        errors,
      });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = { validate, ZodError };
