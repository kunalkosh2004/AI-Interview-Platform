import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coding import ProctoringEvent

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "tab_switch": "medium",
    "window_blur": "low",
    "copy_paste": "high",
    "right_click": "low",
    "devtools_open": "critical",
    "fullscreen_exit": "medium",
    "screen_resize": "low",
    "idle_detected": "medium",
    "multiple_monitors": "high",
}


async def log_proctoring_event(
    interview_id: int,
    event_type: str,
    details: dict | None = None,
    confidence: float = 1.0,
    timestamp_seconds: float = 0,
    db: AsyncSession = None,
) -> ProctoringEvent:
    severity = SEVERITY_MAP.get(event_type, "low")

    event = ProctoringEvent(
        interview_id=interview_id,
        event_type=event_type,
        severity=severity,
        confidence=confidence,
        details=details,
        timestamp_seconds=timestamp_seconds,
    )

    if db:
        db.add(event)
        await db.commit()
        await db.refresh(event)

    logger.info(
        f"Proctoring event: {event_type} (severity={severity}) "
        f"at {timestamp_seconds:.1f}s for interview {interview_id}"
    )

    return event


async def get_interview_proctoring_events(
    interview_id: int, db: AsyncSession
) -> list[ProctoringEvent]:
    from sqlalchemy import select

    result = await db.execute(
        select(ProctoringEvent)
        .where(ProctoringEvent.interview_id == interview_id)
        .order_by(ProctoringEvent.timestamp_seconds)
    )
    return result.scalars().all()


def calculate_cheating_risk(events: list[ProctoringEvent]) -> str:
    if not events:
        return "low"

    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for event in events:
        severity_counts[event.severity] = severity_counts.get(event.severity, 0) + 1

    if severity_counts["critical"] >= 2:
        return "high"
    if severity_counts["critical"] >= 1 or severity_counts["high"] >= 3:
        return "high"
    if severity_counts["high"] >= 1 or severity_counts["medium"] >= 5:
        return "medium"
    return "low"
