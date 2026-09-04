# PrepVista AI UI Structure

Source-verified UI and data-flow reference for the current repository.

- Verified against: `frontend/src/app`, `frontend/src/components`, `frontend/src/lib/api.ts`, `frontend/public/command-centre.html`, and `frontend/public/scoreboard.html`
- Verification date: 31 August 2026
- Scope: meaningful screens, navigation, controls, states, role gates, and UI data origins. Repeated styling wrappers are intentionally omitted.
- This describes the implementation as it exists. It does not claim that a control has a backend effect unless the source actually calls an API.

## 1. Reading this document

Data-origin labels used below:

- **API**: value is returned by the backend through `frontend/src/lib/api.ts`.
- **Derived**: value is calculated in the browser from API data.
- **Static**: label, plan description, option, or marketing copy defined in the frontend.
- **Local only**: interaction changes browser state but does not persist to the backend.
- **Conditional**: rendered only when the required role, plan, quota, data, or state exists.

Dynamic route notation:

- `[id]`: one required path value.
- `[code]`: one required referral value.
- `[[...slug]]`: optional catch-all path used to open a selected analytics view.

## 2. Whole-application structure

```text
Root layout
|-- HTML metadata and favicon
|-- ThemeProvider
|   |-- reads `pv_theme` from localStorage
|   `-- supports dark and light themes
|-- AuthProvider
|   `-- shared user, tokens, role, plan, quota, login, signup, and logout state
|-- AwakeKeeper
|   `-- calls the frontend heartbeat route used to keep the service warm
|-- AmbientEffects
|-- Route content
`-- LazySupportChat
    |-- visible only to signed-in, non-platform-admin users
    |-- user/admin message thread
    |-- text message composer
    `-- optional image attachment, resized and JPEG-compressed in the browser
```

The global support widget uses `getMySupportThread` and `sendSupportMessage`. It is hidden for signed-out users and for `is_admin` platform administrators. Organization administrators are not excluded.

## 3. Roles and route ownership

| Role | Primary home | Main workspace | Additional access |
|---|---|---|---|
| Public visitor | `/` | Landing, pricing, login, referral, legal pages | None |
| Individual user | `/dashboard` | Interview practice, sessions, analytics, reports, billing, feedback, profile, settings | Platform admin pages only if `is_admin` or applicable override is present |
| Organization student | `/student-dashboard` | College-managed interview practice plus placement-office messages | Shared interview, session, analytics, report, feedback, profile, and settings pages |
| Organization administrator | `/org-admin` | College operations, cohort analytics, access, placements, offers, reports, and billing | Shared account/profile/settings routes |
| Platform administrator | `/admin` | Platform operations and college administration | Individual workspace links also remain available |

Role routing rules:

```text
Successful login/OAuth
|-- is_org_admin = true ------> /org-admin
|-- org_student = true -------> /student-dashboard
`-- otherwise ----------------> /dashboard

/student-dashboard layout
|-- signed out ----------------> /login
|-- org admin -----------------> /org-admin
`-- non-org student -----------> /dashboard

/org-admin layout
`-- user is not org admin -----> /dashboard

/dashboard
|-- org admin -----------------> /org-admin
`-- org student ---------------> /student-dashboard
```

## 4. Route tree

```text
Public and authentication
|-- /
|-- /login
|-- /auth/callback
|-- /pricing
|-- /referral/[code]
|-- /privacy
`-- /terms

Shared authenticated user workspace
|-- /dashboard
|-- /interview/setup
|-- /interview/[id]
|-- /history
|-- /analytics
|-- /feedback
|-- /profile
|-- /settings
`-- /report/[id]

Organization student workspace
|-- /student-dashboard
`-- /student-dashboard/communications

Organization administrator workspace
|-- /org-admin
|-- /org-admin/students
|-- /org-admin/students/[id]
|-- /org-admin/departments
|-- /org-admin/years-batches
|-- /org-admin/analytics/[[...slug]]
|-- /org-admin/communications
|-- /org-admin/leaderboard
|-- /org-admin/placement-config
|-- /org-admin/companies
|-- /org-admin/companies/[id]
|-- /org-admin/drives
|-- /org-admin/interviews
|-- /org-admin/offers
|-- /org-admin/access-control
|-- /org-admin/reports
|-- /org-admin/billing
`-- /org-admin/profile

Organization legacy redirects
|-- /org-admin/action-engine -------> /org-admin/interviews
|-- /org-admin/ai-officer ----------> /org-admin/communications
|-- /org-admin/forecast-strategy ---> /org-admin/analytics
|-- /org-admin/placement-radar -----> /org-admin/analytics
`-- /org-admin/system-hardening ----> /org-admin/access-control

Platform administrator workspace
|-- /admin
|-- /admin/colleges
|-- /admin/colleges/[id]
`-- /admin/college-admins

Non-visual frontend route
`-- /api/awake
```

## 5. Shared authenticated navigation

### 5.1 Auth header

```text
Authenticated header
|-- PrepVista brand -> role-aware home
|-- Desktop role-aware navigation
|-- Theme switch
|-- Profile chip -> /profile
`-- Logout
    |-- first click asks for confirmation
    `-- second click performs logout and disables duplicate submission
```

Desktop header links:

- Individual/platform user: Main, Sessions, Analytics, Billing, Feedback, Settings; Admin is appended for a platform administrator or premium override.
- Organization student: Main, Sessions, Analytics, Feedback, Settings.
- Organization administrator: Dashboard, Students, Analytics, Access, Billing, Profile.

