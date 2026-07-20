# AI Interview Platform

An AI-powered technical interview platform that conducts personalized resume-based interviews, evaluates coding skills in real time, detects cheating using Computer Vision, and generates detailed recruiter insights.

**Live Demo:**
- 🌐 Frontend: [ai-interview-platform-xi-two.vercel.app](https://ai-interview-platform-xi-two.vercel.app)
- ⚙️ Backend API: [ai-interview-platform-vucd.onrender.com](https://ai-interview-platform-vucd.onrender.com)
- 📖 API Docs: [ai-interview-platform-vucd.onrender.com/docs](https://ai-interview-platform-vucd.onrender.com/docs)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker Compose](#docker-compose)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [CI/CD](#cicd)
- [Screenshots](#screenshots)

---

## Features

### For Candidates
- 📄 **Resume Upload & AI Parsing** — Upload a PDF resume; the platform extracts skills, experience, education, and projects using LLMs
- 🎤 **Voice-Based Interviews** — Answer questions by speaking; Web Speech API transcribes in real time with a live audio level indicator
- 💬 **AI-Powered Conversation** — Dynamic follow-up questions generated based on your answers and resume
- 💻 **Live Coding Environment** — Monaco Editor (same as VS Code) with multi-language support and real-time test case execution
- 📊 **Interview Progress Tracking** — See your progress, question count, and completion percentage

### For Recruiters
- 📅 **Schedule Interviews** — Assign interviews to candidates with configurable type, difficulty, and duration
- 📋 **Candidate Dashboard** — View all candidates and their interview statuses at a glance
- 📈 **AI-Generated Reports** — Detailed evaluation reports with scores across technical knowledge, coding, communication, and problem-solving
- 🎯 **Hiring Recommendations** — AI-generated hire / borderline / reject decisions with reasoning

### Proctoring & Security
- 📷 **Camera Proctoring** — Live camera feed with motion detection during interviews
- 🔍 **Browser Proctoring** — Detects tab switches, window blur, copy-paste, right-click, and DevTools access
- 🚨 **Event Logging** — All proctoring events logged with severity levels (low / medium / high / critical) and timestamps

### Platform
- 🔐 **JWT Authentication** — Secure access + refresh token flow
- 🤖 **Multi-LLM Support** — Works with Gemini, Groq, OpenRouter, OpenAI, and Anthropic with automatic fallback
- 🗄️ **File Storage** — Local storage for development; AWS S3 / compatible for production
- ⚡ **Real-time WebSocket** — Live interview communication channel

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, React Query, Zustand |
| **Backend** | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| **Database** | PostgreSQL (Neon in production) |
| **Cache / Queue** | Redis (Upstash in production) |
| **AI / LLM** | OpenAI, Anthropic, Google Gemini, Groq, OpenRouter |
| **Resume Parsing** | PyMuPDF, LLM extraction |
| **Computer Vision** | YOLOv8, OpenCV, MediaPipe |
| **Background Tasks** | Celery + Redis |
| **Code Execution** | Docker sandboxing |
| **Storage** | AWS S3 / Local |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Render (Docker) |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus, Grafana |

---

## Architecture

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│        Vercel               │  HTTPS   │         Render               │
│   React + Vite + Tailwind   │ ───────► │   FastAPI + Uvicorn          │
│   (Static CDN)              │          │   (Docker container)         │
└─────────────────────────────┘          └──────┬───────────────────────┘
                                                │
                          ┌─────────────────────┼──────────────────────┐
                          │                     │                      │
                 ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
                 │  Neon Postgres  │   │  Upstash Redis  │   │    AWS S3       │
                 │  (Free tier)    │   │  (Free tier)    │   │  (File storage) │
                 └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Request Flow
1. Candidate uploads resume → FastAPI saves to S3 → PyMuPDF extracts text → LLM parses into structured JSON
2. Recruiter creates interview → linked to candidate resume summary
3. Candidate starts interview → LLM generates personalized questions based on resume
4. Candidate answers → LLM evaluates answer → generates follow-up or moves to next question
5. Interview ends → AI generates full report with scores and hiring recommendation

---

## Project Structure

```
AI-Interview-Platform/
├── backend/
│   ├── app/
│   │   ├── api/v1/              # Route handlers
│   │   │   ├── auth.py          # Register, login, refresh, /me
│   │   │   ├── interviews.py    # Interview CRUD + session management
│   │   │   ├── resumes.py       # Resume upload and parsing
│   │   │   ├── coding.py        # Coding session endpoints
│   │   │   └── websocket.py     # Real-time interview WebSocket
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic settings (env var validation)
│   │   │   ├── database.py      # Async SQLAlchemy engine + session
│   │   │   ├── security.py      # JWT creation and verification
│   │   │   ├── deps.py          # FastAPI dependency injection
│   │   │   ├── llm.py           # Multi-provider LLM client with fallback
│   │   │   └── storage.py       # S3 / local file storage abstraction
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── interview/       # Question generation, session management
│   │   │   ├── resume/          # PDF text extraction, LLM parsing
│   │   │   ├── evaluation/      # Report generation
│   │   │   ├── coding/          # Code execution and evaluation
│   │   │   └── proctoring/      # Browser + camera event handling
│   │   └── workers/             # Celery background tasks
│   ├── alembic/                 # Database migrations
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts        # Axios instance with auth interceptors
│   │   │   └── resume.ts        # API functions
│   │   ├── components/
│   │   │   ├── CodeEditor.tsx   # Monaco Editor + test case runner
│   │   │   ├── ProctoringBar.tsx # Camera feed + mic + event counter
│   │   │   └── ResumeUpload.tsx  # Drag-and-drop resume uploader
│   │   ├── hooks/
│   │   │   ├── useMicrophone.ts      # Mic access + Web Speech API
│   │   │   ├── useBrowserProctoring.ts # Tab/window/keyboard monitoring
│   │   │   └── useInterviewWebSocket.ts # WebSocket connection
│   │   ├── pages/
│   │   │   ├── candidate/       # Dashboard, InterviewPage, CodingPage
│   │   │   ├── recruiter/       # Dashboard, ReportsPage
│   │   │   └── auth/            # Login, Register
│   │   ├── store/
│   │   │   └── auth.ts          # Zustand auth state (token persistence)
│   │   └── types/               # TypeScript type definitions
│   ├── Dockerfile               # Multi-stage: Vite build → Nginx
│   ├── nginx.conf
│   └── vercel.json              # SPA rewrite rules
│
├── infrastructure/
│   ├── kubernetes/              # K8s manifests (base + overlays)
│   ├── monitoring/              # Prometheus + Grafana configs
│   └── docker/
│
├── docs/
│   ├── PROJECT_SUMMARY.md
│   └── BUILD_AND_DEPLOYMENT.md  # Full deployment history and guide
│
├── render.yaml                  # Render Blueprint (IaC)
├── docker-compose.yml           # Local full-stack setup
└── .github/workflows/ci.yml     # GitHub Actions CI pipeline
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### Local Development

**1. Clone the repo**
```bash
git clone https://github.com/kunalkosh2004/AI-Interview-Platform.git
cd AI-Interview-Platform
```

**2. Backend setup**
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and edit the env file
cp .env.example .env
# Edit backend/.env — set your LLM API key at minimum

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

**3. Frontend setup**
```bash
cd frontend
npm install

# Create env file
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Start dev server
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:8000/docs`.

### Docker Compose

Starts everything — PostgreSQL, Redis, backend, frontend — with one command:

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6380 |

**Rebuild after code changes:**
```bash
docker compose up -d --build
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET_KEY` | ✅ | Secret key for JWT signing (use a long random string) |
| `LLM_PROVIDER` | ✅ | `gemini` \| `groq` \| `openrouter` \| `openai` \| `anthropic` |
| `GEMINI_API_KEY` | ⭐ | Required if `LLM_PROVIDER=gemini` |
| `GROQ_API_KEY` | ⭐ | Required if `LLM_PROVIDER=groq` |
| `OPENROUTER_API_KEY` | ⭐ | Required if `LLM_PROVIDER=openrouter` |
| `OPENAI_API_KEY` | ⭐ | Required if `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | ⭐ | Required if `LLM_PROVIDER=anthropic` |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins |
| `STORAGE_BACKEND` | ✅ | `local` \| `s3` |
| `AWS_ACCESS_KEY_ID` | S3 only | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | S3 only | AWS IAM secret key |
| `AWS_S3_BUCKET` | S3 only | S3 bucket name |
| `AWS_REGION` | S3 only | AWS region (default: `us-east-1`) |
| `AWS_ENDPOINT_URL` | LocalStack | Set to `http://localhost:4566` for local S3 testing |

### Frontend (Vercel / `.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL e.g. `https://your-backend.onrender.com` |

---

## API Reference

Full interactive docs available at `/docs` (Swagger UI) and `/redoc`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Create account (candidate or recruiter) |
| `POST` | `/api/v1/auth/login` | Login, returns access + refresh tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET` | `/api/v1/auth/me` | Get current user profile |
| `GET` | `/api/v1/auth/candidates` | List all candidates (recruiter only) |

### Resumes
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/resumes/upload` | Upload PDF resume (auto-parsed by AI) |
| `GET` | `/api/v1/resumes/me` | Get your resume |
| `DELETE` | `/api/v1/resumes/{id}` | Delete resume |

### Interviews
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/interviews/` | List interviews |
| `POST` | `/api/v1/interviews/` | Create interview (recruiter only) |
| `GET` | `/api/v1/interviews/{id}` | Get interview details |
| `POST` | `/api/v1/interviews/{id}/start` | Mark interview as started |
| `POST` | `/api/v1/interviews/{id}/end` | Mark interview as completed |
| `POST` | `/api/v1/interviews/{id}/session/start` | Generate questions + welcome message |
| `POST` | `/api/v1/interviews/{id}/session/answer` | Submit answer, get AI evaluation + follow-up |
| `GET` | `/api/v1/interviews/{id}/session/conversation` | Full conversation history |
| `POST` | `/api/v1/interviews/{id}/report/generate` | Generate AI evaluation report |
| `GET` | `/api/v1/interviews/{id}/report` | Get generated report |
| `POST` | `/api/v1/interviews/{id}/proctoring/events` | Log proctoring event |
| `GET` | `/api/v1/interviews/{id}/proctoring/events` | Get all proctoring events |

### WebSocket
```
ws://localhost:8000/ws/interview/{interview_id}?token={access_token}
```

---

## Deployment

### Frontend — Vercel

1. Import repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add environment variable: `VITE_API_URL=https://your-backend.onrender.com`
4. Deploy

### Backend — Render

1. Create **PostgreSQL** on [neon.tech](https://neon.tech) (free tier)
2. Create **Redis** on [upstash.com](https://upstash.com) (free tier)
3. Create **Web Service** on [render.com](https://render.com):
   - Runtime: **Docker**
   - Dockerfile Path: `./backend/Dockerfile`
   - Docker Context: `./backend`
4. Add environment variables (see table above)
5. Deploy — Alembic migrations run automatically on startup

> **Note:** Render free tier spins down after 15 min of inactivity. First request after sleep takes ~30s. Upgrade to Starter ($7/mo) for always-on.

### Using render.yaml (Blueprint)

The repo includes a `render.yaml` for one-click infrastructure setup:

1. Render Dashboard → **New** → **Blueprint**
2. Connect your GitHub repo
3. Render reads `render.yaml` and creates all services
4. Set your API keys manually in the dashboard

### Local S3 Testing with LocalStack

```bash
# Start LocalStack
docker run -d --name localstack -p 4566:4566 -e SERVICES=s3 localstack/localstack

# Create bucket
aws s3 mb s3://ai-interview-local --endpoint-url http://localhost:4566

# Set in backend/.env
STORAGE_BACKEND=s3
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_BUCKET=ai-interview-local
AWS_ENDPOINT_URL=http://localhost:4566
```

---

## CI/CD

GitHub Actions pipeline runs on every push to `main`/`develop` and every PR to `main`.

```
push to main
     │
     ├── backend-lint ──── ruff check + ruff format --check
     │
     ├── backend-test ──── pytest with real Postgres + Redis
     │
     ├── frontend-lint ─── eslint + tsc typecheck
     │
     ├── frontend-build ── vite build
     │
     └── docker-build ──── docker compose build  (after lint passes)
```

### Pre-commit Hook

Automatically installed at `.git/hooks/pre-commit`. Runs `ruff check` and `ruff format` on staged Python files before every commit.

---

## LLM Provider Configuration

The platform supports multiple LLM providers with automatic fallback. Set `LLM_PROVIDER` to your preferred provider and supply the corresponding API key:

| Provider | `LLM_PROVIDER` | Free Tier |
|----------|---------------|-----------|
| Google Gemini | `gemini` | 15 RPM, 1M tokens/day |
| Groq | `groq` | 30 RPM, 14K tokens/min |
| OpenRouter | `openrouter` | Free models available |
| OpenAI | `openai` | Paid only |
| Anthropic | `anthropic` | Paid only |

If the primary provider fails (rate limit, error), the system automatically retries with the next available provider.

---

## Interview Types

| Type | Description |
|------|-------------|
| `mixed` | Balanced mix of verbal, coding, and system design |
| `technical` | Deep technical questions based on resume skills |
| `coding` | Algorithm and data structure problems with test cases |
| `behavioral` | Soft skills, leadership, conflict resolution |
| `system_design` | Architecture, scalability, distributed systems |
| `dsa` | Data structures and algorithms focused |
| `ml` | Machine learning, deep learning, MLOps |

---

## License

MIT — see [LICENSE](LICENSE)
