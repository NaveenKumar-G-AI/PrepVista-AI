# API source inventory
Generated from Python AST decorators. Dependency expressions are source declarations, not proof of correct authorization. Frontend consumers are principally frontend/src/lib/api.ts and route/module callers.
| File | Method | Relative route | Handler | Declared dependencies |
|---|---|---|---|---|
| app/routers/account.py | DELETE | '/me' | delete_account | Depends(get_current_user) |
| app/routers/admin.py | GET | '/overview' | get_admin_overview | Depends(require_admin) |
| app/routers/admin.py | POST | '/launch-offers/reset' | reset_launch_offers | Depends(require_admin) |
| app/routers/admin.py | POST | '/launch-offers/{grant_id}/approve' | approve_launch_offer | Depends(require_admin) |
| app/routers/admin.py | POST | '/launch-offers/{grant_id}/reject' | reject_launch_offer | Depends(require_admin) |
| app/routers/admin_grants.py | POST | '' | grant_admin_access | Depends(require_admin) |
| app/routers/admin_support.py | GET | '/users' | get_support_users | Depends(require_admin) |
| app/routers/admin_support.py | GET | '/{target_user_id}' | get_user_thread | Depends(require_admin) |
| app/routers/admin_support.py | POST | '/{target_user_id}' | send_admin_reply | Depends(require_admin) |
| app/routers/admin_support.py | POST | '/{target_user_id}/archive' | archive_user_thread | Depends(require_admin) |
| app/routers/admin_support.py | POST | '/{target_user_id}/unarchive' | unarchive_user_thread | Depends(require_admin) |
| app/routers/ai_health.py | GET | '/health' | all_provider_health | Depends(require_org_admin()) |
| app/routers/ai_health.py | GET | '/health/{provider_name}' | single_provider_health | Depends(require_org_admin()) |
| app/routers/artifact_reviews.py | GET | '/options' | options | Depends(get_current_user) |
| app/routers/artifact_reviews.py | POST | '' | create | Depends(require_sync) |
| app/routers/artifact_reviews.py | GET | '/mine' | mine | Depends(get_current_user) |
| app/routers/artifact_reviews.py | POST | '/{review_id}/withdraw' | withdraw | Depends(get_current_user) |
| app/routers/artifact_reviews.py | GET | '/inbox' | inbox | Depends(get_current_user) |
| app/routers/artifact_reviews.py | GET | '/{review_id}/artifact' | review_artifact | Depends(get_current_user) |
| app/routers/artifact_reviews.py | POST | '/{review_id}/feedback' | submit | Depends(get_current_user) |
| app/routers/assessments.py | POST | '/' | create_assessment | Depends(require_org_admin()) |
| app/routers/assessments.py | POST | '/{assessment_id:uuid}/versions' | create_assessment_version | Depends(require_org_admin()) |
| app/routers/assessments.py | POST | '/versions/{version_id:uuid}/publish' | publish_version | Depends(require_org_admin()) |
| app/routers/auth.py | POST | '/account-status' | account_status | Inspect router/handler |
| app/routers/auth.py | POST | '/signup/request-code' | request_signup_code | Inspect router/handler |
| app/routers/auth.py | POST | '/signup' | signup | Inspect router/handler |
| app/routers/auth.py | POST | '/login' | login | Inspect router/handler |
| app/routers/auth.py | POST | '/oauth/complete' | complete_oauth_login | Inspect router/handler |
| app/routers/auth.py | POST | '/refresh' | refresh_token | Inspect router/handler |
| app/routers/auth.py | POST | '/onboarding' | complete_onboarding | Depends(get_current_user) |
| app/routers/auth.py | GET | '/me' | get_me | Depends(get_current_user) |
| app/routers/billing.py | POST | '/create-order' | create_razorpay_order | Depends(get_current_user) |
| app/routers/billing.py | POST | '/verify-payment' | verify_razorpay_payment | Depends(get_current_user) |
| app/routers/billing.py | POST | '/switch-plan' | switch_active_plan | Depends(get_current_user) |
| app/routers/billing.py | POST | '/webhook' | razorpay_webhook | Inspect router/handler |
| app/routers/billing.py | GET | '/status' | get_billing_status | Depends(get_current_user) |
| app/routers/billing.py | POST | '/status/sync' | sync_billing_status | Depends(get_current_user) |
| app/routers/coding.py | GET | '/access' | coding_access | Depends(get_current_user) |
| app/routers/coding.py | POST | '/artifacts/{artifact_id}/validate' | request_validation | Depends(require_sync) |
| app/routers/coding.py | GET | '/artifacts/{artifact_id}/validations' | validation_history | Depends(get_current_user) |
| app/routers/coding.py | GET | '/validations' | all_validation_history | Depends(get_current_user) |
| app/routers/coding.py | GET | '/validations/{job_id}' | validation_receipt | Depends(get_current_user) |
| app/routers/coding.py | GET | '/workspace' | get_workspace | Depends(require_sync) |
| app/routers/coding.py | PUT | '/workspace' | save_workspace | Depends(require_sync) |
| app/routers/coding.py | GET | '/recovery' | recovery | Depends(get_current_user) |
| app/routers/coding.py | POST | '/imports/preview' | preview_import | Depends(require_sync) |
| app/routers/coding.py | POST | '/imports/{import_id}/commit' | commit_import | Depends(require_sync) |
| app/routers/coding.py | POST | '/artifacts' | save_artifact | Depends(require_sync) |
| app/routers/coding.py | GET | '/artifacts' | list_artifacts | Depends(require_sync) |
| app/routers/coding.py | GET | '/artifacts/{artifact_id}' | get_artifact | Depends(require_sync) |
| app/routers/coding.py | POST | '/mentor' | ask_mentor | Depends(require_sync) |
| app/routers/coding.py | GET | '/mentor/{request_id}' | mentor_status | Depends(require_sync) |
| app/routers/communications.py | GET | '/messages' | list_messages | Depends(require_org_admin()) |
| app/routers/communications.py | POST | '/messages' | send_message | Depends(require_org_admin()) |
| app/routers/communications.py | POST | '/draft' | draft_message | Depends(require_org_admin()) |
| app/routers/communications.py | GET | '/issues' | list_issues | Depends(require_org_admin()) |
| app/routers/communications.py | POST | '/issues/{issue_id:uuid}/respond' | respond_to_issue | Depends(require_org_admin()) |
| app/routers/communications.py | GET | '/memberships' | list_my_communication_memberships | Depends(get_current_user) |
| app/routers/communications.py | GET | '/inbox' | get_inbox | Depends(get_current_user) |
| app/routers/communications.py | POST | '/inbox/{message_id:uuid}/open' | mark_opened | Depends(get_current_user) |
| app/routers/communications.py | POST | '/inbox/{message_id:uuid}/acknowledge' | acknowledge_message | Depends(get_current_user) |
| app/routers/communications.py | POST | '/issues/mine' | create_my_issue | Depends(get_current_user) |
| app/routers/communications.py | GET | '/issues/mine' | list_my_issues | Depends(get_current_user) |
| app/routers/dashboard.py | GET | '' | get_dashboard | Depends(get_current_user) |
| app/routers/dashboard.py | GET | '/public-growth' | get_public_growth_banner | Inspect router/handler |
| app/routers/dashboard.py | GET | '/sessions' | get_session_history | Depends(get_current_user) |
| app/routers/dashboard.py | POST | '/sessions/bulk-delete' | bulk_delete_session_history | Depends(get_current_user) |
| app/routers/dashboard.py | DELETE | '/sessions/{session_id}' | delete_session_history | Depends(get_current_user) |
| app/routers/dashboard.py | GET | '/skills' | get_skill_breakdown | Depends(get_current_user) |
| app/routers/events.py | POST | '/track' | track_event | Inspect router/handler |
| app/routers/feedback.py | GET | '' | get_feedback_entries | Depends(get_current_user) |
| app/routers/feedback.py | POST | '' | submit_feedback | Depends(get_current_user) |
| app/routers/interview_practice.py | POST | '/{session_id}/retry-answer' | retry_answer | Depends(get_current_user) |
| app/routers/interview_practice.py | GET | '/practice/stories' | stories | Depends(get_current_user) |
| app/routers/interview_practice.py | POST | '/practice/stories' | save_story | Depends(get_current_user) |
| app/routers/interview_practice.py | DELETE | '/practice/stories/{story_id}' | delete_story | Depends(get_current_user) |
| app/routers/interview_practice.py | GET | '/practice/progress' | practice_progress | Depends(get_current_user) |
| app/routers/interviews_answer.py | POST | '/{session_id}/answer' | submit_answer | Depends(get_current_user) |
| app/routers/interviews_session.py | POST | '/setup' | setup_interview | Depends(get_current_user) |
| app/routers/interviews_session.py | POST | '/{session_id}/finish' | end_interview | Depends(get_current_user) |
| app/routers/interviews_session.py | POST | '/{session_id}/terminate' | terminate_interview | Depends(get_current_user) |
| app/routers/interviews_session.py | POST | '/{session_id}/violation' | log_proctoring_violation | Depends(get_current_user) |
| app/routers/interviews_session.py | GET | '/{session_id}/state' | get_interview_state | Depends(get_current_user) |
| app/routers/journey.py | GET | '/current' | current | Depends(require_journey) |
| app/routers/journey.py | GET | '/snapshots' | snapshot_history | Depends(get_current_user) |
| app/routers/journey.py | GET | '/snapshots/{snapshot_id}' | get_snapshot | Depends(get_current_user) |
| app/routers/journey.py | GET | '/snapshots/{snapshot_id}/export' | export_report | Depends(get_current_user) |
| app/routers/journey.py | POST | '/missions/{mission_id}/decision' | mission_decision | Depends(require_journey) |
| app/routers/journey.py | GET | '/missions/{mission_id}' | mission_context | Depends(get_current_user) |
| app/routers/journey.py | POST | '/missions/{mission_id}/launch' | launch_mission | Depends(require_journey) |
| app/routers/journey.py | GET | '/sharing' | sharing_options | Depends(get_current_user) |
| app/routers/journey.py | PUT | '/sharing' | sharing | Depends(get_current_user) |
| app/routers/journey.py | GET | '/cohort' | cohort | Depends(require_org_admin()) |
| app/routers/journey_assignments.py | GET | '/assignments/options' | options | Depends(require_staff) |
| app/routers/journey_assignments.py | POST | '/assignments' | create | Depends(require_staff) |
| app/routers/journey_assignments.py | GET | '/assignments/staff' | staff_list | Depends(require_staff) |
| app/routers/journey_assignments.py | POST | '/assignments/{assignment_id}/cancel' | cancel | Depends(require_staff) |
| app/routers/journey_assignments.py | GET | '/assignments/mine' | mine | Depends(get_current_user) |
| app/routers/journey_assignments.py | POST | '/assignments/{assignment_id}/accept' | accept | Depends(require_journey) |
| app/routers/journey_assignments.py | POST | '/assignments/{assignment_id}/withdraw' | withdraw | Depends(get_current_user) |
| app/routers/offers.py | GET | '/seasons' | list_placement_seasons | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/seasons' | create_placement_season | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/seasons/{season_id:uuid}/close' | close_placement_season | Depends(require_org_admin()) |
| app/routers/offers.py | GET | '' | list_offers | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '' | create_offer | Depends(require_org_admin()) |
| app/routers/offers.py | GET | '/{offer_id:uuid}' | get_offer | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/{offer_id:uuid}/status' | transition_offer | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/{offer_id:uuid}/joining' | update_joining | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/{offer_id:uuid}/documents' | upload_offer_evidence | Depends(require_org_admin()) |
| app/routers/offers.py | POST | '/{offer_id:uuid}/documents/{document_id:uuid}/verify' | verify_offer_evidence | Depends(require_org_admin()) |
| app/routers/offers.py | GET | '/{offer_id:uuid}/documents/{document_id:uuid}/download' | get_offer_evidence_download | Depends(require_org_admin()) |
| app/routers/offers.py | GET | '/analytics/summary' | get_offers_summary | Depends(require_org_admin()) |
| app/routers/offers.py | GET | '/analytics/insights' | get_offers_insights | Depends(require_org_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/{org_id}/students' | get_org_students_admin | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/{org_id}/analytics' | get_org_analytics_admin | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/{org_id}/access-log' | get_org_access_log_admin | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/dashboard' | org_admin_dashboard | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/{org_id}/performance' | get_org_performance_admin | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/{org_id}/readiness' | get_org_readiness_admin | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/summary-analytics' | org_summary_analytics | Depends(require_main_admin()) |
| app/routers/org_admin_analytics.py | GET | '/organizations/export' | export_organizations | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | POST | '/organizations/{org_id}/assign-plan' | assign_org_plan | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | POST | '/organizations/{org_id}/record-payment' | record_org_payment | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | POST | '/organizations/{org_id}/revoke-plan' | revoke_org_plan | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | POST | '/organizations/{org_id}/grant-all-access' | grant_all_org_access | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | POST | '/organizations/{org_id}/revoke-all-access' | revoke_all_org_access | Depends(require_main_admin()) |
| app/routers/org_admin_billing.py | GET | '/organizations/{org_id}/billing' | get_org_billing_admin | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | POST | '/organizations' | create_organization | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | GET | '/organizations' | list_organizations | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | GET | '/organizations/{org_id}' | get_organization | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | PUT | '/organizations/{org_id}' | update_organization | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | POST | '/organizations/{org_id}/suspend' | suspend_organization | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | POST | '/organizations/{org_id}/activate' | activate_organization | Depends(require_main_admin()) |
| app/routers/org_admin_orgs.py | DELETE | '/organizations/{org_id}' | delete_organization | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | POST | '/admins' | create_org_admin | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | GET | '/admins' | list_org_admins | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | GET | '/admins/{admin_id}' | get_org_admin_detail | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | PUT | '/admins/{admin_id}' | update_org_admin | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | POST | '/admins/{admin_id}/disable' | disable_org_admin | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | POST | '/admins/{admin_id}/enable' | enable_org_admin | Depends(require_main_admin()) |
| app/routers/org_admin_users.py | POST | '/admins/{admin_id}/reset-password' | reset_org_admin_password | Depends(require_main_admin()) |
| app/routers/org_college_analytics.py | GET | '/dashboard' | college_dashboard | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/analytics' | college_analytics | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/analytics/performance' | analytics_performance | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/analytics/growth' | analytics_growth | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/analytics/readiness' | analytics_readiness | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/students/{student_id}/performance' | student_performance | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/access-control' | access_control_summary | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/reports/export' | export_student_reports | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | POST | '/reports/schedule' | schedule_student_report | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/reports/cohort-export' | export_cohort_report | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/command-centre' | command_centre | Depends(require_org_admin()) |
| app/routers/org_college_analytics.py | GET | '/leaderboard' | leaderboard | Depends(require_org_admin()) |
| app/routers/org_college_config.py | GET | '/departments' | list_departments | Depends(require_org_admin()) |
| app/routers/org_college_config.py | POST | '/departments' | create_department | Depends(require_org_admin()) |
| app/routers/org_college_config.py | PUT | '/departments/{dept_id}' | update_department | Depends(require_org_admin()) |
| app/routers/org_college_config.py | DELETE | '/departments/{dept_id}' | delete_department | Depends(require_org_admin()) |
| app/routers/org_college_config.py | GET | '/years' | list_years | Depends(require_org_admin()) |
| app/routers/org_college_config.py | POST | '/years' | create_year | Depends(require_org_admin()) |
| app/routers/org_college_config.py | PUT | '/years/{year_id}' | update_year | Depends(require_org_admin()) |
| app/routers/org_college_config.py | DELETE | '/years/{year_id}' | delete_year | Depends(require_org_admin()) |
| app/routers/org_college_config.py | POST | '/years/reorder' | reorder_years | Depends(require_org_admin()) |
| app/routers/org_college_config.py | GET | '/batches' | list_batches | Depends(require_org_admin()) |
| app/routers/org_college_config.py | POST | '/batches' | create_batch | Depends(require_org_admin()) |
| app/routers/org_college_config.py | PUT | '/batches/{batch_id}' | update_batch | Depends(require_org_admin()) |
| app/routers/org_college_config.py | DELETE | '/batches/{batch_id}' | delete_batch | Depends(require_org_admin()) |
| app/routers/org_college_config.py | GET | '/access-log' | college_access_log | Depends(require_org_admin()) |
| app/routers/org_college_config.py | GET | '/billing' | college_billing | Depends(require_org_admin()) |
| app/routers/org_college_students.py | GET | '/students' | list_students | Depends(require_org_admin()) |
| app/routers/org_college_students.py | POST | '/students' | add_student | Depends(require_org_admin()) |
| app/routers/org_college_students.py | GET | '/students/{student_id}' | get_student | Depends(require_org_admin()) |
| app/routers/org_college_students.py | PUT | '/students/{student_id}' | update_student | Depends(require_org_admin()) |
| app/routers/org_college_students.py | DELETE | '/students/{student_id}' | remove_student | Depends(require_org_admin()) |
| app/routers/org_college_students.py | POST | '/students/{student_id}/grant-access' | grant_career_access | Depends(require_org_admin()) |
| app/routers/org_college_students.py | POST | '/students/{student_id}/revoke-access' | revoke_career_access | Depends(require_org_admin()) |
| app/routers/org_college_students.py | POST | '/students/bulk' | bulk_upload_students | Depends(require_org_admin()) |
| app/routers/outcomes.py | POST | '/submit' | submit_outcome | Depends(require_org_admin()) |
| app/routers/outcomes.py | POST | '/calibrate/{company_name}' | calibrate_company | Depends(require_org_admin()) |
| app/routers/placement_drives.py | GET | '/summary' | drives_summary | Depends(require_org_admin()) |
| app/routers/placement_drives.py | GET | '' | list_drives | Depends(require_org_admin()) |
| app/routers/placement_drives.py | POST | '' | create_drive | Depends(require_org_admin()) |
| app/routers/placement_drives.py | GET | '/{drive_id}' | get_drive | Depends(require_org_admin()) |
| app/routers/placement_drives.py | POST | '/{drive_id}/status' | transition_drive_status | Depends(require_org_admin()) |
| app/routers/placement_drives.py | POST | '/{drive_id}/rules' | add_rule_version | Depends(require_org_admin()) |
| app/routers/placement_drives.py | POST | '/{drive_id}/snapshot' | compute_snapshot | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '/rounds/{drive_id}' | list_rounds | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/rounds/{drive_id}' | create_round | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '' | list_interviews | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '' | schedule_interview | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '/results/pending' | pending_results_workbench | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '/results/pending-review' | pending_review | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/results/import' | import_results | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/results/publish-batch' | publish_results_batch | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '/{interview_id:uuid}' | get_interview | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/attendance' | record_attendance | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/status' | transition_interview_status | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/results' | enter_result | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/results/review' | review_result | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/results/publish' | publish_result | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | GET | '/analytics/summary' | analytics_summary | Depends(require_org_admin()) |
| app/routers/placement_interviews.py | POST | '/{interview_id:uuid}/issues/{issue_id:uuid}/resolve' | resolve_issue | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | GET | '/pulse' | recruiter_pulse | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | GET | '' | list_recruiter_companies | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '' | create_recruiter_company | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | GET | '/{company_id}' | get_recruiter_company | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '/{company_id}/stage' | change_company_stage | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '/{company_id}/contacts' | add_recruiter_contact | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '/{company_id}/activities' | log_recruiter_activity | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '/{company_id}/followups' | create_recruiter_followup | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | POST | '/{company_id}/notes' | add_company_note | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | GET | '' | followup_command_centre | Depends(require_org_admin()) |
| app/routers/recruiter_companies.py | PATCH | '/{followup_id}/complete' | complete_followup | Depends(require_org_admin()) |
| app/routers/referrals.py | GET | '/me' | get_my_referrals | Depends(get_current_user) |
| app/routers/referrals.py | GET | '/public/{referral_code}' | get_public_referral | Inspect router/handler |
| app/routers/referrals.py | POST | '/queue' | queue_referral_email | Inspect router/handler |
| app/routers/reports.py | GET | '/{session_id}' | get_report | Depends(get_current_user) |
| app/routers/reports.py | GET | '/{session_id}/pdf' | download_pdf | Depends(require_plan('pro')) |
| app/routers/reports.py | POST | '/{session_id}/share' | create_share_link | Depends(get_current_user) |
| app/routers/reports.py | GET | '/shared/{share_token}' | get_shared_report | Inspect router/handler |
| app/routers/stt_ws.py | WEBSOCKET | '/ws/stt/{session_id}' | stt_websocket | Inspect router/handler |
| app/routers/stt_ws.py | POST | '/api/stt/transcribe' | stt_transcribe_rest | Depends(get_current_user) |
| app/routers/support.py | GET | '/me' | get_my_chat_history | Depends(get_current_user) |
| app/routers/support.py | POST | '/me' | send_support_message | Depends(get_current_user) |
| app/routers/tpo_config.py | GET | '/placement-config' | get_placement_config | Depends(require_org_admin()) |
| app/routers/tpo_config.py | PUT | '/placement-config' | update_placement_config | Depends(require_org_admin()) |
| app/routers/training.py | POST | '/programs' | create_program | Depends(require_org_admin()) |
| app/routers/training.py | POST | '/programs/{program_id:uuid}/transition' | transition_program | Depends(require_org_admin()) |
| app/routers/training.py | GET | '/programs/{program_id:uuid}' | get_program | Depends(require_org_admin()) |
| app/routers/training.py | POST | '/programs/{program_id:uuid}/sessions' | create_session | Depends(require_org_admin()) |


## Recovery contract additions

POST /reports/{session_id}/retry-evaluations: authenticated owner only, FINISHED session, existing rate limit, no client-supplied score/text, idempotent missing-work enqueue, five-minute failed-job cooldown, returns queued count. No interview credit is consumed.

Owner reports add evaluation_status, report_state, report_version, pending_evaluations and failed_evaluations. final_score is nullable. The report summary separates answered_questions/evaluated_questions/evaluation_coverage. Shared reports and PDFs use the same scored-evidence contract. History and recent-session lists recompute authorized session scores in bounded batch reads; genuine zero remains zero.