### 5.2 Individual user side rail

```text
Practice
|-- Start Interview
|   `-- routes to Pricing when access/quota is locked
|-- Resume Session (conditional active session)
`-- Career Mode

Workspace
|-- Analytics
|-- Sessions
|-- Profile
|-- Feedback
`-- Settings

Platform administrator additions
|-- Admin
`-- Colleges

Organization administrator additions when this rail is used
|-- College Dashboard
|-- Students
|-- Org Analytics
`-- Access Control
```

Mobile rail: Home, Practice, Sessions, Analytics, Profile, plus College or Admin when applicable.

### 5.3 Organization student side rail

```text
Practice
|-- Start Interview or Start Interview (Locked)
|-- Resume Session (conditional)
`-- Career Mode

Workspace
|-- Messages
|-- Analytics
|-- Sessions
|-- Profile
|-- Feedback
`-- Settings
```

Mobile rail: Home, Practice, Messages, Sessions, Analytics, Profile.

### 5.4 Organization administrator layout

```text
AuthHeader
Organization context
|-- organization name and code
|-- active plan badge
|-- seats used / seat limit progress bar
|-- >=85% seat warning
|-- <=60-day renewal warning
`-- organization-load error with Retry

Desktop sidebar / horizontally scrollable mobile bottom navigation
|-- Dashboard
|-- Students
|-- Departments
|-- Years & Batches
|-- Analytics
|-- Communications
|-- Leaderboard
|-- Placement Config
|-- Companies
|-- Placement Drives
|-- Interviews
|-- Offers
|-- Access Control
|-- Reports
|-- Billing
`-- Profile

Main page content
`-- Back to Main -> /dashboard
```

Organization name, plan, seats, expiry, cohort average, practiced-student count, and intervention badge are loaded from `getCollegeDashboard`.

## 6. Public and authentication pages

### 6.1 Landing page — `/`

Audience: public.

```text
Top navigation
|-- Brand
|-- Pricing
|-- Login
`-- Sign up

Hero
|-- primary product statement
|-- benefit bullets
|-- launch/public-growth evidence
|-- signup/practice CTA
`-- interview visualization with waveform and coaching preview

Credibility strip
Public growth/launch-offer section
How PrepVista personalizes each mock interview
|-- Upload your resume
|-- Practice by voice
`-- Get actionable feedback

Built for more relevant, more effective interview practice
|-- Resume-based interview questions
|-- Voice-first mock interview experience
`-- Actionable AI coaching

Practice outcomes
|-- Answer clarity
|-- Response structure
|-- Speaking confidence
`-- Resume-based relevance

Privacy, clarity, and control section
Audience section
|-- Final-year students
|-- Freshers
|-- Early-career candidates
`-- Placement-focused job seekers

Final CTA
Footer
|-- Pricing
|-- Privacy
|-- Terms
`-- Cookies
```

Data and actions:

- **API**: `getPublicGrowth` supplies public counters and launch-offer state.
- **API**: `trackEvent` records landing-page views and CTA clicks.
- **Static**: feature, trust, outcome, and audience copy.
- Current source behavior: the footer's Cookies link points to `/pricing`; there is no separate cookie-policy route.

### 6.2 Login and signup — `/login`

Audience: public; an already authenticated user is redirected to the appropriate home.

```text
Brand and launch/public-growth context
Mode
|-- Login
|   |-- Email
|   |-- Password
|   `-- Sign in
`-- Signup (`?mode=signup`)
    |-- Full name
    |-- Email
    |-- Password, minimum 6 characters
    |-- required Privacy/Terms consent
    |-- Request verification code
    `-- Verification step
        |-- six-digit code
        |-- verify and create account
        |-- resend code
        `-- use a different email

Google OAuth button
Error/status messages
Login/signup mode switch
Legal footer
```

Connections: auth context `login`, `signup`, `loginWithGoogle`; `requestSignupCode`; `getPublicGrowth`.

### 6.3 OAuth callback — `/auth/callback`

```text
Signing-in spinner
`-- callback processor
    |-- reads OAuth error/code
    |-- exchanges code with Supabase or uses existing session
    |-- stores API tokens
    |-- completes backend OAuth login
    |-- refreshes current user
    `-- performs role-aware redirect
```

On failure it signs out of Supabase, clears API tokens, and redirects to `/login` with an error description.

### 6.4 Pricing — `/pricing`

Audience: public and authenticated individual users.

```text
Header / back navigation
Launch-offer banner (conditional)
Page heading and current-plan context
Plan grid
|-- Free: Rs 0/month
|   |-- 2 interviews/month
|   |-- resume-based questions
|   |-- in-app feedback
|   `-- no session history
|-- Pro: Rs 299/month
|   |-- 15 interviews/month
|   |-- detailed coaching/evaluation
|   |-- downloadable PDF reports
|   `-- history and progress access
`-- Career: Rs 699/month
    |-- unlimited interviews for one month
    |-- everything in Pro
    |-- advanced interview depth
    `-- career-level simulation

Per-plan state
|-- current/owned
|-- expired
|-- switch to an already owned active plan
`-- purchase/upgrade
```

Purchase flow:

```text
Upgrade click
-> createOrder(plan)
-> open Razorpay checkout
-> Razorpay returns order/payment/signature
-> verifyPayment(...)
-> refresh authenticated user
-> /dashboard?payment=success
```

