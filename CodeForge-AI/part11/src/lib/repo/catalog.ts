import type { Pool, PoolClient } from "pg";
import {
  ActionDefinition,
  AlertRecord,
  CandidateCause,
  CandidatePreventiveAction,
  DeploymentRecord,
  IncidentTemplate,
  IncidentTemplatePublic,
  LogLine,
  MetricSeries,
  ScoringRubric,
  ServiceNode,
  StakeholderTrigger,
  TimelineEvent,
  Trace,
  TraceSpan,
} from "@/lib/engine/types";

type DB = Pool | PoolClient;

async function loadServices(db: DB, templateId: string): Promise<ServiceNode[]> {
  const res = await db.query(
    "select key, name, kind, depends_on from incident_services where template_id = $1 order by key",
    [templateId]
  );
  return res.rows.map((r) => ({ key: r.key, name: r.name, kind: r.kind, dependsOn: r.depends_on ?? [] }));
}

async function loadTimeline(db: DB, templateId: string): Promise<TimelineEvent[]> {
  const res = await db.query(
    "select offset_minutes, label, detail, event_kind from incident_timeline_events where template_id = $1 order by offset_minutes",
    [templateId]
  );
  return res.rows.map((r) => ({
    offsetMinutes: Number(r.offset_minutes),
    label: r.label,
    detail: r.detail ?? undefined,
    eventKind: r.event_kind,
  }));
}

async function loadDeployments(db: DB, templateId: string): Promise<DeploymentRecord[]> {
  const res = await db.query(
    "select id, service_key, version, offset_minutes, change_summary, status, commit_ref from incident_deployments where template_id = $1 order by offset_minutes",
    [templateId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    serviceKey: r.service_key,
    version: r.version,
    offsetMinutes: Number(r.offset_minutes),
    changeSummary: r.change_summary,
    status: r.status,
    commitRef: r.commit_ref ?? undefined,
  }));
}

async function loadAlerts(db: DB, templateId: string): Promise<AlertRecord[]> {
  const res = await db.query(
    "select id, alert_type, severity, offset_minutes, service_key, message, trigger_condition from incident_alerts where template_id = $1 order by offset_minutes",
    [templateId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    alertType: r.alert_type,
    severity: r.severity,
    offsetMinutes: Number(r.offset_minutes),
    serviceKey: r.service_key ?? undefined,
    message: r.message,
    triggerCondition: r.trigger_condition,
  }));
}

