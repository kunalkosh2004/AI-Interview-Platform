# AI Interview Platform — Build & Deployment Log

A complete record of everything built, fixed, and deployed for the AI Interview Platform project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Features Built](#3-features-built)
4. [Microphone Access Feature](#4-microphone-access-feature)
5. [Bug Fixes & Code Changes](#5-bug-fixes--code-changes)
6. [Deployment Architecture](#6-deployment-architecture)
7. [Deployment Guide — Step by Step](#7-deployment-guide--step-by-step)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Known Issues & Notes](#10-known-issues--notes)

---

## 1. Project Overview

An AI-powered technical interview platform that:
- Conducts personalized resume-based interviews using LLMs
- Evaluates coding skills in real time with Monaco Editor
- Detects cheating using Computer Vision (YOLO) and browser proctoring
- Generates detailed recruiter reports with hiring recommendations

**Live URLs:**
- Frontend: https://ai-interview-platform-xi-two.vercel.app
- Backend API: https://ai-interview-platform-vucd.onrender.com
- API Docs: https://ai-interview-platform-vucd.onrender.com/docs

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| Database | PostgreSQL (Neon — free tier) |
| Cache / Queue | Redis (Upstash — free tier) |
| AI/LLM | Gemini 2.5 Flash / Groq / OpenRouter / OpenAI / Anthropic |
| Computer Vision | YOLOv8, OpenCV, MediaPipe |
| Background Tasks | Celery + Redis |
| Frontend Hosting | Vercel |
| Backend Hosting | Render (Docker, free tier) |
| CI/CD | GitHub Actions |

---

## 3. Features Built

### Backend
- JWT authentication (register, login, refresh token, `/me`)
- Resume upload and AI parsing (PyMuPDF + LLM extraction)
- AI interview session management (question generation, answer evaluation)
- Real-time WebSocket interview channel
- Browser + camera proctoring event logging
- Coding question execution and evaluation
- Recruiter analytics and report generation
- Async SQLAlchemy with Alembic migrations
- Celery background task infrastructure

### Frontend
- Auth pages (Login, Register) with Zustand store
- Candidate Dashboard — view interviews, upload resume
- Interview Page — AI chat interface with progress tracking
- Coding Page — Monaco Editor with test case runner
- Recruiter Dashboard — candidate list, reports
- Reports Page — detailed evaluation breakdown
- Proctoring Bar — live camera feed + event counter
- Resume Upload — drag and drop with progress

---

## 4. Microphone Access Feature

Added full microphone support to the interview flow.

### Files created / modified

#### `frontend/src/hooks/useMicrophone.ts` *(new)*
- `requestPermission()` — calls `getUserMedia({ audio: true })`, tracks state: `pending → checking → granted | denied`
- `startRecording()` / `stopRecording()` — Web Speech API (`SpeechRecognition`) for live transcription with continuous + interim results
- `audioLevel` (0–100) — powered by Web Audio API `AnalyserNode`, updates ~10fps while recording
- Full cleanup on unmount

#### `frontend/src/pages/candidate/InterviewPage.tsx`
- **Lobby:** After camera is granted, a mic permission block appears (violet theme, optional)
- **During interview:** Mic toggle button next to Send button (only shown when mic is granted)
- While recording: textarea goes read-only, fills with live transcript, animated waveform bar shows audio level
- Stopping mic locks transcript into textarea for editing before submitting

#### `frontend/src/components/ProctoringBar.tsx`
- Added "Mic Active / Mic Off" status pill next to Camera pill
- Uses Permissions API to reflect real browser mic state

---

## 5. Bug Fixes & Code Changes

### Docker / Local Development

**`backend/Dockerfile`** — CMD was using exec form, making `&&` a literal argument
```dockerfile
# Before (broken)
CMD alembic upgrade head && uvicorn ...

# After (correct)
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

**`docker-compose.yml`**
- Added `env_file: ./backend/.env` to backend and celery_worker services
- Added explicit env var overrides to use Docker service hostnames (`postgres`, `redis`) instead of `localhost`
- CORS_ORIGINS updated to include Vercel URL

**`backend/.env`** (local dev)
- Fixed `DATABASE_URL` from `localhost:5432` → `postgres:5432`
- Fixed `REDIS_URL` from `localhost:6380` → `redis:6379` (container port, not host-mapped port)

---

### Render / Neon Deployment Fixes

**`backend/app/core/config.py`** — `DATABASE_URL` validator rewritten to handle all Neon/Render URL quirks:

```python
# Handles:
# 1. postgres:// → postgresql+asyncpg:// (scheme fix)
# 2. sslmode=require → ssl=require (asyncpg doesn't accept sslmode)
# 3. channel_binding=require → stripped (asyncpg doesn't accept this)
# 4. Any other psycopg2-only params → stripped via URL parsing whitelist
```

Uses `urllib.parse` to whitelist only asyncpg-safe query params: `ssl`, `timeout`, `command_timeout`, `server_settings`. Everything else (channel_binding, sslmode, options) is dropped.

**`backend/app/core/config.py`** — `CORS_ORIGINS` validator added:

```python
# Handles both formats Render might inject:
# JSON:          ["https://foo.com","https://bar.com"]
# Comma-sep:     https://foo.com,https://bar.com
```

---

### Frontend TypeScript Fix (Vercel build error)

**`frontend/tsconfig.json`**
```json
// Added — without this, TypeScript doesn't know import.meta.env exists
"types": ["vite/client", "dom-speech-recognition"]
```

`vite/client` provides `ImportMeta.env` types.
`dom-speech-recognition` required alongside it because once `types` is explicit, TypeScript stops auto-discovering `@types/*` packages.

---

### Alembic

**`backend/alembic.ini`** — replaced hardcoded localhost URL with placeholder (env.py already overrides it at runtime via `config.set_main_option`)

---

### CI/CD Ruff Fixes

Fixed 4 ruff violations introduced during the database URL refactor:

| Error | Fix |
|-------|-----|
| `I001` — imports unsorted at top level | Sorted: `pydantic` before `pydantic_settings`, alphabetical within `urllib.parse` |
| `I001` — import inside function body | Moved `urllib.parse` imports to module top level |
| `N806` — `ASYNCPG_SAFE` uppercase constant inside function | Moved to module-level `_ASYNCPG_SAFE_PARAMS` |
| `SIM102` — nested `if` inside `elif` | Collapsed to single `elif key == "sslmode" and val[0] in (...)` |

---

## 6. Deployment Architecture

```
┌─────────────────────────────┐     HTTPS      ┌──────────────────────────────┐
│   Vercel (Frontend)         │ ─────────────► │   Render (Backend API)       │
│   ai-interview-platform-    │                │   ai-interview-platform-     │
│   xi-two.vercel.app         │                │   vucd.onrender.com          │
│                             │                │                              │
│   React + Vite + TailwindCSS│                │   FastAPI + Uvicorn          │
│   Static site (CDN)         │                │   Docker container           │
└─────────────────────────────┘                └──────────────┬───────────────┘
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          │                   │                   │
                                ┌─────────▼──────┐  ┌────────▼───────┐  ┌────────▼──────┐
                                │  Neon Postgres  │  │ Upstash Redis  │  │  Local Storage│
                                │  (free tier)    │  │  (free tier)   │  │  (ephemeral)  │
                                └─────────────────┘  └────────────────┘  └───────────────┘
```

---

## 7. Deployment Guide — Step by Step

### Prerequisites
- GitHub repo pushed
- Neon account (neon.tech)
- Upstash account (upstash.com)
- Render account (render.com)
- Vercel account (vercel.com)

---

### Step 1 — Set up Neon (PostgreSQL)

1. Go to [neon.tech](https://neon.tech) → New Project
2. Name: `ai-interview`
3. Once created → **Connection Details** → copy the **Connection string**
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/ai_interview?sslmode=require&channel_binding=require
   ```
4. Save this — you'll use it as `DATABASE_URL` on Render

---

### Step 2 — Set up Upstash (Redis)

1. Go to [upstash.com](https://upstash.com) → Create Database
2. Name: `ai-interview-redis`, Region: closest to you
3. Once created → **Details** → copy the **Redis URL**
   ```
   rediss://default:password@us1-xxx.upstash.io:6379
   ```
4. Save this — you'll use it as `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

---

### Step 3 — Deploy Backend on Render

1. Render Dashboard → **New** → **Web Service**
2. Connect GitHub → select `AI-Interview-Platform`
3. Settings:
   - **Name:** `ai-interview-backend`
   - **Runtime:** Docker
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Docker Context:** `./backend`
   - **Plan:** Free
4. Add Environment Variables (see full table in Section 8)
5. **Auto-Deploy:** Yes ← important, enables deploy on every push
6. Click **Create Web Service**

---

### Step 4 — Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import `AI-Interview-Platform` from GitHub
3. Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add Environment Variable:
   - `VITE_API_URL` = `https://ai-interview-platform-vucd.onrender.com`
   *(your Render backend URL)*
5. Click **Deploy**

---

### Step 5 — Update CORS on Render

Once both are deployed, go back to Render → Environment and confirm:
```
CORS_ORIGINS = https://ai-interview-platform-xi-two.vercel.app,http://localhost:5173,http://localhost:3000
```

Trigger a Manual Deploy if you changed it.

---

### Step 6 — Verify Everything Works

```bash
# 1. Check backend health
curl https://ai-interview-platform-vucd.onrender.com/health
# Expected: {"status":"healthy","version":"0.1.0"}

# 2. Check CORS preflight passes
curl -X OPTIONS https://ai-interview-platform-vucd.onrender.com/api/v1/auth/login \
  -H "Origin: https://ai-interview-platform-xi-two.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -D -
# Expected: access-control-allow-origin: https://ai-interview-platform-xi-two.vercel.app
```

---

## 8. Environment Variables Reference

Set all of these in **Render → your service → Environment**.

| Key | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | `postgresql://...@neon.tech/...?sslmode=require` | From Neon — paste as-is, validator fixes it |
| `REDIS_URL` | `rediss://...@upstash.io:6379` | From Upstash |
| `CELERY_BROKER_URL` | same as `REDIS_URL` | |
| `CELERY_RESULT_BACKEND` | same as `REDIS_URL` | |
| `JWT_SECRET_KEY` | `<random 32+ char string>` | Run `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `CORS_ORIGINS` | `https://your-frontend.vercel.app,http://localhost:5173` | Comma-separated |
| `LLM_PROVIDER` | `gemini` | or `groq` / `openrouter` / `openai` / `anthropic` |
| `GEMINI_API_KEY` | `your-key` | Only needed if `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `GROQ_API_KEY` | `your-key` | Only needed if `LLM_PROVIDER=groq` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | |
| `OPENROUTER_API_KEY` | `your-key` | Only needed if `LLM_PROVIDER=openrouter` |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | |
| `OPENAI_API_KEY` | `your-key` | Only needed if `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o` | |
| `ANTHROPIC_API_KEY` | `your-key` | Only needed if `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | |
| `STORAGE_BACKEND` | `local` | Change to `s3` for persistent file storage |
| `LOCAL_STORAGE_PATH` | `./storage` | Ephemeral on Render free tier |
| `PROCTORING_ENABLED` | `true` | |
| `CODE_EXECUTION_TIMEOUT` | `30` | Seconds |
| `DEBUG` | `false` | |

**Vercel Environment Variables:**

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://your-backend.onrender.com` |

---

## 9. CI/CD Pipeline

GitHub Actions runs on every push to `main` / `develop` and every PR to `main`.

### Jobs

| Job | What it does |
|-----|-------------|
| `backend-lint` | `ruff check .` + `ruff format --check .` |
| `backend-test` | `pytest` with real Postgres + Redis services |
| `frontend-lint` | `npm run lint` + `npm run typecheck` |
| `frontend-build` | `npm run build` |
| `docker-build` | `docker compose build` (runs after lint passes) |

### Pre-commit Hook (local)

Installed at `.git/hooks/pre-commit` — automatically runs `ruff check` and `ruff format` on staged Python files before every commit, so CI never fails on formatting issues.

---

## 10. Known Issues & Notes

### Render Free Tier Spin-Down
The free tier spins down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds. Upgrade to Starter ($7/month) for always-on behaviour.

### Ephemeral Storage
`STORAGE_BACKEND=local` stores uploaded resumes at `./storage` inside the container. This is wiped on every redeploy. For production, switch to S3:
- Set `STORAGE_BACKEND=s3`
- Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`

### Celery Workers
The `celery_worker` service is defined in `docker-compose.yml` for local dev but not deployed to Render yet. Background tasks (if any) will fail silently in production. To add it: create a second Render Web Service pointing to the same Docker image with command `celery -A app.workers.celery_app worker --loglevel=info`.

### Web Speech API
Voice input in interviews uses the browser's built-in `SpeechRecognition` API. It is supported in Chrome and Edge but **not in Firefox or Safari**. Users on unsupported browsers fall back to typing automatically.

### Neon Connection Pooling
Neon recommends using their connection pooler URL (port `5432` → pooler endpoint) for serverless/short-lived connections. If you see connection exhaustion errors, switch to the pooler connection string from the Neon dashboard.
