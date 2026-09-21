# PrepVista v2.0 - Next-Generation Interview Intelligence Platform

Production-grade AI-powered interview preparation platform with personalized intelligence, adaptive coaching, and institutional analytics.

## 🏗 Architecture Overview

```
prepvista/
├── packages/
│   ├── shared/          # Shared types, schemas, constants
│   ├── backend/         # Express + TypeScript + Prisma API
│   └── frontend/        # Next.js 14 + React + Tailwind
├── docker-compose.yml   # Local development stack
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Anthropic API key (or OpenAI)

### Development Setup

```bash
# Clone and install
cd prepvista
npm install

# Configure environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your keys

# Start databases
docker-compose up -d postgres redis

# Setup database
npm run db:generate
npm run db:push
npm run db:seed

# Start development servers
npm run dev
```

### Access Points
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Health: http://localhost:3001/health
- Prisma Studio: `npm run db:studio`

## 🔐 Test Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@prepvista.com | admin123 |
| College Admin | college@demo.edu | college123 |
| TPO | tpo@demo.edu | tpo123 |
| Student | student@demo.edu | student123 |

## 📚 Core Features

### For Students
- **Adaptive Assessments** - AI-generated interviews tailored to target role and skill level
- **Explainable Scoring** - 6-dimension scoring (Technical, Problem Solving, Communication, Behavioral, Confidence, Role Relevance) with evidence citations
- **Skill Graph** - Hierarchical skill proficiency with confidence levels
- **Action Center** - Personalized recommendations with clear reasoning
- **Progress Intelligence** - Trend analysis with mathematical confidence

### For TPOs / College Admins
- **College Analytics Dashboard** - Readiness distribution, completion rates, active students
- **Department Analytics** - Per-department readiness and common skill gaps
- **Placement Readiness Report** - Institutional placement preparation status
- **Student Management** - Filter, export, and track student progress
- **Data Export** - CSV export for institutional reporting

### Intelligence Engine
- **Signal Extraction** - Evidence from every answer mapped to skill hierarchy
- **Weakness Detection** - Statistical analysis with severity, confidence, and trend
- **Adaptive Recommendations** - Context-aware next actions prioritized by impact
- **Readiness Calculation** - Continuous readiness scoring with trend detection

## 🛡 Security

- **Multi-Tenant Isolation** - College-scoped data with row-level security
- **Role-Based Access Control** - Student, TPO, College Admin, Super Admin
- **JWT Authentication** - Access tokens (15min) + Refresh tokens (7d)
- **Rate Limiting** - Per-endpoint limits with user/IP-based keys
- **Audit Logging** - All sensitive operations logged
- **Input Validation** - Zod schemas on all API boundaries

## 🤖 AI Architecture

- **Provider Abstraction** - Anthropic (primary) + OpenAI (fallback)
- **Structured Outputs** - JSON schema validation on every response
- **Prompt Versioning** - Semantic versioning for all prompts
- **Retry Logic** - Exponential backoff with configurable retries
- **Cost Tracking** - Per-request token usage and cost logging
- **Hallucination Reduction** - Evidence-cited scoring, confidence thresholds

## 📊 Database Schema (Key Models)

- **College** - Tenant root entity
- **User** - Authentication + roles
- **Student** - Profile, target role, skills
- **Assessment** - Interview sessions with questions
- **Skill** - Hierarchical skill taxonomy
- **SkillEvidence** - Signals from assessments
- **Recommendation** - Personalized action items
- **ProgressSnapshot** - Historical readiness tracking
- **CollegeAnalytics** - Aggregated daily metrics
- **AIProcessingJob** - AI cost and usage tracking

## 🧪 Testing

```bash
# Backend tests
npm run test:backend

# Frontend tests
npm run test:frontend

# All tests
npm run test
```

## 🏭 Production Deployment

### Environment Variables (Required)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=strong-random-secret
JWT_REFRESH_SECRET=strong-random-secret
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

### Docker Production
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Database Migrations
```bash
npm run db:migrate:prod
```

## 📁 Project Structure

```
packages/
├── shared/
│   └── src/
│       ├── constants.ts    # Domain enums & constants
│       ├── types.ts        # TypeScript interfaces
│       └── schemas.ts      # Zod validation schemas
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Development seed data
│   ├── src/
│   │   ├── index.ts        # Express app entry
│   │   ├── lib/
│   │   │   ├── prisma.ts   # Prisma client
│   │   │   ├── auth.ts     # JWT + auth helpers
│   │   │   └── logger.ts   # Pino logger
│   │   ├── middleware/
│   │   │   ├── auth.ts     # Auth + RBAC middleware
│   │   │   ├── error.ts    # Error handling
│   │   │   ├── validate.ts # Zod validation
│   │   │   └── rateLimit.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── assessments.ts
│   │   │   ├── intelligence.ts
│   │   │   ├── analytics.ts
│   │   │   └── skills.ts
│   │   └── services/
│   │       ├── ai/         # AI orchestration
│   │       └── intelligence/ # Intelligence engine
│   └── test/               # Unit + integration tests
│
└── frontend/
    ├── src/
    │   ├── app/            # Next.js App Router pages
    │   │   ├── dashboard/
    │   │   ├── assessments/
    │   │   ├── skills/
    │   │   ├── recommendations/
    │   │   └── analytics/
    │   ├── components/
    │   │   ├── ui/         # Radix-based UI primitives
    │   │   └── layout/     # Sidebar, headers
    │   └── lib/
    │       ├── api.ts      # API client
    │       └── utils.ts
    └── test/               # Component tests
```

## 🔄 Development Workflow

1. **Feature Branch** - Create from `main`
2. **Implement** - Backend → Frontend → Tests
3. **Validate** - `npm run typecheck && npm run test && npm run lint`
4. **PR** - Automated checks + manual review
5. **Deploy** - Migrations → Backend → Frontend

## 📝 API Documentation

Key endpoints (all require `Authorization: Bearer <token>`):

### Auth
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh tokens
- `GET /api/auth/me` - Current user

### Assessments
- `POST /api/assessments` - Create assessment
- `GET /api/assessments/:id` - Get assessment
- `POST /api/assessments/:id/start` - Start assessment
- `POST /api/assessments/:id/answer` - Submit answer
- `GET /api/assessments` - List assessments

### Intelligence
- `GET /api/intelligence/readiness/:studentId?` - Readiness snapshot
- `GET /api/intelligence/skills/:studentId?` - Skill graph
- `GET /api/intelligence/recommendations/:studentId?` - Recommendations
- `GET /api/intelligence/weaknesses/:studentId?` - Weakness analysis
- `GET /api/intelligence/progress/:studentId?` - Progress history

### Analytics (TPO/Admin)
- `GET /api/analytics/college/overview` - Dashboard metrics
- `GET /api/analytics/college/students` - Student list
- `GET /api/analytics/college/departments` - Department analytics
- `GET /api/analytics/college/placement-report` - Placement readiness
- `GET /api/analytics/college/export` - CSV export

### Skills
- `GET /api/skills` - Skill hierarchy
- `GET /api/skills/categories` - Categories
- `GET /api/skills/:id` - Skill detail

## 🎯 Roadmap

- [ ] Voice-based interviews (WebRTC + STT)
- [ ] Resume parsing → skill extraction
- [ ] Peer mock interviews
- [ ] Company-specific question banks
- [ ] Mobile app (React Native)
- [ ] SSO (SAML/OIDC) for enterprises
- [ ] Advanced analytics (cohort comparison, predictive modeling)

## 📄 License

Proprietary - PrepVista Inc.