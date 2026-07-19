# AI Interview Platform — Project Summary

## Overview

Full-stack, AI-powered technical interview platform. Conducts personalized resume-based interviews, evaluates coding skills in real-time, detects cheating via browser proctoring, and generates detailed recruiter reports with AI-driven hiring recommendations.

---

## Tech Stack

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Frontend      | React 18, TypeScript, Vite, TailwindCSS, React Query (TanStack), Zustand, React Router 6, Framer Motion, Monaco Editor, Recharts, Socket.io Client, Radix UI, Lucide |
| Backend       | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic 2            |
| Database      | PostgreSQL 16 (asyncpg), Redis 7                                            |
| AI / LLM      | OpenAI, Gemini, Groq, OpenRouter, Anthropic (multi-provider chain with failover) |
| Background    | Celery 5.4 + Redis broker                                                   |
| Auth          | JWT (python-jose), bcrypt, HTTP Bearer tokens                                |
| File Storage  | Local filesystem (default) or S3-compatible (boto3)                          |
| Container     | Docker, Docker Compose (5 services)                                         |
| CI/CD         | GitHub Actions (lint, test, build, Docker)                                  |

---

## Directory Structure

```
AI-Interview-Platform/
├── .github/workflows/ci.yml
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app factory
│   │   ├── api/v1/                    # Route handlers
│   │   │   ├── auth.py                # /auth/* (register, login, refresh, me)
│   │   │   ├── interviews.py          # /interviews/*
│   │   │   ├── resumes.py             # /resumes/*
│   │   │   ├── coding.py              # /coding/*
│   │   │   └── websocket.py           # WS /ws/interview/{id}
│   │   ├── core/                      # Config, DB, deps, security, LLM, storage
│   │   ├── models/                    # SQLAlchemy models (6 tables)
│   │   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── services/                  # Business logic
│   │   │   ├── interview/             # Question generator, session manager
│   │   │   ├── coding/                # Code executor, AI evaluator
│   │   │   ├── proctoring/            # Proctoring event + risk logic
│   │   │   ├── resume/                # PDF parser + LLM extraction
│   │   │   └── evaluation/            # AI report generator
│   │   └── workers/                   # Celery placeholder
│   ├── alembic/                       # DB migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.tsx                   # Entry: React Query + Router + Toaster
│   │   ├── App.tsx                    # Routes with ProtectedRoute
│   │   ├── api/                       # Axios client + API functions
│   │   ├── components/                # UI components
│   │   │   ├── CodeEditor.tsx         # Monaco Editor with test runner
│   │   │   ├── ProctoringBar.tsx      # Camera + browser proctoring
│   │   │   ├── ResumeUpload.tsx       # Drag-and-drop resume upload
│   │   │   └── layout/               # AuthLayout, MainLayout
│   │   ├── hooks/                     # useBrowserProctoring, useInterviewWebSocket, useMicrophone
│   │   ├── pages/                     # auth/, candidate/, recruiter/ pages
│   │   └── store/                     # Zustand persisted auth store
│   └── package.json
├── docker-compose.yml
├── infrastructure/                    # K8s manifests + monitoring stubs
└── models/                            # YOLO weights/config stubs
```

---

## Database Schema (6 tables)

| Table                   | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `users`                 | Auth + roles (candidate / recruiter / admin)     |
| `resumes`               | Uploaded PDFs + AI-parsed JSON                    |
| `interviews`            | Interview metadata + status                      |
| `interview_questions`   | Per-question answers + AI evaluation              |
| `conversation_messages` | Chat history (AI + candidate)                    |
| `coding_sessions`       | Coding problem + test cases + execution results  |
| `proctoring_events`     | Tab switch, copy/paste, devtools, motion alerts  |
| `interview_reports`     | AI report with scores, strengths, recommendation |

---

## Features Implemented

### Authentication
- Email/password registration & login (bcrypt + JWT access/refresh tokens)
- Role-based access control (candidate, recruiter, admin)
- Token refresh via Axios interceptor
- Zustand-persisted auth store (localStorage)

### Resume Parsing
- PDF upload (drag-and-drop, 10MB limit, PDF only)
- Text extraction via PyMuPDF
- AI-powered structured parsing (LLM) with keyword fallback
- Local/S3 file storage abstraction