The UI also records pricing views and upgrade clicks with `trackEvent`, and reads launch metrics from `getPublicGrowth`.

### 6.5 Referral page — `/referral/[code]`

```text
Loading
|-- invalid/unavailable referral
|   |-- explanation
|   |-- Create account
|   `-- Return home
`-- valid referral
    |-- inviter/referral identity
    |-- email reservation form
    |-- reservation status
    |-- Create account
    `-- Login
```

Connections: `getPublicReferral(code)` and `queueReferral(code, email)`.

### 6.6 Legal pages — `/privacy`, `/terms`

Both use the shared `LegalDocumentPage` shell and frontend legal-content definitions. Each provides brand/back navigation, document heading, dated legal sections, and footer navigation.

## 7. Individual and organization-student practice pages

### 7.1 Individual dashboard — `/dashboard`

Audience: signed-in users who are neither organization administrators nor organization students.

```text
AuthHeader + MainSideRail
Hero
|-- personalized greeting and goal
|-- active plan and expiry/reset details
|-- Start/Resume Interview
|-- Open Sessions
`-- Open Billing when access requires it

Conditional notices
|-- expired paid plan
|-- launch offer available
|-- trial active
|-- trial expired
|-- free-plan history limitation
`-- quota/access warning

Practice mode area
|-- plan selector
|-- selected/unlocked state
`-- recommended next step

Usage
|-- interviews used
|-- interviews remaining
|-- progress bar
|-- highest available access
|-- referral bonus
`-- low-limit warning

Referral boost
|-- referral URL
|-- Copy
|-- Preview/Open
|-- slots, reservations, and rewards
`-- recent referral activity

Quick links
|-- Analytics
|-- Sessions
|-- Billing
`-- Settings
```

All user, plan, quota, referral, active-session, and recent-session values come from `getDashboard`; displayed percentages and warnings are **Derived**.

### 7.2 Organization student dashboard — `/student-dashboard`

Audience: `org_student` only.

```text
AuthHeader + StudentSideRail
College-managed hero
|-- greeting
|-- Career access state
|-- quota state
|-- Start/Resume Interview
`-- Open Sessions

Usage headline and progress
Interview context / next-session guidance
Recent Sessions
|-- finished -> report
`-- active -> resume interview

Quick links
|-- Analytics
|-- Sessions
|-- Messages
`-- Settings
```

Data source: `getDashboard`. Pricing and purchase controls are intentionally absent because organization access is managed by the college.

### 7.3 Student communications — `/student-dashboard/communications`

```text
Header
|-- unread count/context
`-- Refresh

Ask the placement office
|-- subject
|-- category
|-- detailed description
|-- membership/department context
`-- submit issue

Inbox
|-- read/unread indicator
|-- expand message
|-- opened timestamp
`-- acknowledge action

Your issues
|-- issue status and category
|-- original request
`-- placement-office response
```

Connections: `getCommunicationInbox`, `listMyCommunicationIssues`, `listCommunicationMemberships`, `openCommunication`, `acknowledgeCommunication`, and `createCommunicationIssue`.

### 7.4 Interview setup — `/interview/setup`

```text
AuthHeader + role-appropriate side rail
Start an Interview
|-- resume upload
|   |-- drag/drop or click
|   |-- PDF only
|   `-- maximum 5 MB
|-- practice plan selector
|-- pricing link
|-- difficulty
|   |-- Auto
|   |-- Basic
|   |-- Medium
|   `-- Difficult
|-- quota/access banner
|-- Start Interview
`-- About Interview

About modal
|-- microphone requirement
|-- focus/integrity guidance
|-- resume personalization explanation
|-- speech-to-text and 20-second silence submission
`-- manual early-end explanation
```

Starting sends the resume and selected configuration as `FormData` through `setupInterview`, then opens the returned session route.

### 7.5 Live interview — `/interview/[id]`

```text
Boot/loading/error state
Security Check
|-- microphone permission and validation
`-- begin session

Live session
|-- system-active indicator
|-- elapsed time
|-- microphone hardware state
|-- AI interviewer orb/state
|-- question number and question text
|-- live speech transcript
|-- silence countdown
|-- waveform
|-- Submit Answer
|-- End Interview
`-- transcript log
    |-- AI turns
    `-- user turns

End-session confirmation

Completed result
|-- privacy notice
|-- final score and interpretation
|-- questions answered / expected
|-- elapsed time
|-- Neural Feedback
|   |-- summary
|   |-- strengths
|   |-- next step
|   `-- next-practice focus
|-- View Full Report
`-- Return to Dashboard

Terminated result
|-- termination reason
|-- score/report when available
|-- View Report
`-- Return Home
```

Answer turns use `submitAnswer`; manual termination uses `terminateInterview`. Browser speech recognition, microphone state, transcript handling, silence detection, and timer displays are client-managed.

### 7.6 Session history — `/history`

```text
Interview History heading
|-- locked state for plan/history restrictions
|   |-- latest accessible feedback, when supplied
|   `-- Open Pricing
`-- unlocked history
    |-- selectable session rows
    |-- score, date, plan/difficulty/state metadata
    |-- View Report
    |-- delete one with confirmation
    |-- bulk selection
    `-- bulk delete with confirmation

