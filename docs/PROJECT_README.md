# AI Interview Platform — Project Documentation

> **Author:** Kunal Koshta
> **Last Updated:** July 30, 2026

A comprehensive AI-powered technical interview platform that conducts personalized resume-based interviews, evaluates coding skills in real time, detects cheating using computer vision and browser monitoring, and generates detailed recruiter insights with hiring recommendations.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Current State](#current-state)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Backend Implementation](#backend-implementation)
  - [API Layer (FastAPI Routes)](#api-layer-fastapi-routes)
  - [Core Infrastructure](#core-infrastructure)
  - [Database Models](#database-models)
  - [Business Logic Services](#business-logic-services)
  - [Database Migrations](#database-migrations)
  - [Background Workers (Celery)](#background-workers-celery)
  - [Testing](#testing)
- [Frontend Implementation](#frontend-implementation)
  - [API Client Layer](#api-client-layer)
  - [Routing & Auth Guards](#routing--auth-guards)
  - [State Management](#state-management)
  - [Pages & Features](#pages--features)
  - [Reusable Components](#reusable-components)
  - [Custom Hooks](#custom-hooks)
  - [TypeScript Types](#typescript-types)
- [Deployment & Infrastructure](#deployment--infrastructure)
  - [CI/CD Pipeline](#cicd-pipeline)
  - [Production Hosting](#production-hosting)
  - [Docker Compose (Local Dev)](#docker-compose-local-dev)
  - [Infrastructure (Planned)](#infrastructure-planned)
- [Configuration & Environment](#configuration--environment)
- [What's Been Built vs What's Remaining](#whats-been-built-vs-whats-remaining)

---

## Project Overview

The AI Interview Platform automates the technical interview process end-to-end:

1. **Candidates** upload their resume, which is automatically parsed by AI. They then participate in voice/text interviews with dynamic AI-generated questions, solve coding problems in a live editor, and receive real-time evaluation.
2. **Recruiters** schedule interviews, monitor candidate progress, and receive AI-generated evaluation reports with hiring recommendations.
3. **Proctoring** runs in the background — camera motion detection, browser tab switches, copy-paste attempts, DevTools access — all logged with severity levels.

The system uses a multi-LLM provider architecture (Gemini, Groq, OpenRouter, OpenAI, Anthropic) with automatic fallback, so it keeps working even if one provider rate-limits or fails.

---

## Current State

The project is **functionally complete** for a core MVP. Here is the breakdown:

| Area | Status | Details |
|------|--------|---------|
| Backend API | Complete | All REST endpoints implemented, WebSocket real-time communication working |
| Database Schema | Complete | 8 tables with migrations, foreign keys, indexes, and enums |
| LLM Integration | Complete | Multi-provider with automatic fallback; question generation, answer evaluation, and report generation |
| Resume Parsing | Complete | PDF extraction via PyMuPDF, structured parsing via LLM |
| Code Execution | Complete | Sandboxed subprocess execution for Python, JavaScript, Java, C++, Go |
| Proctoring Backend | Complete | Event logging, retrieval, and cheating risk calculation |
| Auth System | Complete | JWT access + refresh tokens, bcrypt hashing, role-based access control |
| Frontend Routing | Complete | Role-based protected routes, auth layouts |
| Candidate Dashboard | Complete | Interview list, status tracking, resume upload |
| Recruiter Dashboard | Complete | Schedule interviews, candidate selection, type/difficulty config |
| Interview Session | Complete | Lobby with camera/mic permissions, Q&A chat, AI responses, coding questions |
| Reports Page | Complete | AI reports with scores, recommendation, strengths/weaknesses, proctoring summary |
| Voice Input | Complete | Web Speech API integration with audio level meter |
| Browser Proctoring | Complete | Tab switch, copy-paste, DevTools, right-click detection |
| Camera Proctoring | Complete | Live feed, motion detection via canvas frame differencing |
| Code Editor | Complete | Monaco Editor with run, test, submit; multi-language |
| Docker Compose | Complete | Full local setup (backend, frontend, Postgres, Redis, Celery worker) |
| CI/CD | Complete | GitHub Actions with lint, test, build for backend and frontend |
| Celery Workers | Stub | Infrastructure in place but no actual background tasks implemented |
| Kubernetes Manifests | Not started | Mentioned in project structure but not created |
| Monitoring Config | Not started | Prometheus/Grafana mentioned in tech stack but not configured |
| `render.yaml` (IaC) | Not started | Mentioned but not created |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | React 18, TypeScript, Vite | SPA with fast builds |
| **UI / Styling** | TailwindCSS, Radix UI, Framer Motion, Lucide Icons | Responsive components, modals, animations |
| **State (Client)** | Zustand + persist middleware | Auth tokens, user profile, persisted to localStorage |
| **State (Server)** | TanStack React Query | API caching, mutations, auto-refetch |
| **HTTP Client** | Axios | Centralized API with auth interceptor + token refresh |
| **Code Editor** | Monaco Editor (via `@monaco-editor/react`) | Multi-language coding environment |
| **Voice / Speech** | Web Speech API (`SpeechRecognition`) | Real-time speech-to-text transcription |
| **Real-time** | Native WebSocket | Live interview chat, typing indicators, proctoring alerts |
| **Charts** | Recharts | Data visualization in reports |
| **Backend Framework** | FastAPI, Python 3.12 | Async REST API + WebSocket |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 (async), Alembic | ORM with async support, migrations |
| **Cache / Queue** | Redis 7 | Celery broker, caching |
| **Auth** | python-jose (JWT) + passlib (bcrypt) | Access/refresh tokens, password hashing |
| **AI / LLM** | OpenAI, Anthropic, Google Gemini, Groq, OpenRouter | Multi-provider with automatic fallback |
| **PDF Parsing** | PyMuPDF (fitz) | Text extraction from resumes |
| **Computer Vision** | OpenCV, MediaPipe (planned for YOLOv8) | Camera proctoring |
| **Background Tasks** | Celery + Redis | Async job processing |
| **Code Execution** | Subprocess sandbox | Python, JS, Java, C++, Go |
| **File Storage** | Local filesystem / AWS S3 | Configurable storage backend |
| **Containers** | Docker, Docker Compose | Local development, production deployment |
| **CI/CD** | GitHub Actions | Lint, test, build pipeline |
| **Frontend Hosting** | Vercel | Static SPA deployment |
| **Backend Hosting** | Render (Docker) | Containerized API deployment |

---

## Architecture Overview

```
┌──────────────────────┐          HTTPS          ┌──────────────────────────┐
│     Vercel (CDN)     │ ◄────────────────────► │    Render (Docker)       │
│  React + Vite + SPA  │                         │  FastAPI + Uvicorn       │
│  (Static assets)     │                         │  WebSocket endpoint      │
└──────────────────────┘                         └────────┬─────────────────┘
                                                          │
                            ┌─────────────────────────────┼──────────────────────────┐
                            │                             │                          │
                   ┌────────▼────────┐          ┌─────────▼─────────┐     ┌──────────▼──────────┐
                   │  PostgreSQL 16  │          │    Redis 7        │     │   AWS S3 / Local    │
                   │   (Neon DB)     │          │  (Upstash)        │     │  (File Storage)     │
                   └─────────────────┘          └───────────────────┘     └─────────────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │ Celery Worker│
                                                   │  (Background)│
                                                   └─────────────┘
```

### Data Flow

1. **Interview Creation:** Recruiter selects candidate → backend fetches parsed resume → `_build_resume_summary()` creates a structured JSON summary attached to the interview.
2. **Session Start:** Candidate begins interview → `start_interview_session()` calls LLM to generate personalized questions (up to 10) based on resume + interview type → questions saved to DB → welcome message with first question returned.
3. **Q&A Loop:** Candidate submits answer → `process_candidate_answer()` saves answer → LLM evaluates correctness/depth → generates follow-up or moves to next question → AI response returned.
4. **Coding Question:** Candidate gets a coding question with starter code → writes code in Monaco Editor → runs against test cases → submits → `evaluate_code_with_ai()` evaluates quality, complexity, naming, edge cases.
5. **Report Generation:** Recruiter triggers report → LLM reviews all Q&A, coding submissions, and proctoring events → returns scores (1-10), strengths/weaknesses, hiring recommendation.
6. **Proctoring:** Browser events (tab switch, copy, DevTools) and camera motion events are logged to `proctoring_events` table → `calculate_cheating_risk()` computes risk level at report time.

---

## Backend Implementation

### API Layer (FastAPI Routes)

All routes are mounted under `/api/v1/` and are fully implemented.

#### Authentication — `backend/app/api/v1/auth.py`

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/auth/register` | Create account (default: candidate) | Public |
| `POST` | `/auth/login` | Email/password login → JWT tokens | Public |
| `POST` | `/auth/refresh` | Refresh access token | Any authed |
| `GET` | `/auth/me` | Current user profile | Any authed |
| `GET` | `/auth/candidates` | List active candidates | Recruiter/Admin |

**Implementation details:**
- Passwords hashed with bcrypt before storage
- JWT tokens have `sub` (user_id), `type` (access/refresh), and `exp` claims
- Access tokens: configurable expiry (default 30 min)
- Refresh tokens: 7-day expiry
- On login, inactive users are rejected

#### Interviews — `backend/app/api/v1/interviews.py`

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `GET` | `/interviews/` | List interviews (role-scoped) | Any authed |
| `POST` | `/interviews/` | Create interview | Recruiter/Admin |
| `GET` | `/interviews/{id}` | Interview details | Role-scoped |
| `PATCH` | `/interviews/{id}` | Update interview | Recruiter/Admin |
| `POST` | `/{id}/start` | Candidate starts interview | Candidate |
| `POST` | `/{id}/end` | End interview | Candidate/Recruiter/Admin |
| `POST` | `/{id}/session/start` | Generate questions via LLM + start session | Candidate |
| `POST` | `/{id}/session/answer` | Submit answer → AI evaluation + follow-up | Candidate |
| `GET` | `/{id}/session/conversation` | Full conversation history | Role-scoped |
| `GET` | `/{id}/session/questions` | All questions for interview | Role-scoped |
| `POST` | `/{id}/report/generate` | Generate AI evaluation report | Recruiter/Admin |
| `GET` | `/{id}/report` | Get generated report | Recruiter/Admin |
| `GET` | `/{id}/proctoring/events` | Proctoring events with severity summary | Recruiter/Admin |
| `POST` | `/{id}/proctoring/events` | Log proctoring event | Candidate |

**Implementation details:**
- Interview lifecycle: `scheduled` → `in_progress` → `completed` / `cancelled`
- `_build_resume_summary()` structures candidate's parsed resume data
- Role scoping: candidates see only their interviews; recruiters see interviews they created; admins see all

#### Resumes — `backend/app/api/v1/resumes.py`

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/resumes/upload` | Upload PDF (max 10MB), auto-parse via LLM | Candidate |
| `GET` | `/resumes/me` | Get own resume | Candidate |
| `GET` | `/resumes/{id}` | Get specific resume | Role-scoped |
| `DELETE` | `/resumes/{id}` | Delete resume + file | Owner |

**Implementation details:**
- Only `.pdf` files accepted
- If user already has a resume, old file is deleted from storage before replacement
- LLM parses extracted text into structured JSON (skills, experience, education, projects, technologies, domain expertise)

#### Coding — `backend/app/api/v1/coding.py`

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/coding/run` | Execute code in sandbox (any language) | Any authed |
| `POST` | `/coding/{session_id}/submit` | Submit code for coding session → run test cases | Candidate |
| `GET` | `/coding/{session_id}` | Get coding session details | Role-scoped |

**Implementation details:**
- Code execution via `asyncio.create_subprocess_exec` with timeout
- Supports Python, JavaScript, Java, C++, Go
- Test cases run individually; results aggregated with pass/fail per case

#### WebSocket — `backend/app/api/v1/websocket.py`

| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/interview/{interview_id}?token={jwt}` | Real-time interview channel |

**Message types handled:**
- `chat` — broadcast chat messages between participants
- `typing` — typing indicators
- `proctoring_event` — log event + broadcast alerts
- `code_update` — live code changes (collaborative editing)
- `user_joined` / `user_left` — auto-broadcasted on connect/disconnect

**`ConnectionManager` class:**
- Manages active connections per interview_id
- `connect()` — authenticates via JWT query param, stores connection
- `disconnect()` — cleans up, notifies room
- `broadcast()` — sends message to all connections in room

---

### Core Infrastructure

| File | Key Classes/Functions | Purpose |
|------|----------------------|---------|
| `core/config.py` | `Settings` (Pydantic `BaseSettings`) | All env vars: DB, Redis, JWT, LLM keys, storage, proctoring, code execution |
| `core/database.py` | `engine`, `async_session`, `Base`, `get_db()` | Async SQLAlchemy engine (pool_size=20, max_overflow=10) |
| `core/security.py` | `hash_password()`, `verify_password()`, `create_access_token()`, `create_refresh_token()`, `decode_token()` | Bcrypt hashing, JWT creation/verification |
| `core/deps.py` | `get_current_user()`, `require_role()` | FastAPI dependency injection for auth + authorization |
| `core/llm.py` | `llm_chat()` | Unified LLM interface with fallback chain: primary → openai → gemini → groq → openrouter |
| `core/storage.py` | `save_file()`, `delete_file()` | File storage abstraction: local filesystem or AWS S3 (with LocalStack support) |

**Settings highlights:**
- `DATABASE_URL` auto-normalizes to asyncpg driver
- `CORS_ORIGINS` accepts both JSON array and comma-separated formats
- `JWT_ALGORITHM` default: HS256
- JWT expiry: access token = 30 min, refresh token = 7 days
- `PROCTORING_ENABLED` flag + `YOLO_MODEL_PATH` for ML-based proctoring
- `CODE_EXECUTION_TIMEOUT` (default 30s) + `CODE_EXECUTION_MEMORY_LIMIT`

**LLM fallback logic:**
1. Try configured `LLM_PROVIDER` (e.g., `gemini`)
2. On rate limit / API error / connection error → try next available provider
3. Skip providers without configured API keys
4. Raise `RuntimeError` if all fail

---

### Database Models

8 tables defined in SQLAlchemy ORM under `backend/app/models/`:

| Model | Table | Key Columns | Relationships |
|-------|-------|-------------|---------------|
| `User` | `users` | id, email (unique), hashed_password, full_name, role (enum: candidate/recruiter/admin), is_active, is_verified, avatar_url | resume (1:1), interviews_as_candidate, interviews_as_recruiter |
| `Resume` | `resumes` | id, user_id (unique FK), file_path, file_name, raw_text, parsed_data (JSON) | user (1:1) |
| `Interview` | `interviews` | id, candidate_id (FK), recruiter_id (FK), resume_id (FK), status (enum), interview_type (enum: technical/behavioral/system_design/dsa/ml/coding/mixed), difficulty_level (1-3), resume_summary (JSON) | candidate, recruiter, resume, questions, coding_sessions, proctoring_events, report (1:1), conversation_messages |
| `InterviewQuestion` | `interview_questions` | id, interview_id (FK), question_text, question_type (enum: mcq/coding/verbal/system_design), category, difficulty, test_cases (JSON), ai_evaluation (JSON) | interview |
| `ConversationMessage` | `conversation_messages` | id, interview_id (FK), role (enum: ai/candidate), content, message_type (enum: text/audio), audio_url | interview |
| `CodingSession` | `coding_sessions` | id, interview_id (FK), problem_title, problem_description, language, starter_code, test_cases (JSON), candidate_code, execution_result (JSON), ai_code_evaluation (JSON) | interview |
| `ProctoringEvent` | `proctoring_events` | id, interview_id (FK), event_type, severity (enum: low/medium/high/critical), confidence, details (JSON), screenshot_url, timestamp_seconds | interview |
| `InterviewReport` | `interview_reports` | id, interview_id (unique FK), scores (JSON: 7 categories), strengths (JSON list), weaknesses, improvement_areas, recommendation (enum: hire/borderline/reject), cheating_risk (enum: low/medium/high), summary | interview |

### Business Logic Services

#### Interview Services — `backend/app/services/interview/`

**`question_generator.py`:**
- `generate_interview_questions(resume, type, difficulty, count, title, description)` → up to 10 AI-generated questions
  - Type-specific rules: ML → 70% ML questions; DSA → 50%+ coding; mixed → balanced across types
  - Coding questions include 3-5 auto-generated test cases
  - `_fallback_questions()` returns hardcoded defaults if LLM fails
- `generate_follow_up(question, answer, resume, previous_questions)` → evaluation + `next_action` (follow_up or next_question)
  - Defaults to "next_question" to maintain interview pace

**`session.py`:**
- `start_interview_session(interview, db)` → generates questions via LLM, saves to DB, creates welcome message with first question
- `process_candidate_answer(interview_id, question_id, answer_text, resume, db)` → saves answer, evaluates via LLM, generates AI response with follow-up or next question
  - `_get_next_unanswered_question()` finds next by `order_index`
  - `_score_from_evaluation()` maps LLM evaluation to numeric score (0-10)
  - On last question, AI sends completion message

#### Resume Services — `backend/app/services/resume/`

- `extract_text_from_pdf(file_path)` / `extract_text_from_pdf_bytes(file_bytes)` → PyMuPDF text extraction
- `parse_resume_with_llm(raw_text)` → sends to LLM with strict JSON schema prompt
  - `_normalize(data)` standardizes field names and structures
  - `_fallback_parse(raw_text)` → keyword-based skill detection as fallback
  - Strips markdown code fences from LLM responses

#### Evaluation Services — `backend/app/services/evaluation/`

- `generate_interview_report(interview_id, db)` → builds comprehensive prompt with Q&A history, coding submissions, proctoring summary → LLM returns scores, strengths/weaknesses, recommendation, summary
  - Cheating risk injected from proctoring event analysis
  - `_fallback_report()` returns average scores if LLM fails

#### Coding Services — `backend/app/services/coding/`

**`executor.py`:**
- `execute_code(code, language, test_cases?, time_limit?, memory_limit?)` → sandboxed execution
  - Python: wraps test cases with harness that calls `solution()`
  - Non-Python (JS/Java/C++/Go): runs each test case individually with I/O
  - Single execution: returns stdout, stderr, exit_code
  - Uses temp files + subprocess with timeout

**`evaluator.py`:**
- `evaluate_code_with_ai(code, language, problem_description, execution_result)` → LLM evaluates:
  - quality_score, time_complexity, space_complexity
  - naming_conventions, readability, edge_cases, design_patterns
  - Fallback evaluation if LLM fails

#### Proctoring Services — `backend/app/services/proctoring/`

- `SEVERITY_MAP`: `devtools_open` → critical, `copy_paste` → high, `tab_switch` → medium, etc.
- `log_proctoring_event()` → persists event to DB
- `get_interview_proctoring_events()` → ordered list
- `calculate_cheating_risk(events)` → rule-based: 2+ critical or 3+ high = "high"; 1 critical / 1+ high / 5+ medium = "medium"; else "low"

---

### Database Migrations

3 Alembic migration revisions:

| Revision | Name | Changes |
|----------|------|---------|
| `b10db5bb867c` | `initial_schema` | Creates all 8 tables with columns, FKs, enums, indexes |
| `a1b2c3d4e5f6` | `add_resume_summary_to_interviews` | Adds `resume_summary` JSON column |
| `b2c3d4e5f6a7` | `add_test_cases_to_interview_questions` | Adds `test_cases` JSON column |

Migrations run automatically at container startup (`alembic upgrade head` in Docker CMD).

---

### Background Workers (Celery)

- Infrastructure in place: `celery[redis]` in requirements, Celery service in docker-compose.yml, `backend/app/workers/` package created
- **No actual tasks implemented yet** — package contains only an empty `__init__.py`

---

### Testing

- **Framework:** pytest, pytest-asyncio, pytest-cov, httpx, factory-boy
- **Configuration:** `asyncio_mode = "auto"`, test paths = `["tests"]`
- **Current tests:** 1 placeholder test file (`tests/test_placeholder.py`)
- **CI tests:** GitHub Actions spins up real PostgreSQL 16 + Redis 7 as service containers, installs deps, runs `pytest -v --cov=app --cov-report=xml`

---

## Frontend Implementation

### API Client Layer

**`src/api/client.ts`:**
- Shared Axios instance with `VITE_API_URL/api/v1` base URL
- **Request interceptor:** attaches Bearer token from Zustand auth store
- **Response interceptor:** on 401 → attempts silent token refresh with stored refresh token → retries original request → on refresh failure → logs out, redirects to `/login`

**`src/api/resume.ts`:** All API functions:
- `uploadResume(file)` → POST multipart form
- `getMyResume()`, `deleteResume(id)`
- `startInterviewSession(id)`, `submitAnswer(id, questionId, text)`
- `getConversation(id)`, `getQuestions(id)`
- `submitCode(sessionId, code, language)`, `runCode(code, language, testCases?)`
- `logProctoringEvent(interviewId, event)`, `getProctoringEvents(interviewId)`

### Routing & Auth Guards

**`src/App.tsx`** — React Router v6 configuration:

| Path | Component | Access |
|------|-----------|--------|
| `/` | Redirect (based on auth/role) | All |
| `/login` | `LoginPage` | Public |
| `/register` | `RegisterPage` | Public |
| `/candidate` | `CandidateDashboard` | Candidate |
| `/interview/:id` | `InterviewPage` | Candidate |
| `/coding/:sessionId` | `CodingPage` | Candidate |
| `/recruiter` | `RecruiterDashboard` | Recruiter/Admin |
| `/reports/:interviewId` | `ReportsPage` | Recruiter/Admin |

- `ProtectedRoute` component checks `isAuthenticated` + allowed roles
- Unauthenticated → redirect to `/login`
- Wrong role → redirect to `/`

### State Management

**`src/store/auth.ts`** (Zustand + persist middleware):
- **State:** `user`, `accessToken`, `refreshToken`, `isAuthenticated`
- **Actions:** `login(user, accessToken, refreshToken)`, `logout()`, `setUser()`
- **Persistence:** localStorage under key `"auth-storage"`

### Pages & Features

#### Authentication

**`LoginPage.tsx`:**
- Email/password form
- On success: calls `/auth/login` for tokens, then `/auth/me` for profile
- Stores via Zustand `login()`
- Redirects by role: recruiter/admin → `/recruiter`, candidate → `/candidate`

**`RegisterPage.tsx`:**
- Full name, email, password (min 8 chars), role (candidate/recruiter dropdown)
- Auto-logs in after successful registration

#### Candidate Flow

**`CandidateDashboard.tsx`:**
- Embedded `ResumeUpload` component
- Stats cards: total / completed / upcoming interviews
- Interviews list with status badges (scheduled=🟡, in_progress=🟢, completed=🔵, cancelled=🔴)
- Action buttons: "Start" or "Continue" based on status

**`InterviewPage.tsx`** — The core interview experience:

1. **Lobby screen** (before session starts):
   - Interview metadata (title, description, duration, type, difficulty)
   - Camera permission flow: request → preview → "granted" required to start
   - Microphone permission: optional but encouraged

2. **Active session:**
   - Progress bar (question X of Y with %)
   - `ProctoringBar` at top
   - Scrollable chat area: AI bubbles (gray) + candidate bubbles (blue)
   - AI evaluations shown inline with correctness/depth tags
   - Text input with voice toggle (read-only when recording, shows audio level bar)
   - Code editor panel for coding questions (50/50 split, question header + Monaco Editor)
   - Submit → AI evaluates → follow-up or next question displayed

3. **End state:** On last question answer, AI sends completion → marks interview completed → redirects to `/candidate`

**`CodingPage.tsx`:**
- Stub page for standalone coding sessions (separate from interview flow)
- Not yet fully implemented

#### Recruiter Flow

**`RecruiterDashboard.tsx`:**
- Stats cards: total / scheduled / in progress / completed
- "Schedule Interview" modal with form:
  - Candidate select (fetched from `/auth/candidates`)
  - Title, Description, Type (mixed/technical/coding/behavioral/system_design/DSA)
  - Difficulty (Easy/Medium/Hard), Duration (15-180 min)
- Interviews list with status badges
- Completed → "View Report" link to `/reports/:interviewId`

**`ReportsPage.tsx`:**
- **No report state:** "Generate Report" button → calls `/interviews/:id/report/generate`
- **Report sections:**
  - Recommendation badge: HIRE (green) / BORDERLINE (yellow) / REJECT (red)
  - Summary paragraph
  - Technical scores (7 categories, color-coded bars)
  - Proctoring assessment: cheating risk badge + event summary + collapsible event list
  - Strengths list (green), Weaknesses list (yellow)
  - Improvement areas (blue pills)

### Reusable Components

**`ResumeUpload.tsx`:**
- Drag-and-drop PDF upload zone (validates type + 10MB size)
- Existing resume display: file name, date, parsed skills (overflow pills), stat cards (experience years, technologies, projects, domains)
- Upload/delete mutations with React Query

**`CodeEditor.tsx`:**
- Language selector: Python, JavaScript, Java, C++, Go (switching resets to default stub)
- Monaco Editor (dark theme, minimap off, JetBrains Mono font, word wrap)
- **Run** → sandbox execution → terminal-style output panel
- **Run Tests** → test case results with pass/fail per case
- **Submit** → triggers `onSubmit` prop
- **Copy** → clipboard with toast
- Bottom panel tabs: "Test Cases" (input/expected/got) / "Output" (stdout/stderr or test summary)

**`ProctoringBar.tsx`:**
- Camera preview (80x60, flipped) or "Camera Off" placeholder
- Hidden canvas motion detection (160x120, sampled every 2s, 40% threshold)
- Mic status pill (browser permission query)
- Status indicators: green shield, amber event counter, animated alert for recent events
- Event listeners: tab switch, window blur, copy/paste (prevented), right-click (prevented), DevTools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U — all prevented)
- Auto-starts camera, cleans up on unmount

**`MainLayout.tsx`:**
- Header with brand link, role-aware nav, user avatar + name + role badge, logout button
- Active route highlighting
- `<Outlet />` for nested routes

**`AuthLayout.tsx`:**
- Full-screen gradient background
- Centered column: "AI Interview Platform" title, tagline, white card for forms

### Custom Hooks

**`useMicrophone.ts`:**
- Permission management: `pending` → `checking` → `granted` | `denied`
- Audio level meter using `AudioContext` + `AnalyserNode` (~10fps via requestAnimationFrame)
- Speech-to-text via `webkitSpeechRecognition` (continuous, interim results, English)
- Cleanup of all resources on unmount

**`useInterviewWebSocket.ts`:**
- Derives WebSocket URL from env vars
- Connects to `/ws/interview/{id}?token={token}`
- Parses JSON messages → invokes `onMessage` callback
- Auto-reconnects on mount
- `sendMessage()` sends only if `WebSocket.OPEN`

**`useBrowserProctoring.ts`:**
- Monitors: `visibilitychange` (tab_switch, medium), `blur` (window_blur, low), copy/paste (copy_paste, high, prevented), `contextmenu` (right_click, low, prevented), `keydown` (devtools_open, critical, prevented), `resize` (screen_resize, low)
- Timestamps relative to interview start
- Sends via callback

### TypeScript Types

**`src/types/index.ts`:**
- `User` — id, email, full_name, role, is_active, is_verified, avatar_url, created_at
- `Resume` — id, user_id, file_name, file_path, raw_text, parsed_data (skills, experience_years, experience[], education[], projects[], technologies[], domain_expertise[])
- `Interview` — id, candidate_id, recruiter_id, resume_id, title, description, interview_type, difficulty_level, status, timestamps, duration_minutes
- `Question` — id, question_text, question_type, category, difficulty, order_index, answer_text, test_cases[], ai_evaluation (score, correctness, depth, feedback, follow_up)
- `ConversationMessage` — id, role (ai|candidate), content, message_type, audio_url
- `CodingSession` — full coding session with problem, code, execution_result, ai_code_evaluation
- `ProctoringEvent` — id, event_type, severity, confidence, details, screenshot_url, timestamp_seconds
- `InterviewReport` — id, scores (7 categories), strengths[], weaknesses[], improvement_areas[], recommendation (hire|borderline|reject), cheating_risk (low|medium|high), summary

---

## Deployment & Infrastructure

### CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

Triggers on push to `main`/`develop` and PR to `main`:

```
push to main
     │
     ├── backend-lint ──── Python 3.12, ruff check + ruff format --check
     │
     ├── backend-test ──── pytest with real Postgres 16 + Redis 7 (service containers)
     │
     ├── frontend-lint ─── Node 20, npm ci, eslint + tsc typecheck
     │
     ├── frontend-build ── Node 20, npm ci, vite build
     │
     └── docker-build ──── docker compose build (after lint passes)
```

No deployment step — Vercel and Render auto-deploy from the repository on push.

### Production Hosting

| Service | Platform | URL / Config |
|---------|----------|-------------|
| Frontend | Vercel | `ai-interview-platform-xi-two.vercel.app` — SPA with `vercel.json` rewrite rules |
| Backend API | Render (Docker) | `ai-interview-platform-vucd.onrender.com` — Docker container with auto-migration |
| API Docs | Render (Docker) | `ai-interview-platform-vucd.onrender.com/docs` — Swagger UI |
| Database | Neon (PostgreSQL) | Free tier |
| Redis | Upstash | Free tier |
| Storage | AWS S3 | Configurable via env vars |

### Docker Compose (Local Dev)

**File:** `docker-compose.yml` — 5 services:

| Service | Build / Image | Port | Depends On |
|---------|--------------|------|-----------|
| `backend` | `./backend/Dockerfile` | `8000:8000` | postgres (healthy), redis (healthy) |
| `frontend` | `./frontend/Dockerfile` (Vite→Nginx) | `80:80` | backend |
| `postgres` | `postgres:16-alpine` | `5432:5432` | — |
| `redis` | `redis:7-alpine` | `6380:6379` | — |
| `celery_worker` | Same as backend | — | postgres, redis |

Volumes: `postgres_data`, `redis_data`, `model_weights` (for ML models)

### Infrastructure (Planned)

The following are referenced in the project structure but **not yet implemented**:
- `infrastructure/kubernetes/` — K8s manifests
- `infrastructure/monitoring/` — Prometheus + Grafana configs
- `render.yaml` — Render Blueprint IaC

---

## Configuration & Environment

### Backend Variables (`backend/.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL async connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET_KEY` | ✅ | Long random string |
| `LLM_PROVIDER` | ✅ | gemini / groq / openrouter / openai / anthropic |
| `GEMINI_API_KEY` | ⭐ | Required if provider = gemini |
| `GROQ_API_KEY` | ⭐ | Required if provider = groq |
| `OPENROUTER_API_KEY` | ⭐ | Required if provider = openrouter |
| `OPENAI_API_KEY` | ⭐ | Required if provider = openai |
| `ANTHROPIC_API_KEY` | ⭐ | Required if provider = anthropic |
| `CORS_ORIGINS` | ✅ | Comma-separated or JSON array |
| `STORAGE_BACKEND` | ✅ | `local` or `s3` |
| `AWS_*` | S3 only | Access key, secret, bucket, region, endpoint URL |

### Frontend Variables (`VITE_API_URL`)

Required for both dev and production. Defaults to `""` in dev (proxied via Vite).

---

## What's Been Built vs What's Remaining

### ✅ Fully Built

- **Backend REST API** — All auth, interview, resume, coding, proctoring, report endpoints
- **WebSocket real-time communication** — Chat, typing, proctoring, code updates
- **LLM integration** — Multi-provider with automatic fallback; question generation, answer evaluation, code evaluation, report generation
- **Resume parsing** — PDF → text → structured JSON via LLM
- **Code execution** — Sandboxed subprocess for 5 languages
- **Proctoring** — Backend event logging + risk calculation
- **Authentication** — JWT access/refresh tokens, bcrypt, role-based access
- **Database** — Full schema (8 tables), 3 migration revisions
- **Frontend routing** — Role-based protected routes
- **Auth pages** — Login and register
- **Candidate dashboard** — Interviews list, resume upload, stats
- **Recruiter dashboard** — Schedule interview modal, candidate list, reports link
- **Interview session** — Lobby with permissions, Q&A chat, AI evaluation, coding questions, progress tracking
- **Reports page** — AI-generated evaluation with scores, recommendation, proctoring summary
- **Resume upload component** — Drag-and-drop, validation, parsed data display
- **Code editor component** — Monaco Editor, multi-language, run/tests/submit
- **Proctoring bar** — Camera feed, motion detection, browser event monitoring
- **Voice input hook** — Web Speech API, audio level metering
- **WebSocket hook** — Real-time interview communication
- **Browser proctoring hook** — Tab switch, copy, DevTools monitoring
- **TypeScript types** — Complete type definitions
- **Docker Compose** — Full local dev environment
- **CI/CD** — GitHub Actions with lint, test, build
- **Dockerfiles** — Backend (Python slim) + Frontend (multi-stage Vite→Nginx)

### 🚧 Partially Built

- **Celery workers** — Infrastructure exists but no background tasks implemented
- **Standalone coding page** — Route exists but page is a stub

### ❌ Not Yet Started

- **YOLOv8 / MediaPipe** — ML-based object/person detection for advanced proctoring (library imported but not used)
- **Kubernetes manifests** — Referenced in project structure
- **Monitoring** — Prometheus + Grafana configs
- **`render.yaml`** — Render Blueprint IaC
- **Comprehensive test suite** — Backend has placeholder tests only

---

## File Tree

```
AI-Interview-Platform/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                         # FastAPI app factory, CORS, exception handler
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── v1/
│   │   │       ├── __init__.py              # Router aggregation
│   │   │       ├── auth.py                 # Register, login, refresh, /me
│   │   │       ├── interviews.py           # Full interview CRUD, session, reports, proctoring
│   │   │       ├── resumes.py              # Upload, get, delete resumes
│   │   │       ├── coding.py               # Code execution and submission
│   │   │       └── websocket.py            # WebSocket real-time communication
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py                   # Pydantic Settings (all env vars)
│   │   │   ├── database.py                 # Async SQLAlchemy engine + session
│   │   │   ├── security.py                 # JWT + bcrypt utilities
│   │   │   ├── deps.py                     # FastAPI dependency injection
│   │   │   ├── llm.py                      # Multi-provider LLM client with fallback
│   │   │   └── storage.py                  # Local / S3 file storage abstraction
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py                     # User model (candidate/recruiter/admin)
│   │   │   ├── resume.py                   # Resume model with parsed_data JSON
│   │   │   ├── interview.py                # Interview, ConversationMessage models
│   │   │   ├── question.py                 # InterviewQuestion model
│   │   │   └── coding.py                   # CodingSession, ProctoringEvent, InterviewReport
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── user.py                     # UserCreate, UserLogin, TokenResponse, etc.
│   │   │   ├── interview.py                # InterviewCreate/Response, QuestionResponse, etc.
│   │   │   └── resume.py                   # ResumeResponse, ParsedResumeData
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth/__init__.py            # Placeholder
│   │   │   ├── analytics/__init__.py       # Placeholder
│   │   │   ├── interview/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── question_generator.py   # LLM question generation + follow-up
│   │   │   │   └── session.py              # Session lifecycle management
│   │   │   ├── resume/
│   │   │   │   ├── __init__.py
│   │   │   │   └── parser.py               # PDF extraction + LLM parsing
│   │   │   ├── evaluation/
│   │   │   │   ├── __init__.py
│   │   │   │   └── report.py               # AI report generation
│   │   │   ├── coding/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── executor.py             # Sandboxed code execution
│   │   │   │   └── evaluator.py            # AI code quality evaluation
│   │   │   └── proctoring/
│   │   │       ├── __init__.py
│   │   │       └── browser.py              # Proctoring event management + risk calculation
│   │   └── workers/
│   │       └── __init__.py                 # Empty (Celery tasks not yet implemented)
│   ├── alembic/
│   │   ├── env.py                          # Async Alembic environment
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── b10db5bb867c_initial_schema.py
│   │       ├── a1b2c3d4e5f6_add_resume_summary.py
│   │       └── b2c3d4e5f6a7_add_test_cases.py
│   ├── tests/
│   │   └── test_placeholder.py             # Placeholder
│   ├── storage/resumes/                    # Local file storage
│   ├── Dockerfile
│   ├── requirements.txt                    # 70 dependencies
│   ├── pyproject.toml                      # Ruff, mypy, pytest config
│   ├── alembic.ini
│   └── .env                                # Local dev env (gitignored)
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                   # Axios instance with auth interceptors
│   │   │   └── resume.ts                   # All API functions
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AuthLayout.tsx          # Centered card layout for auth
│   │   │   │   └── MainLayout.tsx          # Header + nav + content
│   │   │   ├── CodeEditor.tsx              # Monaco Editor wrapper
│   │   │   ├── ProctoringBar.tsx           # Camera + browser proctoring UI
│   │   │   └── ResumeUpload.tsx            # Drag-and-drop resume uploader
│   │   ├── hooks/
│   │   │   ├── useMicrophone.ts            # Mic + Web Speech API + audio level
│   │   │   ├── useInterviewWebSocket.ts    # WebSocket connection
│   │   │   └── useBrowserProctoring.ts     # Browser event detection
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   └── RegisterPage.tsx
│   │   │   ├── candidate/
│   │   │   │   ├── CandidateDashboard.tsx  # Interview list + resume upload
│   │   │   │   ├── InterviewPage.tsx       # Core interview experience
│   │   │   │   └── CodingPage.tsx          # Stub
│   │   │   └── recruiter/
│   │   │       ├── RecruiterDashboard.tsx  # Schedule + manage interviews
│   │   │       └── ReportsPage.tsx         # AI evaluation reports
│   │   ├── store/
│   │   │   └── auth.ts                     # Zustand auth state
│   │   ├── types/
│   │   │   └── index.ts                    # All TypeScript interfaces
│   │   ├── App.tsx                         # Routing configuration
│   │   ├── main.tsx                        # Entry point (QueryClient, Router, Toaster)
│   │   └── index.css                       # Tailwind + CSS variables
│   ├── Dockerfile                          # Multi-stage: Vite build → Nginx
│   ├── nginx.conf                          # SPA + API proxy
│   ├── vercel.json                         # SPA rewrite rules
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── .env.example
│   └── index.html
│
├── docs/
│   └── PROJECT_README.md                   # This file
│
├── .github/workflows/
│   └── ci.yml                              # GitHub Actions CI pipeline
├── docker-compose.yml                      # Full local dev environment
├── .env.example                            # All env vars documented
├── .gitignore
├── README.md                               # Public-facing README
└── LICENSE                                 # MIT
```
