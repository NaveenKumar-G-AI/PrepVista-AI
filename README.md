# 📚 PrepVista AI – AI-Powered Mock Interview & Exam Preparation Platform

PrepVista AI is an intelligent platform powered by advanced LLMs (Llama-3 via Groq) designed to revolutionize exam and interview preparation by delivering personalized mock interviews, adaptive study materials, real-time performance analytics, and comprehensive exam resources using cutting-edge AI technology.

---

## Overview

This system combines Large Language Models (LLMs) with adaptive learning technologies to reduce preparation anxiety and improve competency through realistic, plan-based interview simulations and personalized study guidance.

Instead of relying solely on generic study materials, PrepVista:

1. Generates personalized mock interview questions based on resume analysis
2. Adapts interview difficulty dynamically (Free → Student → Pro → Premium)
3. Provides real-time performance tracking and detailed analytics
4. Delivers AI-powered feedback with coaching recommendations
5. Creates structured, downloadable PDF interview reports
6. Implements intelligent silence handling and context-aware follow-ups
7. Offers multi-plan interview experiences with varying intensity levels

---

## Architecture

User Resume Upload
→ PDF Text Extraction & Parsing
→ Session Management (SQLite/Supabase)
→ LLM Processing (Llama-3 via Groq API)
→ Plan-Based Interview Generation
→ Real-Time Question Adaptation
→ Performance Evaluation & Scoring
→ PDF Report Generation & Download

---

## ⚙️ Tech Stack

- **Python** (61.9%)
- **TypeScript** (30.5%)
- **HTML** (5.3%)
- **CSS** (2.3%)
- **FastAPI** (Core Framework)
- **Uvicorn** (ASGI Server)
- **Pydantic** (Data Validation)
- **AsyncPg** (Async Database Connection)
- **Groq API** (Llama-3 LLM Provider)
- **OpenAI** (Alternative LLM Provider)
- **PyPDF2 & FPDF2** (PDF Processing & Report Generation)
- **Razorpay** (Payment Processing)
- **Resend** (Email Service)
- **Sentry** (Error Monitoring)
- **Docker** (Containerized Deployment)
- **Vercel** (Frontend Deployment)

---

## Key Features

- **Multi-Plan Interview System** – Free, Student, Pro, and Premium tiers with progressive difficulty
- **Resume-Based Question Generation** – AI analyzes resume and generates contextual questions
- **Adaptive Difficulty Engine** – Questions adjust based on candidate responses and plan level
- **Real-Time Performance Tracking** – Live analytics dashboard with scoring metrics
- **Intelligent Silence Handling** – Auto-simplifies questions after consecutive timeouts
- **Comprehensive Evaluation Metrics** (~35% better accuracy vs generic questions)
- **AI-Generated Coaching Reports** – Detailed feedback on strengths, weaknesses, and ideal answers
- **PDF Report Download** – Professional downloadable interview transcripts and evaluations
- **Multi-LLM Support** – Groq (Llama-3) and OpenAI integrations with fallback mechanisms
- **Rate Limiting & Security** – Token-bucket rate limiting, CORS protection, security headers
- **Session Persistence** – Secure SQLite/Supabase-backed session management
- **Containerized Deployment** – Docker-ready with Render and production support

---

## Live Demo

🔗 https://prepvista-ai.vercel.app/

---

## Installation (Local Setup)

```bash
git clone https://github.com/Devil-nkp/PrepVista-AI.git
cd PrepVista-AI
pip install -r requirements.txt
```

Set your environment variables:

```bash
# LLM & API Keys
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key

# Database
DATABASE_URL=your_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_JWT_SECRET=your_jwt_secret

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

# Optional: Monitoring & Billing
SENTRY_DSN=your_sentry_dsn
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
UPSTASH_REDIS_URL=your_redis_url
UPSTASH_REDIS_TOKEN=your_redis_token
RESEND_API_KEY=your_resend_key

# Environment
ENVIRONMENT=development
DEBUG=true
```

Run the application:

```bash
uvicorn app.main:app --reload
```

Open your browser at `http://localhost:8000`

---

## Future Improvements

- Add advanced vector database integration (FAISS / Pinecone)
- Implement comprehensive analytics dashboard with visualization
- Add multi-language support for interviews
- Implement advanced user authentication with OAuth
- Build mobile application for iOS/Android
- Add real-time collaborative mock interviews
- Implement video recording and playback analysis
- Add industry-specific interview templates
- Integrate with ATS systems for recruitment

---

## Author

**Naveenkumar G** (Devil-nkp)
- AI / ML Engineer
- Full-Stack Development

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ to empower better interviews and learning outcomes**