Start Interview CTA
```

Connections: `getSessionHistory`, `deleteSessionHistory`, and `bulkDeleteSessionHistory`.

### 7.7 Personal analytics — `/analytics`

```text
Coaching signals and performance trends
|-- Your next coaching edge
|   |-- strongest/weakest measured signal
|   `-- evidence-based next action
|-- Recommended practice direction
|-- Your current performance signals
|   |-- Sessions Completed
|   |-- Average Score
|   `-- Best Score
|-- skill/category score cards
|-- Latest category snapshots
|   |-- Introduction
|   |-- Behavioral
|   |-- Project Ownership
|   `-- Communication
|-- Your latest session, fully decoded
|-- Turn this insight into practice
`-- repetition/insufficient-history state
```

Connections: `getDashboard`, `getSkills`, and, when a latest session exists, `getReport(latestSessionId)`. Strongest/weakest skills, changes, direction, and card summaries are **Derived** only from returned measurements.

### 7.8 Feedback — `/feedback`

```text
Share your feedback
|-- Send feedback
|   |-- text area
|   `-- submit
`-- Previous feedback
    |-- feedback text
    |-- status
    `-- timestamps/admin response when available
```

Connections: `getFeedback` and `submitFeedback`.

### 7.9 Profile — `/profile`

```text
Account details
|-- name
|-- email
|-- role/account metadata
`-- join/account timestamps when available

Plans and access
|-- active plan
|-- owned/expired plans
|-- expiry/reset/quota information
|-- Dashboard
`-- Pricing

Recent billing
|-- payments/subscriptions returned by billing status
`-- empty state

Useful shortcuts
|-- Settings
|-- Sessions
`-- Start Interview

Support email
Delete Account
`-- destructive confirmation and permanent API request
```

Connections: auth user state, `getBillingStatus`, and `deleteAccount`.

### 7.10 Settings — `/settings`

```text
Appearance
|-- dark theme
`-- light theme

Billing snapshot
|-- active plan/access
|-- expiry/reset details
`-- Pricing link where applicable

Support email
Sign out
```

Connections: theme context, auth context, and `getBillingStatus`.

### 7.11 Interview report — `/report/[id]`

```text
Report header
|-- Back
|-- session summary and final score
`-- Download PDF

Category Breakdown
Interview Intelligence
|-- 01 Answer quality fingerprint
|-- 02 Session momentum curve
|-- 03 Response timing intelligence map
|-- 04 Confidence decay pattern
|-- 05 Topic x skill blind-spot heatmap
|-- 06 Rabbit-hole collapse by follow-up depth
|-- 07 Answer classification breakdown
|-- 08 Communication-content scissor effect
|-- 09 Fear vs reality topic-avoidance map
|-- 10 Technical readiness gauge
|-- 11 Missing-elements frequency analysis
`-- 12 Score-contribution waterfall

Strengths
Areas to Improve
Per-question coaching
|-- question and user answer
|-- answer metrics/evaluation
|-- coaching feedback
|-- pro/career review when returned
`-- ideal answer
    `-- upgrade gate for restricted plans

Technical Readiness
Hiring-Panel Readiness
Top 3 Next Practice Goals
Upgrade prompt when report features are restricted
```

Connections: `getReport(sessionId)` and `downloadPDF(sessionId)`. Charts are built from report payload values in `_intel/model.ts` and `_intel/dashboard.tsx`; unavailable evidence renders an empty/unavailable state instead of an invented value.

## 8. Organization administrator pages

### 8.1 Command dashboard — `/org-admin`

```text
CommandCentreHeader
|-- organization title
|-- Live Sync indicator
|-- search field
`-- administrator avatar

CommandCentreHero
|-- readiness-threshold status
|-- assessed-student count
`-- cohort average

PulseStrip
|-- average interview score
|-- ready/almost count
|-- assessed count
`-- intervention flags

Welcome / low-engagement guidance
KPI cards
|-- total students
|-- Career-access students
|-- departments
|-- years
|-- batches
|-- cohort average
`-- seat usage

Dismissible intervention-risk alert
Readiness distribution
Weakest measured categories
Placement funnel
Recruiter pulse
Placement drives summary
AI provider status

Quick actions
|-- Manage Students
|-- Access Control
|-- Departments
|-- Performance analytics
|-- Growth analytics
|-- Readiness analytics
|-- Recruiter CRM
|-- Placement Interviews
`-- Offers

Recent students
```

Primary source: one `getCollegeDashboard` response. The AI provider card separately calls `getAIProviderHealth`.

Current source behavior: the header search input has no state, filtering, submission, or navigation handler. It is a visual field, not an operational search.

### 8.2 Students — `/org-admin/students`

```text
Page header
|-- Add Student
`-- Bulk Upload

Summary and filters
|-- search
|-- department
|-- year
|-- batch
|-- access state
|-- sortable Student, Department, and Added columns
`-- page size: 20, 50, or 100

Student table/cards
|-- identity and student code
|-- department/year/batch
|-- Career access
|-- added date
|-- open student detail
`-- remove student

Pagination

Add Student modal
|-- email of an existing PrepVista account
|-- student code
|-- department
|-- year
|-- batch
|-- section
|-- notes
`-- Career access option

Bulk upload modal
|-- CSV file, maximum 5 MB
|-- downloadable sample CSV
|-- validation/result feedback
`-- import action

Remove confirmation
```

Connections: student listing, organization segment lists, add, bulk upload, and remove methods in `api.ts`. Table filters are sent to the list API rather than substituting sample rows.

### 8.3 Student detail — `/org-admin/students/[id]`

```text
Back to Students
Student identity
|-- full name
|-- email
|-- Career access badge
`-- account/activity state

Student record
|-- Student Code
|-- Department
|-- Year
|-- Batch
|-- Section
|-- Added On
|-- Access Granted
`-- Notes when present

