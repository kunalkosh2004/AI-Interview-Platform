import enum
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InterviewStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class InterviewType(str, enum.Enum):
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    SYSTEM_DESIGN = "system_design"
    DSA = "dsa"
    ML = "ml"
    CODING = "coding"
    MIXED = "mixed"


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    recruiter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resume_id: Mapped[int | None] = mapped_column(ForeignKey("resumes.id"), nullable=True)

    status: Mapped[InterviewStatus] = mapped_column(
        Enum(InterviewStatus), default=InterviewStatus.SCHEDULED, nullable=False
    )
    interview_type: Mapped[InterviewType] = mapped_column(
        Enum(InterviewType), default=InterviewType.MIXED, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty_level: Mapped[int] = mapped_column(Integer, default=2)  # 1=easy, 2=medium, 3=hard

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    resume_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # resume_summary structure:
    # {
    #     "candidate_name": "John Developer",
    #     "skills": ["python", "pytorch", ...],
    #     "experience_years": 3,
    #     "experience_summary": "3 years backend dev at Google...",
    #     "education": "B.Tech CS from IIT...",
    #     "projects_summary": "Built ML pipeline...",
    #     "domain_expertise": ["ml", "backend"],
    #     "technologies": ["pytorch", "fastapi", ...]
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    candidate = relationship("User", back_populates="interviews_as_candidate", foreign_keys=[candidate_id])
    recruiter = relationship("User", back_populates="interviews_as_recruiter", foreign_keys=[recruiter_id])
    resume = relationship("Resume")
    questions = relationship("InterviewQuestion", back_populates="interview", cascade="all, delete-orphan")
    coding_sessions = relationship("CodingSession", back_populates="interview", cascade="all, delete-orphan")
    proctoring_events = relationship("ProctoringEvent", back_populates="interview", cascade="all, delete-orphan")
    report = relationship("InterviewReport", back_populates="interview", uselist=False, cascade="all, delete-orphan")
    conversation_messages = relationship("ConversationMessage", back_populates="interview", cascade="all, delete-orphan")
