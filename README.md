# AI Interview Platform

An AI-powered technical interview platform that conducts personalized resume-based interviews, evaluates coding skills in real time, detects cheating using Computer Vision (YOLO), and generates detailed recruiter insights.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, TailwindCSS, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic |
| Database | PostgreSQL, Redis |
| AI/LLM | OpenAI, Anthropic, LangChain, LangGraph |
| Computer Vision | YOLOv11, OpenCV, MediaPipe |
| Background Tasks | Celery + Redis |
| Infrastructure | Docker, Docker Compose, GitHub Actions |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### 1. Clone & Setup Environment

```bash
git clone https://github.com/kunalkosh2004/AI-Interview-Platform.git
cd AI-Interview-Platform
cp .env.example backend/.env
# Edit backend/.env with your API keys
```

### 2. Docker Compose (Recommended)

```bash
docker compose up -d
```

This starts:
- **Frontend** → http://localhost
- **Backend API** → http://localhost:8000
- **API Docs** → http://localhost:8000/docs
- **PostgreSQL** → localhost:5432
- **Redis** → localhost:6379

### 3. Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
backend/
  app/
    api/v1/          # API route handlers
    core/            # Config, database, auth, dependencies
    models/          # SQLAlchemy ORM models
    schemas/         # Pydantic request/response schemas
    services/        # Business logic (auth, interview, resume, coding, proctoring, evaluation, analytics)
    utils/           # Shared utilities
    workers/         # Celery background tasks

frontend/
  src/
    api/             # Axios client, API functions
    components/      # Reusable UI components
    hooks/           # Custom React hooks
    lib/             # Utility libraries
    pages/           # Route pages (auth, candidate, recruiter, admin)
    store/           # Zustand state stores
    types/           # TypeScript type definitions

infrastructure/
  docker/            # Docker configurations
  kubernetes/        # K8s manifests (base + overlays)
  monitoring/        # Prometheus, Grafana configs
```

## Features

- Resume-based personalized interview generation
- Voice-based AI interviews with dynamic follow-ups
- Real-time coding evaluation with Monaco Editor
- YOLO-based computer vision proctoring
- Browser proctoring (tab switch, copy/paste, etc.)
- AI-generated interview reports with hiring recommendations
- Recruiter and candidate dashboards

## API Documentation

Once running, visit http://localhost:8000/docs for the interactive Swagger UI.

## License

MIT