Actions
|-- Grant Career Access
|-- Revoke Career Access
|-- Edit Student
`-- Remove Student

Edit modal
|-- Student Code
|-- Section
|-- Department
|-- Year
|-- Batch
`-- Notes

Remove confirmation
```

Connections: `getCollegeStudent`, department/year/batch lists, `updateCollegeStudent`, `grantCareerAccess`, `revokeCareerAccess`, and `removeCollegeStudent`. The route accepts an enrollment UUID, not an email or student code.

### 8.4 Departments — `/org-admin/departments`

```text
Header and summary
Branch-routing coverage bar
|-- routed count
|-- generic-fallback count
`-- coverage percentage

Filter tabs
|-- All
|-- Routed
`-- Needs Review

Department list
|-- name and code
|-- canonical branch-routing badge
|-- student count when returned
|-- notes
|-- expandable technical-module topic preview
|-- Edit
`-- Delete

Create/Edit modal
|-- department name
|-- branch-code selector and automatic suggestion
|-- technical-module topic preview
|-- notes
`-- save/cancel

Dependency-aware delete confirmation
```

Connections: `listCollegeDepartments`, `createCollegeDepartment`, `updateCollegeDepartment`, and `deleteCollegeDepartment`.

### 8.5 Years and batches — `/org-admin/years-batches`

```text
Header
First-time setup guidance (conditional)
Years panel
|-- ordered year list
|-- drag/reorder controls
|-- inline edit
|-- create/edit modal
`-- dependency-aware delete

Batches panel
|-- batch list
|-- related year/metadata
|-- inline edit
|-- create/edit modal
`-- dependency-aware delete
```

Connections: list/create/update/delete for years and batches plus `reorderCollegeYears`. Names, codes, notes, and ordering persist through the API.

### 8.6 Analytics command centre — `/org-admin/analytics/[[...slug]]`

This route embeds `/command-centre.html?embed=1` in a sandboxed iframe. The parent fetches `getCommandCentre` (`GET /org/my/command-centre`) and transfers the authenticated organization payload by `postMessage` only after the iframe reports ready.

Slug-to-initial-view mapping:

| URL ending | Initial view |
|---|---|
| `/analytics` | Command Centre |
| `/analytics/performance` | Skills Analytics |
| `/analytics/readiness` | Risk & Readiness |
| `/analytics/growth` | Command Centre |
| `/analytics/departments` | Department Analytics |
| any other slug | Command Centre |

Command-centre shell:

```text
Sidebar views
|-- Command Centre
|-- Risk & Readiness
|-- Skills Analytics
|-- Departments
|-- Student Explorer
`-- Session Forensics

Top bar
|-- current view and institution/batch crumb
|-- "67 charts · 67 filters" badge
|-- Download Report
`-- AI Summary

Global filters
|-- departments, multi-select
|-- readiness tiers
|-- Season / 30d / 7d time window
|-- focus student
`-- Reset

Per-chart controls
|-- chart-specific filter
`-- explanation drawer
    |-- evidence summary
    |-- Read aloud
    `-- follow-up interaction

PDF progress overlay and result toast
```

Command Centre view modules:

- AI season briefing.
- Placement-Readiness Constellation.
- At-Risk Watchlist.
- Institutional Skill Fingerprint.
- Cohort Growth Slope.
- Readiness Distribution.
- Department x Skill Grid with Score/Growth toggle.
- ROI & Utilisation Ledger.
- Readiness Tiers.
- Readiness Over Season.
- Interviews Per Week.
- Top Score Improvers.
- Average Readiness by Department.
- Engagement Funnel and Peer Mobility where supported by the current view configuration.

Risk & Readiness modules:

- Why Students Are Flagged.
- At-Risk by Department.
- Momentum Status.
- Risk Map: Score vs Inactivity.
- Readiness Pipeline.
- Days Since Last Active.
- Sessions to Target.
- Momentum Distribution.
- At-Risk Trend.
- Weekly Readiness.

Skills Analytics modules:

- Cohort Skill Averages.
- Skill Growth.
- Skill Shape.
- Relevance, Clarity, Specificity, and Structure answer measures.
- Technical vs Communication.
- Specificity vs Readiness.
- Weakest-Skill Ranking.
- Communication Spread.
- Top Score Improvers.

Department modules:

- Divergence From Institution.
- Top-3 Branch Shapes.
- Current vs Baseline by Branch.
- Department Growth Grid.
- Students per Branch.
- Readiness Mix by Branch.
- At-Risk vs Ready.
- Branch Percentile Race.
- Practice Adoption by Branch.

Student Explorer modules:

- Relevance, Clarity, Specificity, and Structure dials.
- Composure Signals.
- Pacing Rhythm.
- Topic Coverage.
- Growth Trajectory with explicitly labeled linear estimate when enough history exists.
- Skill Radar vs Cohort.
- Percentile Journey.
- Skill vs Cohort.
- Session Score History.
- Readiness Debrief.

Session Forensics modules:

- Interview Journey Flow.
- Topic Coverage.
- Answer Outcomes.
- Score Per Question.
- Response Time Per Question.
- Topics Covered.
- Recorded Follow-Ups.
- Session Length Spread.
- Answer Anatomy: said vs ideal plus feedback.

Data truth rules in the embed:

