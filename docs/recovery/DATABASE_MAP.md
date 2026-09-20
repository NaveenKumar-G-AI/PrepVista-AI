# Migration source inventory
42 migrations at baseline. No production migration ledger available. Account owner is profiles.id, Supabase auth mapping is resolved by dependencies.py. No independent candidate table identified in the interview path. Session/turn is the legacy question-evaluation key; V2 question IDs additionally live in runtime JSON.
| Migration | Created tables (source scan) |
|---|---|
| 001_initial_schema.sql | institutions, profiles, auth_identity_links, institution_admins, interview_sessions, conversation_messages, question_evaluations, skill_scores, answer_quality_flags, cohort_snapshots, usage_events, product_funnel_events, payments, user_plan_entitlements, user_purchase_stats, billing_events, referrals, feedback_entries, reports |
| 002_profile_referral.sql | ALTER / functions / indexes / policies |
| 003_interview_runtime.sql | ALTER / functions / indexes / policies |
| 004_free_evaluation.sql | ALTER / functions / indexes / policies |
| 005_user_activity.sql | ALTER / functions / indexes / policies |
| 006_plan_lifecycle.sql | ALTER / functions / indexes / policies |
| 007_account_archive.sql | ALTER / functions / indexes / policies |
| 008_public_growth.sql | public_growth_metrics |
| 009_launch_offer.sql | launch_offer_settings, launch_offer_grants |
| 010_cascade_fixes.sql | ALTER / functions / indexes / policies |
| 011_revenue_analytics.sql | user_revenue_analytics |
| 012_admin_bonus.sql | admin_bonus_grants |
| 013_email_verification.sql | manual_signup_verification_codes |
| 014_support_chat.sql | support_messages |
| 015_report_sharing.sql | ALTER / functions / indexes / policies |
| 016_interview_types.sql | interview_type_definitions |
| 017_college_organization.sql | organizations, organization_admins, college_departments, college_years, college_batches, organization_students, organization_access_log, org_plan_allocations, webhook_events, org_payments, org_admin_invites, org_cohort_snapshots |
| 018_performance_indexes.sql | ALTER / functions / indexes / policies |
| 019_answer_quality_flags.sql | answer_quality_flags |
| 020_question_evaluations_unique_turn.sql | ALTER / functions / indexes / policies |
| 021_transcript_repair_audit.sql | ALTER / functions / indexes / policies |
| 022_placement_calibration.sql | placement_outcomes, placement_parameters |
| 023_audio_audit_trail.sql | interview_audio_turns |
| 024_college_placement_config.sql | college_placement_config |
| 025_recruiter_companies.sql | recruiter_industries, recruiter_companies, recruiter_contacts, recruiter_activities, recruiter_followups, recruiter_company_notes, recruiter_status_history |
| 026_placement_drives.sql | placement_drives, drive_eligibility_rule_versions, drive_eligibility_snapshots, drive_audit_log |
| 027_placement_interviews.sql | drive_round_executions, placement_interviews, placement_interview_results, placement_interview_issues, placement_interview_audit, placement_interview_events |
| 028_offers_joining_placement.sql | offers, offer_versions, offer_documents, joining_records, student_placement_outcomes, institution_offer_policy |
| 029_training_readiness.sql | ALTER / functions / indexes / policies |
| 030_org_communications.sql | org_communications, org_communication_recipients, org_communication_issues |
| 031_training_and_drive_integrity.sql | ALTER / functions / indexes / policies |
| 032_placement_seasons.sql | placement_seasons |
| 033_reconcile_org_student_integrity.sql | ALTER / functions / indexes / policies |
| 034_payment_order_idempotency.sql | ALTER / functions / indexes / policies |
| 035_org_report_schedules.sql | org_report_schedules |
| 036_interview_answer_receipts.sql | interview_answer_receipts |
| 037_interview_coaching_v2.sql | interview_answer_retries, interview_stories |
| 038_unified_coding.sql | coding_workspaces, coding_artifacts, coding_imports, unified_evidence_events, unified_observations, unified_deletion_tombstones, unified_readiness_snapshots, practice_missions, coding_ai_requests, unified_sharing |
| 039_unified_assignments.sql | unified_assignment_batches, unified_assignment_links |
| 040_coding_validation.sql | coding_validation_jobs |
| 041_unified_evidence_recovery.sql | unified_evidence_recovery_audit |
| 042_artifact_review_consent.sql | artifact_review_requests, artifact_review_feedback, artifact_review_audit |


## Recovery migrations (not applied remotely)

043 expands legacy evaluation/skill rubric constraints without deleting scores. 044 adds nullable evaluation provenance, durable interview_evaluation_jobs, an answer-triggered transactional queue and browser-denying RLS. 045 removes direct browser writes to server-owned profiles and interview sessions while retaining SELECT policies. The migration planner now inventories 045 and includes these files in its explicit reviewed scope.

Verified locally: additive 043 upgrade and replay; 044 answer/job atomicity, retries and recovery; 045 browser role denial; actual 001 schema plus the interview prerequisite migrations through the full deterministic lifecycle. The entire historical 001-045 installation chain, all deployment-specific role grants and legacy institutional snapshots have not been certified by this pass.
