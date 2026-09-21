import { CandidateCause, CandidatePreventiveAction } from "@/lib/engine/types";

export const ROOT_CAUSE_KEY = "missing_db_index";

export const candidateCauseKeys: CandidateCause[] = [
  {
    key: "api_latency_error_rate_spike",
    label: "API latency and error rate for application submissions spiked",
    category: "SYMPTOM",
    onCausalChain: true,
  },
  {
    key: "db_connection_pool_exhausted",
    label: "placement-db connection pool is under heavy pressure / near exhaustion",
    category: "SYMPTOM",
    onCausalChain: true,
  },
  {
    key: "db_queries_slowed",
    label: "Database queries against placement-db slowed dramatically",
    category: "IMMEDIATE_CAUSE",
    onCausalChain: true,
  },
  {
    key: "missing_db_index",
    label:
      "The new employer verification-status filter (added in v2.14.0) lacks a supporting index at production data volume",
    category: "ROOT_CAUSE",
    onCausalChain: true,
  },
  {
    key: "unrealistic_staging_data",
    label: "Pre-deploy performance testing used a staging dataset far smaller than production",
    category: "CONTRIBUTING_FACTOR",
    onCausalChain: true,
  },
  {
    key: "redis_cache_outage",
    label: "redis-cache is down or evicting heavily, forcing expensive fallback reads",
    category: "IMMEDIATE_CAUSE",
    onCausalChain: false,
  },
  {
    key: "external_verification_api_down",
    label: "A third-party employer-verification API is slow or unavailable",
    category: "IMMEDIATE_CAUSE",
    onCausalChain: false,
  },
];

export const expectedEvidenceKeys = [
  "deploy_v2140_before_symptom_onset",
  "slow_query_employers_join",
  "db_connection_pressure_climbing",
  "gateway_upstream_timeout",
  "trace-incident-01",
];

export const candidatePreventiveActions: CandidatePreventiveAction[] = [
  {
    key: "add_db_index_migration",
    label: "Add a database-index / migration-safety check to the deploy pipeline for new query patterns",
    addressesRootCause: true,
  },
  {
    key: "expand_load_testing_dataset",
    label: "Expand performance/load testing to run against production-scale data volumes",
    addressesRootCause: true,
  },
  {
    key: "add_query_performance_alerting",
    label: "Add alerting on p95 database query duration per endpoint",
    addressesRootCause: true,
  },
  {
    key: "add_deployment_perf_gate",
    label: "Require a performance-regression check before deploys that touch hot-path queries",
    addressesRootCause: true,
  },
  {
    key: "increase_db_connection_pool_size",
    label: "Permanently increase the database connection pool size",
    addressesRootCause: false,
  },
  {
    key: "add_more_app_replicas",
    label: "Add more placement-api replicas by default",
    addressesRootCause: false,
  },
  {
    key: "increase_cache_ttl",
    label: "Increase redis-cache TTL",
    addressesRootCause: false,
  },
];

export const preventiveActionKeys = candidatePreventiveActions
  .filter((a) => a.addressesRootCause)
  .map((a) => a.key);

export const rootCauseSummary =
  "The v2.14.0 deploy added an employer-verification filter (JOIN on employers.verification_status) to the " +
  "application-submission query, but no index supports that filter at production data volume. Under real " +
  "traffic this forces a sequential scan of the employers table on every submission, saturating placement-db " +
  "and pushing p95 API latency from ~180ms to ~4.8s with an 18% request failure rate from timeouts.";

export const contributingFactorSummary =
  "Pre-deploy performance testing ran against a staging dataset of roughly 500 rows, far smaller than " +
  "production's ~480,000 rows, so the missing index's effect on the query plan never showed up before the " +
  "change reached production.";