- Organization, batch, seats, recorded fee, billing type, cycle/renewal dates, weekly history, departments, and students come from the authenticated API payload.
- Readiness, momentum, distributions, rankings, and aggregates are **Derived** from that payload.
- Missing rubric or answer-level evidence stays empty and is described as unavailable; it is not replaced with an overall score.
- Readiness/risk bands are internal preparation indicators, not hiring predictions.
- Clicking a valid student sends the enrollment ID to the parent and opens `/org-admin/students/[id]`.
- Download Report builds a PDF in the iframe and transfers the PDF bytes to the authenticated parent for browser download.

### 8.7 Communications — `/org-admin/communications`

```text
Header and refresh/status
Create an in-app message
|-- reusable message templates
|-- AI draft instruction and Generate
|-- subject
|-- body
`-- Send

Audience
|-- all/segmented selection
|-- departments
|-- drives
|-- selected students where supported
`-- calculated recipient count

Sent-message history
|-- subject/body
|-- audience summary
|-- recipient count
`-- timestamps/status

Student issues
|-- student and category/status
|-- issue detail
|-- response editor
`-- send/update response
```

Connections: organization messages/issues, all students, departments, drives, `draftOrgMessage`, `sendOrgMessage`, and `respondOrgCommunicationIssue`.

### 8.8 Leaderboard — `/org-admin/leaderboard`

This route embeds `/scoreboard.html?embed=1`. The parent obtains `getLeaderboard` and injects the live cohort through `postMessage`.

```text
Student Scoreboard
|-- institution identity and Live status
|-- filters
|   |-- Department multi-select
|   |-- Year
|   |-- Ready / Almost / Developing / At Risk tiers
|   |-- student search
|   `-- Reset
|-- KPI strip
|-- Top Performers podium
|-- Top 10 by readiness chart
|-- Average readiness by department chart
`-- Full Scoreboard
    |-- rank
    |-- student
    |-- department
    |-- year
    |-- readiness
    |-- momentum
    |-- interviews
    `-- tier
```

Rows are ranked by readiness within the active filters. Clicking a valid live row opens the organization student detail. The static asset contains demo data only for explicit standalone `?sample=1`; the embedded organization route waits for the live payload and does not load that sample.

### 8.9 Placement configuration — `/org-admin/placement-config`

```text
Target companies
|-- company chips/list
|-- add company
`-- remove company

Internal readiness benchmark
|-- numeric threshold/control
`-- explanatory text

Focus pillars
|-- selectable preparation priorities
`-- current selection

Notes
Save configuration
```

Connections: `getPlacementConfig` and `updatePlacementConfig`.

### 8.10 Companies — `/org-admin/companies`

```text
Companies & Recruiters
|-- Add Company toggle
|-- search
|-- relationship-stage filter
`-- refresh/list status

Add Company form
|-- company name
|-- city
|-- website
`-- create

Company list/cards
|-- company identity
|-- city and website
|-- relationship stage
|-- repeat-recruiter marker
|-- updated date
`-- open dossier
```

Connections: `listRecruiterCompanies` and `createRecruiterCompany`.

### 8.11 Company dossier — `/org-admin/companies/[id]`

```text
Company identity and relationship summary
Relationship stage
|-- stage selector
|-- optional reason
`-- Update stage

Recruiter contacts
|-- contact list and primary marker
`-- add name/designation/email/phone/primary

Open follow-ups
|-- title, priority, due date
|-- Complete
`-- create follow-up

Activity timeline
|-- typed chronological activity
`-- log type/subject/summary

Internal notes
|-- note history
`-- add note
```

Connections: dossier fetch, stage transition, add contact, log activity, create/complete follow-up, and add note methods.

### 8.12 Placement drives — `/org-admin/drives`

```text
Placement Drives
|-- status filter
|-- Refresh
`-- Create Drive

Drive list
|-- company, role, status, dates
`-- select detail

Selected drive
|-- drive identity
|-- legal lifecycle transitions
|   |-- optional reason
|   `-- only backend-supplied next states
|-- eligibility rule
|   |-- editable JSON
|   |-- version reason
|   |-- Save new version
|   `-- Compute snapshot
|-- latest immutable eligibility snapshot
`-- audit trail
```

Connections: placement-drive list/create/detail/status, rule versioning, and eligibility snapshot methods. The UI does not invent lifecycle transitions; it renders `legal_next_states` returned for the selected drive.

### 8.13 Placement interviews — `/org-admin/interviews`

```text
Header
|-- Refresh
`-- Schedule

Schedule panel
|-- placement drive
|-- student
|-- round
|-- scheduled date/time
|-- location
`-- create interview

Tabs
|-- All interviews
|   |-- search student name/email/code
|   |-- status filter
|   |-- Student / Drive / Scheduled / Status / Result table
|   `-- pagination
|-- Import results
|   |-- optional drive
|   |-- CSV text/file workflow
|   |-- validate preview
|   `-- commit valid rows
`-- Review & publish
    |-- pending internal results
    `-- batch publish confirmation

Interview detail
|-- student, drive, company, round, schedule
|-- Record attendance
|-- lifecycle actions from legal next states
|-- Result
|   |-- result value
|   |-- remarks
|   |-- save internal result
|   |-- review
|   `-- publish
|-- reported issues
|   |-- resolution text
|   `-- Resolve
`-- audit trail/version context returned by API
```

Connections: placement-interview list/detail/schedule, round list, attendance, lifecycle, result entry/review/publish, pending review, batch publish, CSV validate/commit, and issue resolution.

