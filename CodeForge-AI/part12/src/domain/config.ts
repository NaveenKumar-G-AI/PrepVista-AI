/**
 * CodeForge AI — Submission System
 * Every configurable limit in the whole pipeline is read from here, and only from
 * here. Nothing else in src/ reads process.env directly for a limit — grep for
 * "process.env" outside this file if you ever suspect a hard-coded value crept in.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export interface SubmissionLimitsConfig {
  maxSourceSizeBytes: number;
  maxFilesPerSubmission: number;
  maxFileSizeBytes: number;
  maxTotalSubmissionBytes: number;
}

export interface WorkerConfig {
  concurrency: number;
  leaseSeconds: number;
  pollIntervalMs: number;
}

export interface SweeperConfig {
  intervalMs: number;
  maxAgeSeconds: number;
}

export interface RateLimitConfig {
  submissionsPerUserPerMinute: number;
  submissionsPerIpPerMinute: number;
}

export interface AppConfig {
  limits: SubmissionLimitsConfig;
  worker: WorkerConfig;
  sweeper: SweeperConfig;
  rateLimit: RateLimitConfig;
  executionProvider: 'local-process' | 'codeforge-sandbox';
}

/** Read once, at process start. Pass this down explicitly — never re-read process.env deep in the call stack. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    limits: {
      maxSourceSizeBytes: envInt('MAX_SOURCE_SIZE_BYTES', 131072),
      maxFilesPerSubmission: envInt('MAX_FILES_PER_SUBMISSION', 20),
      maxFileSizeBytes: envInt('MAX_FILE_SIZE_BYTES', 131072),
      maxTotalSubmissionBytes: envInt('MAX_TOTAL_SUBMISSION_BYTES', 1048576),
    },
    worker: {
      concurrency: envInt('WORKER_CONCURRENCY', 4),
      leaseSeconds: envInt('WORKER_LEASE_SECONDS', 120),
      pollIntervalMs: envInt('WORKER_POLL_INTERVAL_MS', 750),
    },
    sweeper: {
      intervalMs: envInt('STUCK_JOB_SWEEP_INTERVAL_MS', 30000),
      maxAgeSeconds: envInt('STUCK_JOB_MAX_AGE_SECONDS', 600),
    },
    rateLimit: {
      submissionsPerUserPerMinute: envInt('RATE_LIMIT_SUBMISSIONS_PER_USER_PER_MINUTE', 10),
      submissionsPerIpPerMinute: envInt('RATE_LIMIT_SUBMISSIONS_PER_IP_PER_MINUTE', 20),
    },
    executionProvider: (env.EXECUTION_PROVIDER as AppConfig['executionProvider']) ?? 'local-process',
  };
}

// A ready-to-use default instance for code that doesn't need to inject a custom config
// (tests inject their own via loadConfig({...}) to exercise limits deterministically).
export const defaultConfig: AppConfig = loadConfig();

void envBool; // kept for future boolean flags (e.g. STRICT_QUOTA_MODE) — silences unused warning today
