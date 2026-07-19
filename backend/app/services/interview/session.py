import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.interview import Interview
from app.models.question import ConversationMessage, InterviewQuestion
from app.services.interview.question_generator import (
    generate_follow_up,
    generate_interview_questions,
)

logger = logging.getLogger(__name__)


async def start_interview_session(interview: Interview, db: AsyncSession) -> dict:
    parsed_resume = interview.resume_summary or {
        "skills": [],
        "technologies": [],
        "experience_years": 0,
        "experience_summary": "",
        "education": "",
        "projects_summary": "",
        "domain_expertise": [],
    }

    questions_data = await generate_interview_questions(
        parsed_resume=parsed_resume,
        interview_type=interview.interview_type,
        difficulty_level=interview.difficulty_level,
        num_questions=10,
        interview_title=interview.title,
        interview_description=interview.description or "",
    )

    created_questions = []
    for i, q_data in enumerate(questions_data):
        question = InterviewQuestion(
            interview_id=interview.id,
            question_text=q_data.get("question_text", ""),
            question_type=q_data.get("question_type", "verbal"),
            category=q_data.get("category", "general"),
            difficulty=q_data.get("difficulty", 2.0),
            order_index=i,
            test_cases=q_data.get("test_cases"),
        )
        db.add(question)
        created_questions.append(question)

    welcome_msg = ConversationMessage(
        interview_id=interview.id,
        role="ai",
        content=(
            f"Welcome to your interview! I'll be asking you questions based on your background. "
            f"Let's begin with the first question.\n\n"
            f"{created_questions[0].question_text if created_questions else 'Tell me about yourself.'}"
        ),
        message_type="text",
    )
    db.add(welcome_msg)

    await db.commit()
    for q in created_questions:
        await db.refresh(q)
    await db.refresh(welcome_msg)

    return {
        "questions": created_questions,
        "welcome_message": welcome_msg,
        "parsed_resume": parsed_resume,
    }


async def process_candidate_answer(
    interview_id: int,
    question_id: int,
    answer_text: str,
    parsed_resume: dict,
    db: AsyncSession,
) -> dict:
    question = await db.get(InterviewQuestion, question_id)
    if not question:
        raise ValueError("Question not found")

    question.answer_text = answer_text

    candidate_msg = ConversationMessage(
        interview_id=interview_id,
        role="candidate",
        content=answer_text,
        message_type="text",
    )
    db.add(candidate_msg)

    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.interview_id == interview_id)
        .order_by(ConversationMessage.created_at)
    )
    all_messages = result.scalars().all()
    previous_questions = [m.content for m in all_messages if m.role == "ai" and "?" in m.content]

    follow_up = await generate_follow_up(
        question=question.question_text,
        candidate_answer=answer_text,
        parsed_resume=parsed_resume,
        previous_questions=previous_questions,
    )

    evaluation = follow_up.get("evaluation", {})
    question.ai_evaluation = {
        "score": _score_from_evaluation(evaluation),
        "correctness": evaluation.get("correctness", "partially_correct"),
        "depth": evaluation.get("depth", "moderate"),
        "feedback": evaluation.get("feedback", ""),
        "follow_up": follow_up.get("follow_up_question"),
    }

    next_action = follow_up.get("next_action", "next_question")
    ai_response = ""

    if next_action == "follow_up" and follow_up.get("follow_up_question"):
        ai_response = follow_up["follow_up_question"]
    else:
        next_q = await _get_next_unanswered_question(interview_id, question.order_index, db)
        if next_q:
            feedback = evaluation.get("feedback", "")
            prefix = f"{feedback}\n\n" if feedback else ""
            ai_response = f"{prefix}Let's move to the next question.\n\n{next_q.question_text}"
        else:
            ai_response = "That was the last question. Thank you for completing the interview!"

    ai_msg = ConversationMessage(
        interview_id=interview_id,
        role="ai",
        content=ai_response,
        message_type="text",
    )
    db.add(ai_msg)

    await db.commit()
    await db.refresh(question)
    await db.refresh(ai_msg)

    return {
        "evaluation": question.ai_evaluation,
        "ai_response": ai_response,
        "next_question_id": _extract_question_id(ai_response),
    }


async def _get_next_unanswered_question(
    interview_id: int, current_order: int, db: AsyncSession
) -> InterviewQuestion | None:
    result = await db.execute(
        select(InterviewQuestion)
        .where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.order_index > current_order,
            InterviewQuestion.answer_text.is_(None),
        )
        .order_by(InterviewQuestion.order_index)
        .limit(1)
    )
    return result.scalar_one_or_none()


def _score_from_evaluation(evaluation: dict) -> float:
    correctness = evaluation.get("correctness", "partially_correct")
    depth = evaluation.get("depth", "moderate")
    scores = {"correct": 8.0, "partially_correct": 5.0, "incorrect": 2.0}
    depth_bonus = {"deep": 1.5, "moderate": 0.5, "shallow": 0.0}
    return min(10.0, scores.get(correctness, 5.0) + depth_bonus.get(depth, 0.0))


def _extract_question_id(ai_response: str) -> int | None:
    return None
