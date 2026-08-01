import asyncio
import logging

from celery import Celery

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

celery_app = Celery(
    "ai_interview",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=300,
)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_report_task(self, interview_id: int) -> dict:
    """Generate an AI evaluation report in the background."""
    try:
        result = asyncio.run(_generate_report(interview_id))
        return result
    except Exception as exc:
        logger.error(f"Report generation failed for interview {interview_id}: {exc}")
        raise self.retry(exc=exc) from exc


async def _generate_report(interview_id: int) -> dict:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.models.coding import InterviewReport
    from app.services.evaluation.report import generate_interview_report

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession)

    async with session_factory() as db:
        report_data = await generate_interview_report(interview_id, db)

        existing = await db.execute(
            select(InterviewReport).where(InterviewReport.interview_id == interview_id)
        )
        report = existing.scalar_one_or_none()
        if report is None:
            report = InterviewReport(interview_id=interview_id)
            db.add(report)

        report.scores = report_data.get("scores")
        report.strengths = report_data.get("strengths", [])
        report.weaknesses = report_data.get("weaknesses", [])
        report.improvement_areas = report_data.get("improvement_areas", [])
        report.recommendation = report_data.get("recommendation", "borderline")
        report.cheating_risk = report_data.get("cheating_risk", "low")
        report.summary = report_data.get("summary", "")

        await db.commit()
        logger.info(f"Report generated for interview {interview_id}")

    await engine.dispose()
    return {"status": "completed", "interview_id": interview_id}


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def parse_resume_task(self, resume_id: int, file_bytes: bytes, file_name: str) -> dict:
    """Parse a resume PDF in the background."""
    try:
        result = asyncio.run(_parse_resume(resume_id, file_bytes, file_name))
        return result
    except Exception as exc:
        logger.error(f"Resume parsing failed for resume {resume_id}: {exc}")
        raise self.retry(exc=exc) from exc


async def _parse_resume(resume_id: int, file_bytes: bytes, file_name: str) -> dict:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.models.resume import Resume
    from app.services.resume.parser import extract_text_from_pdf_bytes, parse_resume_with_llm

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession)

    async with session_factory() as db:
        resume = await db.get(Resume, resume_id)
        if not resume:
            logger.error(f"Resume {resume_id} not found")
            await engine.dispose()
            return {"status": "error", "error": "Resume not found"}

        raw_text = extract_text_from_pdf_bytes(file_bytes)
        parsed_data = await parse_resume_with_llm(raw_text)

        resume.raw_text = raw_text
        resume.parsed_data = parsed_data
        await db.commit()

        logger.info(f"Resume {resume_id} ({file_name}) parsed successfully")

    await engine.dispose()
    return {"status": "completed", "resume_id": resume_id}
