'use strict';

const { ZodError } = require('zod');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
  }
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
}

module.exports = { errorHandler };
