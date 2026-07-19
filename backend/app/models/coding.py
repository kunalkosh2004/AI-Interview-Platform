from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CodingSession(Base):
    __tablename__ = "coding_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), nullable=False)

    problem_title: Mapped[str] = mapped_column(String(255), nullable=False)
    problem_description: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)  # python, java, cpp, js, go
    starter_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_cases: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    time_limit: Mapped[int] = mapped_column(default=300)  # seconds
    memory_limit: Mapped[int] = mapped_column(default=256)  # MB

    candidate_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # execution_result structure:
    # {
    #     "status": "accepted" | "wrong_answer" | "time_limit" | "runtime_error",
    #     "tests_passed": 8,
    #     "tests_total": 10,
    #     "execution_time_ms": 234,
    #     "memory_used_mb": 45
    # }
    ai_code_evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # ai_code_evaluation structure:
    # {
    #     "quality_score": 8.5,
    #     "time_complexity": "O(n)",
    #     "space_complexity": "O(1)",
    #     "naming_conventions": "good",
    #     "readability": "excellent",
    #     "edge_cases_handled": true,
    #     "feedback": "..."
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    interview = relationship("Interview", back_populates="coding_sessions")


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), nullable=False)

    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # phone_detected, multiple_persons, candidate_left, looking_away,
    # face_not_visible, tab_switch, window_blur, copy_paste, etc.
    severity: Mapped[str] = mapped_column(String(20), default="low")  # low, medium, high, critical
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    screenshot_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp_seconds: Mapped[float] = mapped_column(Float, nullable=True)  # seconds from interview start

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    interview = relationship("Interview", back_populates="proctoring_events")


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), unique=True, nullable=False)

    scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # scores structure:
    # {
    #     "technical_knowledge": 8.5,
    #     "coding": 9.0,
    #     "communication": 8.0,
    #     "problem_solving": 7.5,
    #     "system_design": 7.0,
    #     "confidence": 8.0,
    #     "overall": 8.0
    # }
    strengths: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weaknesses: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    improvement_areas: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hire, borderline, reject
    cheating_risk: Mapped[str | None] = mapped_column(String(20), nullable=True)  # low, medium, high
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    interview = relationship("Interview", back_populates="report")
