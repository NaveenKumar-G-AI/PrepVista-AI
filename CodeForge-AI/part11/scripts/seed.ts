import dotenv from "dotenv";
import path from "path";
import type { Pool } from "pg";
import { IncidentTemplate } from "@/lib/engine/types";
import { ALL_TEMPLATES } from "@/content/incidents/pf-2048";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * Idempotent per-template seed: deletes any existing template with the
 * same slug (cascades to all its child rows via FK ON DELETE CASCADE)
 * and re-inserts fresh. Safe to run repeatedly, including in tests.
 */
export async function seedTemplate(db: Pool, t: IncidentTemplate): Promise<void> {
  await db.query("delete from incident_templates where slug = $1", [t.slug]);

  await db.query(
    `insert into incident_templates (
      id, slug, incident_type, difficulty, title, severity, description, business_impact,
      target_role, target_skills, incident_started_offset_minutes,
      root_cause_key, root_cause_summary, contributing_factor_summary,
      candidate_cause_keys, expected_evidence_keys, candidate_preventive_actions, preventive_action_keys,
      scoring_rubric, escalation_rules, published
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      t.id,
      t.slug,
      t.incidentType,
      t.difficulty,
      t.title,
      t.severity,
      t.description,
      t.businessImpact,
      t.targetRole,
      t.targetSkills,
      t.incidentStartedOffsetMinutes,
      t.rootCauseKey,
      t.rootCauseSummary,
      t.contributingFactorSummary,
      JSON.stringify(t.candidateCauseKeys),
      t.expectedEvidenceKeys,
      JSON.stringify(t.candidatePreventiveActions),
      t.preventiveActionKeys,
      JSON.stringify(t.scoringRubric),
      JSON.stringify(t.escalationRules),
      t.published,
    ]
  );

  for (const s of t.services) {
    await db.query(
      "insert into incident_services (template_id, key, name, kind, depends_on) values ($1,$2,$3,$4,$5)",
      [t.id, s.key, s.name, s.kind, s.dependsOn]
    );
  }

  for (const ev of t.timeline) {
    await db.query(
      "insert into incident_timeline_events (template_id, offset_minutes, label, detail, event_kind) values ($1,$2,$3,$4,$5)",
      [t.id, ev.offsetMinutes, ev.label, ev.detail ?? null, ev.eventKind]
    );
  }

  for (const d of t.deployments) {
    await db.query(
      "insert into incident_deployments (id, template_id, service_key, version, offset_minutes, change_summary, status, commit_ref) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [d.id, t.id, d.serviceKey, d.version, d.offsetMinutes, d.changeSummary, d.status, d.commitRef ?? null]
    );
  }

  for (const a of t.alerts) {
    await db.query(
      "insert into incident_alerts (id, template_id, alert_type, severity, offset_minutes, service_key, message, trigger_condition) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [a.id, t.id, a.alertType, a.severity, a.offsetMinutes, a.serviceKey ?? null, a.message, a.triggerCondition]
    );
  }

  for (const l of t.logLines) {
    await db.query(
      `insert into incident_log_lines (
        id, template_id, offset_seconds, service_key, level, request_id, trace_id, endpoint,
        status_code, duration_ms, message, error_code, metadata
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        l.id,
        t.id,
        l.offsetSeconds,
        l.serviceKey,
        l.level,
        l.requestId ?? null,
        l.traceId ?? null,
        l.endpoint ?? null,
        l.statusCode ?? null,
        l.durationMs ?? null,
        l.message,
        l.errorCode ?? null,
        JSON.stringify(l.metadata ?? {}),
      ]
    );
  }

  for (const tr of t.traces) {
    const traceRes = await db.query(
      "insert into incident_traces (template_id, trace_key, label, offset_seconds, total_duration_ms, status) values ($1,$2,$3,$4,$5,$6) returning id",
      [t.id, tr.traceKey, tr.label, tr.offsetSeconds, tr.totalDurationMs, tr.status]
    );
    const traceId = traceRes.rows[0].id;
    for (const span of tr.spans) {
      await db.query(
        "insert into incident_trace_spans (trace_id, span_key, parent_span_key, service_key, operation, start_offset_ms, duration_ms, status) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [traceId, span.spanKey, span.parentSpanKey ?? null, span.serviceKey, span.operation, span.startOffsetMs, span.durationMs, span.status]
      );
    }
  }

  for (const [key, points] of Object.entries(t.metricSeries)) {
    const [serviceKey, metricName] = key.split(/:(.+)/); // split on first ':' only
    for (const p of points) {
      await db.query(
        "insert into incident_metric_points (template_id, service_key, metric_name, offset_minutes, value) values ($1,$2,$3,$4,$5)",
        [t.id, serviceKey, metricName, p.offsetMinutes, p.value]
      );
    }
  }

  for (const ad of t.actionDefs) {
    await db.query(
      `insert into incident_action_defs (
        template_id, action_type, target_service_key, risk, requires_confirmation, sim_minutes_cost,
        description, expected_effect, validity, is_mitigation, is_permanent_fix, consequence
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        t.id,
        ad.actionType,
        ad.targetServiceKey ?? null,
        ad.risk,
        ad.requiresConfirmation,
        ad.simMinutesCost,
        ad.description,
        ad.expectedEffect,
        ad.validity,
        ad.isMitigation,
        ad.isPermanentFix,
        JSON.stringify(ad.consequence),
      ]
    );
  }

  for (const st of t.stakeholderTriggers) {
    await db.query(
      "insert into incident_stakeholder_triggers (template_id, persona, trigger_after_minutes, prompt, requires_fields) values ($1,$2,$3,$4,$5)",
      [t.id, st.persona, st.triggerAfterMinutes, st.prompt, st.requiresFields]
    );
  }
}

export async function seedAll(db: Pool): Promise<void> {
  for (const t of ALL_TEMPLATES) {
    await seedTemplate(db, t);
    console.log(`seeded template: ${t.slug}`);
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getPool } = require("../src/lib/repo/pool");
  seedAll(getPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
