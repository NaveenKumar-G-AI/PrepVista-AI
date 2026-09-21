/**
 * PrepVista Backend - Main Entry Point
 * Production-grade Express server with full middleware stack
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalRateLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import assessmentRoutes from './routes/assessments';
import intelligenceRoutes from './routes/intelligence';
import analyticsRoutes from './routes/analytics';
import skillsRoutes from './routes/skills';
import integrationRoutes from './routes/integrations';
import { authMiddleware } from './middleware/auth';
import { startSyncWorker, startEventDeliveryWorker, stopWorkers } from './workers/integration-worker';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust proxy for rate limiting behind load balancers
app.set('trust proxy', 1);

/* ---- Global Middleware ---- */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(globalRateLimiter);

/* ---- Request Logging ---- */
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: _res.statusCode,
      duration,
      userId: (req as any).auth?.userId,
      ip: req.ip,
    }, 'HTTP request');
  });
  next();
});

/* ---- Health Check ---- */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    uptime: process.uptime(),
  });
});

/* ---- API Routes ---- */
app.use('/api/auth', authRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/integrations', integrationRoutes);

/* ---- Protected User Routes ---- */
app.get('/api/user/profile', authMiddleware, async (req, res, next) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
});

/* ---- 404 Handler ---- */
app.use(notFoundHandler);

/* ---- Error Handler ---- */
app.use(errorHandler);

/* ---- Start Server ---- */
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Server started');

  // Start background workers
  startSyncWorker();
  startEventDeliveryWorker();
});

/* ---- Graceful Shutdown ---- */
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down...');

  // Stop background workers
  stopWorkers();

  server.close(async () => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;