### 8.14 Offers — `/org-admin/offers`

```text
Offers & Joining Dashboard
|-- offer KPIs: Verified, Accepted, Pending, Declined, Expiring soon
|-- joining KPIs: Pending, Delayed, Did not join
|-- conversion funnel
|-- company scorecard
`-- needs-attention-today list

Offer operations
|-- Refresh
|-- New offer
|-- placement seasons
|   |-- create name/start/end
|   `-- close active season
|-- new-offer form
|   |-- season, student, drive, company
|   |-- role, location
|   |-- employment type and work mode
|   |-- offer date, deadline, joining date
|   `-- total/fixed CTC
|-- search and status filter
|-- offer ledger
`-- selected offer detail
    |-- current status, CTC, deadline, joining, mode
    |-- legal offer-status transitions and optional reason
    |-- private evidence documents
    |   |-- PDF upload and type
    |   |-- Open
    |   `-- Verify
    |-- joining state
    |   |-- reason
    |   |-- verified evidence selector
    |   `-- legal joining-state transitions
    `-- version history
```

Connections: offer summary/insights, seasons, offers, status/joining transitions, and document upload/verification/download. A verified evidence document is required by the UI/backend flow before marking a student joined.

### 8.15 Access control — `/org-admin/access-control`

```text
Seat/access KPI summary
Without Career Access
|-- student rows
`-- Grant

With Career Access
|-- student rows
`-- Revoke

Recent Access Log
Pagination/refresh states
```

Connections: `getCollegeAccessControl`, `grantCareerAccess`, and `revokeCareerAccess`. Successful mutations refresh both the page and organization layout context.

### 8.16 Reports — `/org-admin/reports`

```text
Reports header
Filter controls
|-- department
|-- year
|-- batch
|-- Preview
`-- Clear

Report summary/KPI cards
|-- Students
|-- Avg Score
|-- Best Score
`-- Career Access percentage

Score Distribution
Top Performers
Needs Attention
Student report table
|-- identity and segment
|-- usage/session values
|-- score/readiness values
`-- access state

Export
|-- current filtered report
`-- CSV download

Schedule Report modal
|-- recipient email
|-- recurrence/schedule controls
|-- active filters
`-- save schedule
```

Connections: segment lists, `exportCollegeReports`, `exportCollegeReportsCSV`, and `scheduleCollegeReport`. The CSV is downloaded from backend-generated bytes; filters are carried into export/schedule requests.

### 8.17 Organization billing — `/org-admin/billing`

```text
Your Organisation's Billing
|-- Print
|-- current plan
|-- seat limit / seats used / remaining
|-- access expiry and renewal state
|-- seat-utilization progress
|-- Request additional seats
|-- Plan Allocation History
`-- Payment History

Choose your college plan
|-- Pilot: Rs 25,000 / 3 months
|-- College Pro: Rs 1,00,000 / year
|-- College Custom: contact-based
`-- plan request buttons

Purchase-flow explanation and plan notes
```

Billing records come from `getCollegeBilling`.

Important current behavior: plan and seat-request buttons only call `handleRequest`, store `requestedPlan` locally, and clear it after five seconds. Despite displaying “Request sent — administrator notified”, the current page does not call a backend request, send email, or persist a request.

### 8.18 Organization admin profile — `/org-admin/profile`

```text
Admin Profile
|-- administrator identity and email
|-- role
`-- account details

Organization
|-- name
|-- organization code
|-- plan/access context when present
`-- seat context when present

Quick links
|-- Personal Profile
|-- Settings
`-- Main Dashboard
```

Identity comes from auth context; organization identity comes from the organization layout context.

## 9. Platform administrator pages

### 9.1 Admin console — `/admin`

Audience: `is_admin` or `premium_override`. College-management subroutes still require full `is_admin` access.

```text
Admin Console header and Refresh
Platform Overview
|-- users/subscriptions/activity metrics
`-- platform counters returned by admin overview

Launch Offer Status
|-- progress/completed state
|-- pending grants
|   |-- Approve
|   `-- Reject
`-- completed grant context

Manual Access Grants
|-- choose user
|-- model/action/value
`-- apply grant/revoke operation

Global Support Operations
|-- support-user list
|-- selected message thread
|-- official reply composer
|-- optional image attachment
`-- send reply

User Subscription Analytics
|-- search/filter
|-- plan/access/usage values
`-- user cards

Referral Activity
All User Feedback
Global Revenue Statistics
User Lifetime Value
```

Connections: `getAdminOverview`, launch-offer approval/rejection, `grantAdminAccess`, admin support user/thread methods, and `sendAdminSupportReply`.

### 9.2 Colleges — `/admin/colleges`

```text
College Admins / organization operations header
KPI counts: Total, Active, Suspended, and Pending when present
Search and sort
Administrator list
|-- administrator name and email
|-- assigned organization and code
|-- last login and created date
|-- status
`-- enable/disable administrator

Assign College Admin modal
|-- existing PrepVista account email
|-- full name/context
|-- organization
`-- assign

Create College modal
|-- organization name
|-- automatically generated unique college code
|-- seat limit
|-- contact name, email, and phone
|-- address
|-- notes
`-- create
```

Connections: `listOrgAdmins`, `listOrganizations`, `createOrgAdmin`, `createOrganization`, `enableOrgAdmin`, and `disableOrgAdmin`.

### 9.3 College admins — `/admin/college-admins`

