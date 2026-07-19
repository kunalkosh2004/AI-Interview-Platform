from pydantic import BaseModel
from datetime import datetime


class InterviewBase(BaseModel):
    title: str
    description: str | None = None
    interview_type: str = "mixed"
    difficulty_level: int = 2
    duration_minutes: int = 60


class InterviewCreate(InterviewBase):
    candidate_id: int
    resume_id: int | None = None


class InterviewUpdate(BaseModel):
    status: str | None = None
    scheduled_at: datetime | None = None
    difficulty_level: int | None = None


class InterviewResponse(InterviewBase):
    id: int
    candidate_id: int
    recruiter_id: int | None = None
    resume_id: int | None = None
    status: str
    resume_summary: dict | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionResponse(BaseModel):
    id: int
    question_text: str
    question_type: str
    category: str
    difficulty: float
    order_index: int
    answer_text: str | None = None
    ai_evaluation: dict | None = None

    model_config = {"from_attributes": True}


class ConversationMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    message_type: str
    audio_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CodingSessionResponse(BaseModel):
    id: int
    problem_title: str
    problem_description: str
    language: str
    starter_code: str | None = None
    candidate_code: str | None = None
    execution_result: dict | None = None
    ai_code_evaluation: dict | None = None

    model_config = {"from_attributes": True}


class ProctoringEventResponse(BaseModel):
    id: int
    event_type: str
    severity: str
    confidence: float
    details: dict | None = None
    screenshot_url: str | None = None
    timestamp_seconds: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewReportResponse(BaseModel):
    id: int
    interview_id: int
    scores: dict | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    improvement_areas: list[str] | None = None
    recommendation: str | None = None
    cheating_risk: str | None = None
    summary: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
