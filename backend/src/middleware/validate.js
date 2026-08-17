'use strict';

const { ZodError } = require('zod');
const { AppError }  = require('../services/errors');

/**
 * validate(schema) — returns an Express middleware that validates req.body
 * against the given Zod schema.
 *
 * On success:  replaces req.body with the parsed (and Zod-coerced) value, then calls next().
 * On failure:  calls next(AppError('VALIDATION_ERROR')) with Zod's field-level details,
 *              matching contract §6 (VALIDATION_ERROR = 400, details includes offending fields).
 *
 * Usage in a route file:
 *   const { z } = require('zod');
 *   const schema = z.object({ message: z.string().min(1) });
 *   router.post('/', authenticate, validate(schema), chatController.submit);
 *
 * @param {import('zod').ZodSchema} schema — Zod schema to validate req.body against
 */
function validate(schema) {
  return (req, _res, next) => {
    try {
      // parse() throws ZodError if validation fails, or returns the cleaned value
      req.body = schema.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Flatten Zod's error list into {field: [messages]} for the contract's `details` field
        const details = err.errors.reduce((acc, issue) => {
          const field = issue.path.join('.') || '_root';
          acc[field]  = acc[field] ? [...acc[field], issue.message] : [issue.message];
          return acc;
        }, {});

        return next(
          new AppError(
            'VALIDATION_ERROR',
            'Request body failed validation',
            details,
          ),
        );
      }
      // Not a ZodError — let the central handler deal with it
      return next(err);
    }
  };
}

module.exports = validate;