```text
College Admins
|-- search by email/name/organization
|-- administrator list and enabled state
|-- enable/disable
`-- Assign College Admin modal
    |-- existing PrepVista account email
    |-- name
    |-- organization
    `-- assign
```

This is a narrower administrator-assignment screen than `/admin/colleges`; both currently expose overlapping admin-management functions.

### 9.4 College detail — `/admin/colleges/[id]`

```text
Organization identity
|-- name, code, contact/status metadata
`-- back navigation

Tabs
|-- Students
|   |-- student table
|   `-- pagination
|-- Analytics
|   |-- organization totals
|   |-- department breakdown
|   `-- year/segment performance values
|-- Billing
|   |-- current plan, seats, expiry
|   |-- Grant Career Access to all
|   |-- Revoke Career Access from all
|   |-- Revoke plan
|   |-- Assign Plan form
|   |-- Record Manual Payment form
|   |-- Plan Allocations
|   `-- Payment History
`-- Admins
    |-- assigned administrators
    `-- link to assignment workflow
```

Connections: `getOrganization`, `getOrgStudentsAdmin`, `getOrgAnalyticsAdmin`, `getOrgBillingAdmin`, bulk organization access controls, plan assign/revoke, and manual payment recording.

## 10. UI value linkage reference

### 10.1 Individual metrics

| UI value | Source |
|---|---|
| Active/owned/expired plan | authenticated user and billing/dashboard API payload |
| Interviews used/remaining | dashboard payload; remaining/progress may be browser-derived |
| Active session link | dashboard payload session ID/state |
| Session score/history | history/report API payloads |
| Skill and category analytics | dashboard skills plus latest report; no sample fallback |
| Referral link, reservations, rewards | dashboard referral block |
| Payment success | backend-verified Razorpay order/payment/signature followed by user refresh |

### 10.2 Organization dashboard metrics

| UI value | Source |
|---|---|
| Students, departments, years, batches | `getCollegeDashboard` aggregate fields |
| Seats used/limit | organization dashboard payload |
| Cohort average and assessed count | `performance_summary` |
| Readiness tiers and intervention flags | `performance_summary` |
| Weakest categories | `performance_summary.weakest_3_categories` |
| Placement funnel | optional `placement_summary` |
| Recruiter pulse | optional `recruiter_pulse` |
| Placement drive counts | optional `drives_summary` |
| AI provider status | separate AI provider health call |

### 10.3 Command-centre payload

| Payload field | UI consumers |
|---|---|
| `college`, `batch` | header/crumb and PDF identity |
| `seats` | utilization and licensed-seat reporting |
| `annualFee` | cost-per-ready calculation only when recorded and positive |
| `billingType`, `cycleStart`, `renewalDate` | ROI/renewal reporting |
| `history.labels` | weekly time axis |
| `history.readiness` | readiness-over-time/weekly readiness |
| `history.interviews` | interviews-per-week |
| `history.atRisk` | at-risk trend |
| `depts` | department filters and department comparisons |
| `students` | readiness, momentum, risk, skills, explorer, and forensics views |

Readiness and chart narratives explicitly distinguish measured facts from inference. When a value is not measured, the embed uses “Not measured”, “Not available”, or an evidence-empty panel.

## 11. Loading, empty, error, and destructive states

- Analytics, history, interview setup, and profile have route-level loading components.
- Major API screens show a skeleton/spinner while their first request is pending.
- Lists expose empty states rather than placeholder records.
- Organization analytics and leaderboard show a parent error screen if live payload loading fails.
- Forms disable or show busy state while mutations are running.
- Account deletion, student removal, session deletion, bulk deletion, and similar destructive operations use confirmations.
- Placement drive, interview, offer, and joining transitions are restricted to backend-supplied legal next states.
- API errors are presented as page alerts, inline validation, toasts, or retry actions depending on the screen.

## 12. Current implementation caveats

These are source-observed facts and should remain visible in product/QA planning:

1. The landing-page Cookies link currently opens `/pricing`; no Cookies route exists.
2. The organization dashboard header search field is display-only and has no handler.
3. Organization billing plan/seat request buttons only show a temporary local acknowledgement; they do not notify or persist anything.
4. `/admin/colleges` and `/admin/college-admins` overlap in college-administrator management.
5. Legacy organization routes are redirect-only compatibility paths, not separate feature screens.
6. `/api/awake` is a service heartbeat route and must not be counted as a UI page.
7. Command-centre chart counts shown in copy are a presentation label; actual panels can be empty when the authenticated organization lacks the required persisted evidence.
8. `premium_override` can expose and open the main `/admin` console, but `/admin/colleges`, `/admin/college-admins`, and `/admin/colleges/[id]` require `is_admin`.

## 13. Source ownership map

```text
frontend/src/app
|-- route pages, route guards, layouts, and route loading states
frontend/src/components
|-- shared headers, rails, selectors, dialogs, theme visuals, and support chat
frontend/src/lib/auth-context.tsx
|-- authentication, current user, role, plan, quota, and auth mutations
frontend/src/lib/api.ts
|-- frontend-to-backend request methods and endpoint mapping
frontend/public/command-centre.html
|-- organization analytics visualization engine and PDF export
frontend/public/scoreboard.html
|-- organization leaderboard visualization engine
frontend/src/app/report/[id]/_intel
`-- individual report analytics model, chart options, and report visualization
```

When the UI changes, update this document from those sources in that order: route inventory, shared navigation, page controls, API methods, then embedded static assets.