function mapLogRow(r: Record<string, unknown>): LogLine {
  return {
    id: r.id as string,
    offsetSeconds: Number(r.offset_seconds),
    serviceKey: r.service_key as string,
    level: r.level as LogLine["level"],
    requestId: (r.request_id as string) ?? undefined,
    traceId: (r.trace_id as string) ?? undefined,
    endpoint: (r.endpoint as string) ?? undefined,
    statusCode: r.status_code === null ? undefined : Number(r.status_code),
    durationMs: r.duration_ms === null ? undefined : Number(r.duration_ms),
    message: r.message as string,
    errorCode: (r.error_code as string) ?? undefined,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}

async function loadLogLines(db: DB, templateId: string): Promise<LogLine[]> {
  const res = await db.query("select * from incident_log_lines where template_id = $1 order by offset_seconds", [
    templateId,
  ]);
  return res.rows.map(mapLogRow);
}

async function loadTraces(db: DB, templateId: string): Promise<Trace[]> {
  const tRes = await db.query(
    "select id, trace_key, label, offset_seconds, total_duration_ms, status from incident_traces where template_id = $1 order by offset_seconds",
    [templateId]
  );
  const traces: Trace[] = [];
  for (const t of tRes.rows) {
    const sRes = await db.query(
      "select span_key, parent_span_key, service_key, operation, start_offset_ms, duration_ms, status from incident_trace_spans where trace_id = $1 order by start_offset_ms",
      [t.id]
    );
    const spans: TraceSpan[] = sRes.rows.map((s) => ({
      spanKey: s.span_key,
      parentSpanKey: s.parent_span_key ?? undefined,
      serviceKey: s.service_key,
      operation: s.operation,
      startOffsetMs: Number(s.start_offset_ms),
      durationMs: Number(s.duration_ms),
      status: s.status,
    }));
    traces.push({
      traceKey: t.trace_key,
      label: t.label,
      offsetSeconds: Number(t.offset_seconds),
      totalDurationMs: Number(t.total_duration_ms),
      status: t.status,
      spans,
    });
  }
  return traces;
}

async function loadMetricSeries(db: DB, templateId: string): Promise<MetricSeries> {
  const res = await db.query(
    "select service_key, metric_name, offset_minutes, value from incident_metric_points where template_id = $1 order by service_key, metric_name, offset_minutes",
    [templateId]
  );
  const series: MetricSeries = {};
  for (const r of res.rows) {
    const key = `${r.service_key}:${r.metric_name}`;
    (series[key] ??= []).push({ offsetMinutes: Number(r.offset_minutes), value: Number(r.value) });
  }
  return series;
}

async function loadActionDefsFull(db: DB, templateId: string): Promise<ActionDefinition[]> {
  const res = await db.query("select * from incident_action_defs where template_id = $1", [templateId]);
  return res.rows.map((r) => ({
    actionType: r.action_type,
    targetServiceKey: r.target_service_key ?? undefined,
    risk: r.risk,
    requiresConfirmation: r.requires_confirmation,
    simMinutesCost: Number(r.sim_minutes_cost),
    description: r.description,
    expectedEffect: r.expected_effect,
    validity: r.validity,
    isMitigation: r.is_mitigation,
    isPermanentFix: r.is_permanent_fix,
    consequence: r.consequence ?? {},
  }));
}

async function loadStakeholderTriggers(db: DB, templateId: string): Promise<StakeholderTrigger[]> {
  const res = await db.query(
    "select persona, trigger_after_minutes, prompt, requires_fields from incident_stakeholder_triggers where template_id = $1 order by trigger_after_minutes",
    [templateId]
  );
  return res.rows.map((r) => ({
    persona: r.persona,
    triggerAfterMinutes: Number(r.trigger_after_minutes),
    prompt: r.prompt,
    requiresFields: r.requires_fields ?? [],
  }));
}

/** Full hydration INCLUDING hidden ground truth. Server-only — never send
 * the return value of this function to the client directly. */
export async function getFullTemplateBySlug(db: DB, slug: string): Promise<IncidentTemplate | null> {
  const tRes = await db.query("select * from incident_templates where slug = $1", [slug]);
  const t = tRes.rows[0];
  if (!t) return null;

  const [services, timeline, deployments, alerts, logLines, traces, metricSeries, actionDefs, stakeholderTriggers] =
    await Promise.all([
      loadServices(db, t.id),
      loadTimeline(db, t.id),
      loadDeployments(db, t.id),
      loadAlerts(db, t.id),
      loadLogLines(db, t.id),
      loadTraces(db, t.id),
      loadMetricSeries(db, t.id),
      loadActionDefsFull(db, t.id),
      loadStakeholderTriggers(db, t.id),
    ]);

  return {
    id: t.id,
    slug: t.slug,
    incidentType: t.incident_type,
    difficulty: t.difficulty,
    title: t.title,
    severity: t.severity,
    description: t.description,
    businessImpact: t.business_impact,
    targetRole: t.target_role,
    targetSkills: t.target_skills ?? [],
    incidentStartedOffsetMinutes: Number(t.incident_started_offset_minutes),
    rootCauseKey: t.root_cause_key,
    rootCauseSummary: t.root_cause_summary,
    contributingFactorSummary: t.contributing_factor_summary,
    candidateCauseKeys: t.candidate_cause_keys as CandidateCause[],
    expectedEvidenceKeys: t.expected_evidence_keys ?? [],
    candidatePreventiveActions: t.candidate_preventive_actions as CandidatePreventiveAction[],
    preventiveActionKeys: t.preventive_action_keys ?? [],
    scoringRubric: t.scoring_rubric as ScoringRubric,
    escalationRules: t.escalation_rules ?? [],
    services,
    timeline,
    deployments,
    alerts,
    logLines,
    traces,
    metricSeries,
    actionDefs,
    stakeholderTriggers,
    published: t.published,
  };
}

/** Public-safe hydration for the client — reads only from the *_public
 * views and the non-hidden catalog tables. Suitable to serialize and send
 * to the browser at any point, including before the incident is solved. */
export async function getPublicTemplateBySlug(db: DB, slug: string): Promise<IncidentTemplatePublic | null> {
  const tRes = await db.query("select * from incident_template_public where slug = $1", [slug]);
  const t = tRes.rows[0];
  if (!t) return null;

  const fullForId = await db.query("select id from incident_templates where slug = $1", [slug]);
  const templateId = fullForId.rows[0]?.id;
  if (!templateId) return null;

  const [services, timeline, deployments, alerts, logLines, traces, metricSeries, actionDefsFull, stakeholderTriggers] =
    await Promise.all([
      loadServices(db, templateId),
      loadTimeline(db, templateId),
      loadDeployments(db, templateId),
      loadAlerts(db, templateId),
      loadLogLines(db, templateId),
      loadTraces(db, templateId),
      loadMetricSeries(db, templateId),
      db.query("select * from incident_action_defs_public where template_id = $1", [templateId]),
      loadStakeholderTriggers(db, templateId),
    ]);

  const fullTemplate = await getFullTemplateBySlug(db, slug); // service-side only, for candidateCauseKeys stripping below
  const publicCauseKeys = (fullTemplate?.candidateCauseKeys ?? []).map(({ key, label, category }) => ({
    key,
    label,
    category,
  }));
  const publicPreventiveActions = (fullTemplate?.candidatePreventiveActions ?? []).map(({ key, label }) => ({
    key,
    label,
  }));

  return {
    id: t.id,
    slug: t.slug,
    incidentType: t.incident_type,
    difficulty: t.difficulty,
    title: t.title,
    severity: t.severity,
    description: t.description,
    businessImpact: t.business_impact,
    targetRole: t.target_role,
    targetSkills: t.target_skills ?? [],
    incidentStartedOffsetMinutes: Number(t.incident_started_offset_minutes),
    services,
    timeline,
    deployments,
    alerts,
    logLines,
    traces,
    metricSeries,
    actionDefs: (actionDefsFull.rows as Record<string, unknown>[]).map((r) => ({
      actionType: r.action_type as ActionDefinition["actionType"],
      targetServiceKey: (r.target_service_key as string) ?? undefined,
      risk: r.risk as ActionDefinition["risk"],
      requiresConfirmation: r.requires_confirmation as boolean,
      simMinutesCost: Number(r.sim_minutes_cost),
      description: r.description as string,
      expectedEffect: r.expected_effect as string,
    })),
    stakeholderTriggers,
    candidateCauseKeys: publicCauseKeys,
    candidatePreventiveActions: publicPreventiveActions,
    published: t.published,
  };
}
