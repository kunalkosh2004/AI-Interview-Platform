import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import llm_chat
from app.models.coding import CodingSession, ProctoringEvent
from app.models.interview import Interview
from app.models.question import InterviewQuestion
from app.services.proctoring.browser import calculate_cheating_risk

logger = logging.getLogger(__name__)


async def generate_interview_report(interview_id: int, db: AsyncSession) -> dict:
    interview = await db.get(Interview, interview_id)
    if not interview:
        raise ValueError("Interview not found")

    questions_result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = questions_result.scalars().all()

    coding_result = await db.execute(
        select(CodingSession).where(CodingSession.interview_id == interview_id)
    )
    coding_sessions = coding_result.scalars().all()

    proctoring_result = await db.execute(
        select(ProctoringEvent).where(ProctoringEvent.interview_id == interview_id)
    )
    proctoring_events = proctoring_result.scalars().all()

    cheating_risk = calculate_cheating_risk(proctoring_events)

    qa_context = []
    for q in questions:
        qa_entry = {
            "question": q.question_text,
            "category": q.category,
            "type": q.question_type,
            "difficulty": q.difficulty,
            "answer": q.answer_text or "No answer",
        }
        if q.ai_evaluation:
            qa_entry["evaluation"] = q.ai_evaluation
        qa_context.append(qa_entry)

    coding_context = []
    for cs in coding_sessions:
        coding_entry = {
            "problem": cs.problem_title,
            "language": cs.language,
            "code": cs.candidate_code or "No code submitted",
            "execution_result": cs.execution_result,
            "ai_evaluation": cs.ai_code_evaluation,
        }
        coding_context.append(coding_entry)

    proctoring_summary = {
        "total_events": len(proctoring_events),
        "critical_events": sum(1 for e in proctoring_events if e.severity == "critical"),
        "high_events": sum(1 for e in proctoring_events if e.severity == "high"),
        "medium_events": sum(1 for e in proctoring_events if e.severity == "medium"),
        "event_types": list({e.event_type for e in proctoring_events}),
        "cheating_risk": cheating_risk,
    }

    prompt = f"""Generate a comprehensive interview evaluation report for this candidate.

Interview: {interview.title}
Type: {interview.interview_type}
Difficulty: {interview.difficulty_level}/3
Duration: {interview.duration_minutes} minutes

Questions & Answers:
{json.dumps(qa_context, indent=2)}

Coding Submissions:
{json.dumps(coding_context, indent=2)}

Proctoring Summary:
{json.dumps(proctoring_summary, indent=2)}

Generate a detailed evaluation report. Return ONLY valid JSON:

{{
    "scores": {{
        "technical_knowledge": 8.5,
        "coding": 8.0,
        "communication": 9.0,
        "problem_solving": 8.0,
        "system_design": 7.5,
        "confidence": 7.0,
        "overall": 8.0
    }},
    "strengths": ["strength1", "strength2", "strength3"],
    "weaknesses": ["weakness1", "weakness2"],
    "improvement_areas": ["area1", "area2"],
    "recommendation": "hire" | "borderline" | "reject",
    "summary": "2-3 paragraph detailed summary of the candidate's performance..."
}}

Rules:
- Scores should be 1-10 with one decimal place
- Be specific and evidence-based
- Reference actual answers in the Q&A
- Consider both technical skills and communication
- Factor in proctoring events for cheating_risk assessment
- Recommendation should be clear: hire, borderline, or reject
- Summary should be professional and detailed"""

    try:
        content = await llm_chat(prompt, temperature=0.3, response_format={"type": "json_object"})
        report_data = json.loads(content)
        report_data["cheating_risk"] = cheating_risk
        return report_data
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        return _fallback_report(questions, coding_sessions, cheating_risk)


def _fallback_report(questions: list, coding_sessions: list, cheating_risk: str) -> dict:
    answered = sum(1 for q in questions if q.answer_text)
    total = len(questions)
    avg_score = 0
    scores_with_eval = [q.ai_evaluation.get("score", 5) for q in questions if q.ai_evaluation]
    if scores_with_eval:
        avg_score = sum(scores_with_eval) / len(scores_with_eval)

    return {
        "scores": {
            "technical_knowledge": avg_score,
            "coding": avg_score,
            "communication": avg_score,
            "problem_solving": avg_score,
            "system_design": avg_score,
            "confidence": avg_score,
            "overall": avg_score,
        },
        "strengths": [],
        "weaknesses": [],
        "improvement_areas": [],
        "recommendation": "borderline",
        "cheating_risk": cheating_risk,
        "summary": f"Completed {answered}/{total} questions. AI report generation failed; manual review recommended.",
    }