### Interview Management
- Recruiters: schedule interviews (type, difficulty, duration, title)
- Candidates: view assigned interviews, start session
- AI generates 10 personalized questions from resume + interview type
- Question types: verbal, coding, system design, ML, behavioral, DSA

### Live Interview Session
- Real-time Q&A chat with AI evaluation per answer
- Progress bar (current question / total)
- Welcome message on start; auto-complete on last question
- Voice input via Web Speech API (mic permission, audio level meter)

### Coding Evaluation
- Monaco Editor with 5 languages (Python, JavaScript, Java, C++, Go)
- Sandboxed subprocess code execution
- Test case visualization (pass/fail per test)
- AI-powered code quality evaluation (correctness, style, efficiency, edge cases)

### Browser Proctoring
- Tab switch / window blur detection
- Copy/paste prevention & detection
- Right-click prevention
- DevTools open detection (F12, Ctrl+Shift+I, Ctrl+Shift+J)
- Camera feed with frame-differencing motion detection
- Proctoring events logged to DB with severity + risk calculation
- WebSocket broadcast of proctoring alerts

### AI Report Generation
- Multi-dimension scoring (technical, communication, problem-solving, coding, behavioral)
- Strengths, weaknesses, improvement areas
- Hiring recommendation: hire / borderline / reject
- Cheating risk assessment with event timeline
- Interactive Recharts visualizations (radar + bar charts)

### WebSocket Real-time
- Per-interview rooms with connection manager
- Chat messages, typing indicators, code sync, proctoring alerts
- Auth token verification on connect

### LLM Multi-Provider Architecture
- Primary + fallback provider chain (OpenAI → Gemini → Groq → OpenRouter → Anthropic)
- Automatic failover on rate limits / errors
- OpenAI-compatible API abstraction for all providers

---

## State of Development

**Status: Functional prototype** — core architecture is wired end-to-end.

### ✅ Implemented & Working
- Full auth flow with role-based routing
- Resume upload + AI parsing
- Interview CRUD + AI question generation
- Live interview session (chat + voice + progress)
- Monaco code editor with test execution
- Browser proctoring (tab switch, devtools, copy/paste, camera motion)
- AI report generation with charts
- Recruiter & Candidate dashboards
- WebSocket real-time features
- Docker Compose + Dockerfiles + Nginx config
- CI pipeline (GitHub Actions)
- Alembic migration (initial schema)

### 🚧 Stubbed / Planned
- Celery workers (placeholder, docker-compose service exists)
- Analytics service (empty init)
- Computer vision proctoring (YOLO deps installed, not yet integrated; only browser frame-differencing active)
- Admin panel (route imported, folder empty)
- Standalone coding page (`/coding/:sessionId` is a placeholder)
- UI component extraction folders (empty)
- K8s manifests / monitoring configs (scaffolded, no content)
- Model weights/configs (empty)
- Docs folder (empty)

### ⚠️ Known Gaps
- No unit/integration tests (pytest configured, CI expects them)
- `.env` contains live API keys — rotate before production
- `docker-compose.yml` uses `--reload` in production CMD
- `resume_summary` field used in code but missing from migration
- Code execution uses subprocess (Docker SDK dep installed but unused)

---

## Git History

| Commit    | Message       | Details                                      |
| --------- | ------------- | -------------------------------------------- |
| `4a18b19` | Initial commit | `.gitignore`, `LICENSE`, `README.md`          |
| `fe2aa11` | first commit   | Full project codebase (~39K files, 10M+ lines) |

Single large initial code dump — no iterative development history yet.

---

## Architecture Decisions

- **Monorepo** with separate `backend/` and `frontend/` directories
- **FastAPI factory pattern** (`create_app()`) for clean initialization
- **Router-per-resource** API design under `/api/v1`
- **Service layer** separates business logic from API handlers
- **LLM multi-provider with failover chain** — resilient to rate limits
- **Zustand** for client auth state (persisted); local `useState` for interview UI
- **React Query** for server state (caching, invalidation)
- **CSS variables + Tailwind** for light/dark theming
- **Nginx** serves frontend build + reverse-proxies API/WS in production
- **Pydantic `from_attributes`** for ORM-to-schema conversion
