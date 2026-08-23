'use strict';

/**
 * A deliberately small validator — enough to enforce type/required/enum on
 * flat-ish tool inputs (spec section 50: "Validate every tool input... If
 * LLM requests invalid parameters: reject, return structured error, allow
 * retry. Never execute malformed operations."). Not a full JSON-Schema
 * implementation; if a tool ever needs deep nested validation, replace this
 * with a real library rather than growing this file indefinitely.
 */
function validate(schema, input) {
  const errors = [];
  if (!schema || schema.type !== 'object') {
    return { valid: true, errors: [] }; // no schema declared — nothing to check
  }
  const value = input && typeof input === 'object' ? input : {};

  for (const key of schema.required || []) {
    if (!(key in value) || value[key] === undefined || value[key] === null) {
      errors.push(`Missing required field "${key}".`);
    }
  }

  const props = schema.properties || {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!(key in value) || value[key] === undefined) continue;
    const v = value[key];
    const type = propSchema.type;
    if (type === 'string' && typeof v !== 'string') errors.push(`Field "${key}" must be a string.`);
    if (type === 'number' && typeof v !== 'number') errors.push(`Field "${key}" must be a number.`);
    if (type === 'boolean' && typeof v !== 'boolean') errors.push(`Field "${key}" must be a boolean.`);
    if (type === 'array' && !Array.isArray(v)) errors.push(`Field "${key}" must be an array.`);
    if (propSchema.enum && !propSchema.enum.includes(v)) {
      errors.push(`Field "${key}" must be one of: ${propSchema.enum.join(', ')}.`);
    }
  }

  // Reject fields the schema doesn't know about — closes off a class of
  // "smuggle an extra param the handler wasn't expecting" issues.
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in props)) errors.push(`Unexpected field "${key}" is not part of this tool's input schema.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validate };
