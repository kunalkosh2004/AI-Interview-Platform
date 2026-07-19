from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), nullable=False)

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(50), nullable=False)  # mcq, coding, verbal, system_design
    category: Mapped[str] = mapped_column(String(100), nullable=False)  # python, system_design, etc.
    difficulty: Mapped[int] = mapped_column(Float, default=2.0)
    order_index: Mapped[int] = mapped_column(default=0)

    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # candidate's answer
    test_cases: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # test_cases structure for coding questions:
    # [{"input": "arr=[2,7,11,15] target=9", "expected": "[0,1]", "explanation": "..."}]
    ai_evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # ai_evaluation structure:
    # {
    #     "score": 8.5,
    #     "correctness": "partially_correct",
    #     "depth": "good",
    #     "feedback": "...",
    #     "follow_up": "..."
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    interview = relationship("Interview", back_populates="questions")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), nullable=False)

    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "ai" or "candidate"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), default="text")  # text, audio
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    interview = relationship("Interview", back_populates="conversation_messages")
