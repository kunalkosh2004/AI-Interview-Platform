from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.coding import CodingSession
from app.models.interview import Interview, InterviewStatus
from app.models.user import User
from app.services.coding.executor import execute_code

router = APIRouter(prefix="/coding", tags=["coding"])


class CodeSubmitRequest(BaseModel):
    code: str
    language: str = "python"


class CodeRunRequest(BaseModel):
    code: str
    language: str = "python"
    test_cases: list[dict] | None = None


class CodeSubmitResponse(BaseModel):
    status: str
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int | None = None
    tests_passed: int | None = None
    tests_total: int | None = None
    test_results: list[dict] | None = None
    error: str | None = None


@router.post("/run", response_model=CodeSubmitResponse)
async def run_code(
    payload: CodeRunRequest,
    user: User = Depends(get_current_user),
):
    result = await execute_code(
        code=payload.code,
        language=payload.language,
        test_cases=payload.test_cases,
    )
    return CodeSubmitResponse(**result)


@router.post("/{session_id}/submit", response_model=CodeSubmitResponse)
async def submit_code(
    session_id: int,
    payload: CodeSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    coding_session = await db.get(CodingSession, session_id)
    if not coding_session:
        raise HTTPException(status_code=404, detail="Coding session not found")

    interview = await db.get(Interview, coding_session.interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if interview.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Interview is not in progress")

    coding_session.candidate_code = payload.code
    coding_session.language = payload.language

    test_cases = coding_session.test_cases if coding_session.test_cases else None

    result = await execute_code(
        code=payload.code,
        language=payload.language,
        test_cases=test_cases,
        time_limit=coding_session.time_limit,
    )

    coding_session.execution_result = {
        "status": result.get("status"),
        "tests_passed": result.get("tests_passed", 0),
        "tests_total": result.get("tests_total", 0),
        "execution_time_ms": result.get("execution_time_ms", 0),
    }

    await db.commit()
    await db.refresh(coding_session)

    return CodeSubmitResponse(**result)


@router.get("/{session_id}", response_model=dict)
async def get_coding_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    coding_session = await db.get(CodingSession, session_id)
    if not coding_session:
        raise HTTPException(status_code=404, detail="Coding session not found")

    interview = await db.get(Interview, coding_session.interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.candidate_id != user.id and user.role not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": coding_session.id,
        "problem_title": coding_session.problem_title,
        "problem_description": coding_session.problem_description,
        "language": coding_session.language,
        "starter_code": coding_session.starter_code,
        "candidate_code": coding_session.candidate_code,
        "execution_result": coding_session.execution_result,
        "time_limit": coding_session.time_limit,
    }
