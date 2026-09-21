import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  redact: {
    paths: [
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.authorization',
      '*.apiKey',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'prepvista-backend',
    version: process.env.npm_package_version || '2.0.0',
  },
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}