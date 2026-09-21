const { randomUUID } = require('crypto');

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function toJSON(value) {
  return JSON.stringify(value ?? null);
}

function fromJSON(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function daysBetween(dateA, dateB = new Date()) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function nowISO() {
  return new Date().toISOString();
}

module.exports = { id, toJSON, fromJSON, daysBetween, nowISO };
