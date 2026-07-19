from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.interview import Interview, InterviewStatus
from app.models.question import ConversationMessage, InterviewQuestion
from app.models.resume import Resume
from app.models.user import User
from app.schemas.interview import (
    ConversationMessageResponse,
    InterviewCreate,
    InterviewResponse,
    InterviewUpdate,
    QuestionResponse,
)
from app.services.interview.session import process_candidate_answer, start_interview_session

router = APIRouter(prefix="/interviews", tags=["interviews"])


# ── CRUD ──────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[InterviewResponse])
async def list_interviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == "candidate":
        result = await db.execute(
            select(Interview)
            .where(Interview.candidate_id == user.id)
            .order_by(Interview.created_at.desc())
        )
    elif user.role == "recruiter":
        result = await db.execute(
            select(Interview)
            .where(Interview.recruiter_id == user.id)
            .order_by(Interview.created_at.desc())
        )
    else:
        result = await db.execute(select(Interview).order_by(Interview.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    payload: InterviewCreate,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    candidate = await db.get(User, payload.candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    resume_summary = None
    if payload.resume_id:
        resume = await db.get(Resume, payload.resume_id)
        if resume and resume.parsed_data:
            resume_summary = _build_resume_summary(resume, candidate)
    else:
        resume = await db.execute(select(Resume).where(Resume.user_id == payload.candidate_id))
        resume = resume.scalar_one_or_none()
        if resume and resume.parsed_data:
            resume_summary = _build_resume_summary(resume, candidate)

    interview = Interview(
        candidate_id=payload.candidate_id,
        recruiter_id=user.id,
        resume_id=payload.resume_id or (resume.id if resume else None),
        title=payload.title,
        description=payload.description,
        interview_type=payload.interview_type,
        difficulty_level=payload.difficulty_level,
        duration_minutes=payload.duration_minutes,
        resume_summary=resume_summary,
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)
    return interview


def _build_resume_summary(resume, candidate) -> dict:
    data = resume.parsed_data
    exp = data.get("experience", [])
    projects = data.get("projects", [])
    education = data.get("education", [])

    exp_text = (
        "; ".join(
            [
                f"{e.get('title', '')} at {e.get('company', '')} ({e.get('duration', '')}): {e.get('description', '')}"
                for e in exp[:3]
            ]
        )
        if exp
        else "No work experience"
    )

    proj_text = (
        "; ".join(
            [
                f"{p.get('name', '')}: {p.get('description', '')} (Tech: {', '.join(p.get('technologies', [])[:5])})"
                for p in projects[:3]
            ]
        )
        if projects
        else "No projects"
    )

    edu_text = (
        "; ".join(
            [
                f"{e.get('degree', '')} from {e.get('institution', '')} ({e.get('year', '')})"
                for e in education[:2]
            ]
        )
        if education
        else "No education"
    )

    return {
        "candidate_name": candidate.full_name,
        "skills": data.get("skills", []),
        "experience_years": data.get("experience_years", 0),
        "experience_summary": exp_text,
        "education": edu_text,
        "projects_summary": proj_text,
        "domain_expertise": data.get("domain_expertise", []),
        "technologies": data.get("technologies", []),
    }


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if user.role == "candidate" and interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.role == "recruiter" and interview.recruiter_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return interview


@router.patch("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: int,
    payload: InterviewUpdate,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(interview, key, value)

    await db.commit()
    await db.refresh(interview)
    return interview


# ── Interview Lifecycle ───────────────────────────────────────────────────────


@router.post("/{interview_id}/start", response_model=InterviewResponse)
async def start_interview(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Not your interview")

    if interview.status != InterviewStatus.SCHEDULED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start interview in '{interview.status}' status",
        )

    interview.status = InterviewStatus.IN_PROGRESS
    interview.started_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(interview)
    return interview


@router.post("/{interview_id}/end", response_model=InterviewResponse)
async def end_interview(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id and user.role not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    interview.status = InterviewStatus.COMPLETED
    interview.ended_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(interview)
    return interview


# ── Interview Session (Questions + Conversation) ──────────────────────────────


class StartSessionResponse(BaseModel):
    interview: InterviewResponse
    questions: list[QuestionResponse]
    welcome_message: ConversationMessageResponse


@router.post("/{interview_id}/session/start", response_model=StartSessionResponse)
async def start_session(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Not your interview")

    if interview.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Interview must be started first")

    existing = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Session already started")

    session_data = await start_interview_session(interview, db)

    return StartSessionResponse(
        interview=InterviewResponse.model_validate(interview),
        questions=[QuestionResponse.model_validate(q) for q in session_data["questions"]],
        welcome_message=ConversationMessageResponse.model_validate(session_data["welcome_message"]),
    )


class AnswerRequest(BaseModel):
    question_id: int
    answer_text: str


class AnswerResponse(BaseModel):
    evaluation: dict | None = None
    ai_response: str
    next_question_id: int | None = None


@router.post("/{interview_id}/session/answer", response_model=AnswerResponse)
async def submit_answer(
    interview_id: int,
    payload: AnswerRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Not your interview")

    if interview.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Interview is not in progress")

    resume = None
    if interview.resume_id:
        resume = await db.get(Resume, interview.resume_id)

    parsed_resume = (
        resume.parsed_data
        if resume and resume.parsed_data
        else {
            "skills": [],
            "technologies": [],
            "experience_years": 0,
            "experience": [],
            "projects": [],
            "domain_expertise": [],
        }
    )

    result = await process_candidate_answer(
        interview_id=interview_id,
        question_id=payload.question_id,
        answer_text=payload.answer_text,
        parsed_resume=parsed_resume,
        db=db,
    )

    return AnswerResponse(**result)


class ConversationResponse(BaseModel):
    messages: list[ConversationMessageResponse]


@router.get("/{interview_id}/session/conversation", response_model=ConversationResponse)
async def get_conversation(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id and user.role not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.interview_id == interview_id)
        .order_by(ConversationMessage.created_at)
    )
    messages = result.scalars().all()
    return ConversationResponse(
        messages=[ConversationMessageResponse.model_validate(m) for m in messages]
    )


class QuestionsResponse(BaseModel):
    questions: list[QuestionResponse]


@router.get("/{interview_id}/session/questions", response_model=QuestionsResponse)
async def get_questions(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id and user.role not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = result.scalars().all()
    return QuestionsResponse(questions=[QuestionResponse.model_validate(q) for q in questions])


# ── Report Generation ─────────────────────────────────────────────────────────


@router.post("/{interview_id}/report/generate")
async def generate_report(
    interview_id: int,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    from app.models.coding import InterviewReport

    existing = await db.execute(
        select(InterviewReport).where(InterviewReport.interview_id == interview_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Report already exists")

    from app.services.evaluation.report import generate_interview_report

    report_data = await generate_interview_report(interview_id, db)

    report = InterviewReport(
        interview_id=interview_id,
        scores=report_data.get("scores"),
        strengths=report_data.get("strengths", []),
        weaknesses=report_data.get("weaknesses", []),
        improvement_areas=report_data.get("improvement_areas", []),
        recommendation=report_data.get("recommendation", "borderline"),
        cheating_risk=report_data.get("cheating_risk", "low"),
        summary=report_data.get("summary", ""),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return {
        "id": report.id,
        "interview_id": report.interview_id,
        "scores": report.scores,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "improvement_areas": report.improvement_areas,
        "recommendation": report.recommendation,
        "cheating_risk": report.cheating_risk,
        "summary": report.summary,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.get("/{interview_id}/report")
async def get_report(
    interview_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if user.role == "candidate" and interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.models.coding import InterviewReport

    result = await db.execute(
        select(InterviewReport).where(InterviewReport.interview_id == interview_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated yet")

    return {
        "id": report.id,
        "interview_id": report.interview_id,
        "scores": report.scores,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "improvement_areas": report.improvement_areas,
        "recommendation": report.recommendation,
        "cheating_risk": report.cheating_risk,
        "summary": report.summary,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.get("/{interview_id}/proctoring/events")
async def get_proctoring_events(
    interview_id: int,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    from app.services.proctoring.browser import get_interview_proctoring_events

    events = await get_interview_proctoring_events(interview_id, db)
    return {
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "severity": e.severity,
                "confidence": e.confidence,
                "details": e.details,
                "timestamp_seconds": e.timestamp_seconds,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
        "summary": {
            "total": len(events),
            "critical": sum(1 for e in events if e.severity == "critical"),
            "high": sum(1 for e in events if e.severity == "high"),
        },
    }


class ProctoringEventRequest(BaseModel):
    event_type: str
    severity: str = "low"
    confidence: float = 1.0
    details: dict | None = None
    timestamp_seconds: float = 0


@router.post("/{interview_id}/proctoring/events")
async def log_proctoring_event(
    interview_id: int,
    payload: ProctoringEventRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.models.coding import ProctoringEvent
    from app.services.proctoring.browser import SEVERITY_MAP

    severity = SEVERITY_MAP.get(payload.event_type, payload.severity)

    event = ProctoringEvent(
        interview_id=interview_id,
        event_type=payload.event_type,
        severity=severity,
        confidence=payload.confidence,
        details=payload.details,
        timestamp_seconds=payload.timestamp_seconds,
    )
    db.add(event)
    await db.commit()

    return {"status": "ok", "event_id": event.id}
