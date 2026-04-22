const { stripInlineScripts, trimString } = require('../utils/sanitize');

/**
 * @param {import('joi').ObjectSchema} schema
 * @param {{ stripScripts?: string[] }} [options] — field names to apply script stripping + trim
 * @returns {import('express').RequestHandler}
 */
function validateBody(schema, options = {}) {
  const { stripScripts = [] } = options;
  return (req, res, next) => {
    let body = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body) && stripScripts.length) {
      body = { ...body };
      for (const key of stripScripts) {
        if (key in body && body[key] != null && typeof body[key] === 'string') {
          // eslint-disable-next-line no-param-reassign
          body[key] = trimString(stripInlineScripts(String(body[key])), 10000);
        }
      }
      req.body = body;
    }
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const errors = error.details.map((d) => ({
        path: d.path.join('.') || d.context?.key,
        message: d.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        errors,
      });
    }
    req.body = value;
    return next();
  };
}

module.exports = { validateBody };
