import json
import logging
from typing import Any

from app.core.llm import llm_chat

logger = logging.getLogger(__name__)


async def generate_interview_questions(
    parsed_resume: dict,
    interview_type: str = "mixed",
    difficulty_level: int = 2,
    num_questions: int = 10,
    interview_title: str = "",
    interview_description: str = "",
) -> list[dict]:
    skills = parsed_resume.get("skills", [])
    technologies = parsed_resume.get("technologies", [])
    experience = parsed_resume.get("experience", [])
    projects = parsed_resume.get("projects", [])
    domains = parsed_resume.get("domain_expertise", [])
    years = parsed_resume.get("experience_years", 0)
    candidate_name = parsed_resume.get("candidate_name", "the candidate")

    difficulty_map = {1: "easy", 2: "medium", 3: "hard"}
    difficulty = difficulty_map.get(difficulty_level, "medium")

    # Support both raw parsed_data and resume_summary format
    experience_text = parsed_resume.get("experience_summary", "") or "\n".join(
        [f"- {e.get('title', '')} at {e.get('company', '')}: {e.get('description', '')}" for e in experience[:5]]
    ) or "No experience details provided"
    projects_text = parsed_resume.get("projects_summary", "") or "\n".join(
        [f"- {p.get('name', '')}: {p.get('description', '')} (Tech: {', '.join(p.get('technologies', []))})" for p in projects[:5]]
    ) or "No project details provided"
    education_text = parsed_resume.get("education", "") or "No education details"

    prompt = f"""Generate {num_questions} personalized technical interview questions for a candidate with this profile:

Position: {interview_title}
{f"Role Description: {interview_description}" if interview_description else ""}
Candidate: {candidate_name}
Skills: {', '.join(skills[:20])}
Technologies: {', '.join(technologies[:20])}
Domain Expertise: {', '.join(domains)}
Experience: {years} years
Education: {education_text}
Interview Type: {interview_type}
Difficulty: {difficulty}

Experience:
{experience_text}

Projects:
{projects_text}

Return ONLY valid JSON with no markdown:
{{
    "questions": [
        {{
            "question_text": "The question text",
            "question_type": "verbal",
            "category": "category name",
            "difficulty": 2.0,
            "test_cases": null
        }}
    ]
}}

INTERVIEW TYPE RULES (CRITICAL - follow these based on interview_type="{interview_type}"):

If interview_type is "ml" or "machine_learning":
- 70% of questions MUST be ML/AI specific: supervised/unsupervised learning, neural networks, CNNs, RNNs, transformers, NLP, computer vision, model evaluation, overfitting/underfitting, feature engineering, bias-variance tradeoff, regularization, gradient descent, loss functions, activation functions, backpropagation, transfer learning, MLOps, model deployment
- Use ML categories: machine_learning, deep_learning, nlp, computer_vision, mlops, data_preprocessing, model_evaluation, pytorch, tensorflow, scikit_learn
- Include 1-2 coding questions: implement a simple model, write a data preprocessing function, implement gradient descent, build a neural network layer
- Include 1 system design question: design an ML pipeline, design a recommendation system, design a real-time inference system

If interview_type is "dsa" or "coding":
- Focus on data structures, algorithms, time/space complexity, problem solving
- 50%+ questions should be coding with test cases
- Categories: dsa, algorithms, data_structures, system_design

If interview_type is "system_design":
- Focus on architecture, scalability, distributed systems, databases, APIs
- Categories: system_design, architecture, databases, scalability, distributed_systems

If interview_type is "behavioral":
- Focus on past experiences, conflict resolution, teamwork, leadership, learning
- Categories: behavioral, leadership, teamwork, conflict_resolution

If interview_type is "mixed" or "technical":
- Mix of all types based on the candidate's resume
- Include at least 2 coding questions with test cases
- Include at least 1 system design if 3+ years experience
- Include 1 behavioral question

GENERAL RULES:
- Generate questions that test REAL knowledge based on their resume
- Difficulty 1.0-3.0 scale
- Questions should be challenging but fair for their experience level
- No generic questions - every question should reference their specific tech stack
- For coding questions, include test_cases array with JSON inputs/outputs
- For non-coding questions, set "test_cases": null

FOR CODING QUESTIONS ONLY (question_type="coding"):
- You MUST include "test_cases" array with 3-5 test cases
- Each test case: {{"input": <JSON value>, "expected": <JSON value>, "explanation": "brief explanation"}}
- "input" must be a JSON-serializable value that will be passed directly to the solution() function
  - For single-argument functions: "input": [2,7,11,15]
  - For multi-argument functions: "input": [[2,7,11,15], 9]
  - For string functions: "input": "racecar"
  - For tree/graph inputs: use simplified array representations
- "expected" must be the exact JSON output the function should return
- Test cases should cover: basic case, edge cases, large input
- For non-coding questions, set "test_cases": null"""

    try:
        content = await llm_chat(prompt, temperature=0.7, response_format={"type": "json_object"})
        data = json.loads(content)
        return data.get("questions", [])
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        return _fallback_questions(skills, interview_type, difficulty_level, num_questions)


async def generate_follow_up(
    question: str,
    candidate_answer: str,
    parsed_resume: dict,
    previous_questions: list[str] = None,
) -> dict:
    context = ""
    if previous_questions:
        context = f"\nPrevious questions asked: {', '.join(previous_questions[-5:])}"

    prompt = f"""You are an AI technical interviewer. The candidate was asked:

Question: {question}

Candidate's answer: {candidate_answer}

Candidate's profile: {', '.join(parsed_resume.get('skills', [])[:10])} | {parsed_resume.get('experience_years', 0)} years exp
{context}

Analyze the answer and decide what to do next. Return ONLY valid JSON:

{{
    "evaluation": {{
        "correctness": "correct" | "partially_correct" | "incorrect",
        "depth": "shallow" | "moderate" | "deep",
        "feedback": "brief feedback on the answer"
    }},
    "next_action": "follow_up" | "next_question",
    "follow_up_question": "If follow_up, the follow-up question. Otherwise null.",
    "reasoning": "Why you chose this next action"
}}

Rules:
- DEFAULT to "next_question" — move on to the next topic
- ONLY ask a follow_up if the answer is critically incomplete or fundamentally wrong AND a clarification would genuinely help
- Never ask follow-ups just because the answer was short — a correct short answer is fine
- If the answer is correct (even if brief), give brief positive feedback and move to next_question
- If the answer is incorrect, briefly correct them and move to next_question
- Aim to cover more questions rather than going deep on each one
- For coding questions: if the code works, move on. Don't ask follow-ups about complexity unless the answer is wrong
- Never repeat questions
- Be encouraging but rigorous"""

    try:
        content = await llm_chat(prompt, temperature=0.5, response_format={"type": "json_object"})
        return json.loads(content)
    except Exception as e:
        logger.error(f"Follow-up generation failed: {e}")
        return {
            "evaluation": {"correctness": "partially_correct", "depth": "moderate", "feedback": ""},
            "next_action": "next_question",
            "follow_up_question": None,
        }


def _fallback_questions(
    skills: list[str], interview_type: str, difficulty_level: int, num_questions: int
) -> list[dict]:
    questions = []
    default_verbal = [
        "Explain your experience with the main technologies in your stack.",
        "How would you design a scalable API for a high-traffic application?",
        "What database indexing strategies have you used and when?",
        "Describe your experience with containerization and orchestration.",
        "How do you handle authentication and authorization in your projects?",
    ]
    default_coding = [
        {
            "question_text": "Given an array of integers, find two numbers that sum to a target.",
            "test_cases": [
                {"input": [[2, 7, 11, 15], 9], "expected": [0, 1], "explanation": "2 + 7 = 9"},
                {"input": [[3, 2, 4], 6], "expected": [1, 2], "explanation": "2 + 4 = 6"},
                {"input": [[3, 3], 6], "expected": [0, 1], "explanation": "3 + 3 = 6"},
            ],
        },
        {
            "question_text": "Implement a function to check if a binary tree is balanced.",
            "test_cases": [
                {"input": [1, 2, 3, 4, 5], "expected": True, "explanation": "Balanced tree"},
                {"input": [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], "expected": False, "explanation": "Unbalanced tree"},
            ],
        },
        {
            "question_text": "Write a function to merge two sorted arrays.",
            "test_cases": [
                {"input": [[1, 3, 5], [2, 4, 6]], "expected": [1, 2, 3, 4, 5, 6]},
                {"input": [[1, 2, 3], []], "expected": [1, 2, 3]},
                {"input": [[], [1, 2, 3]], "expected": [1, 2, 3]},
            ],
        },
    ]
    default_system = [
        "Design a real-time notification system that handles millions of users.",
        "How would you architect a microservices system for an e-commerce platform?",
    ]

    verbal = default_verbal[:num_questions // 2 + 1]
    coding = default_coding[:num_questions // 4 + 1]
    system = default_system[:num_questions // 4]

    for q in verbal:
        questions.append({"question_text": q, "question_type": "verbal", "category": "general", "difficulty": 2.0})
    for q in coding:
        questions.append({"question_text": q["question_text"], "question_type": "coding", "category": "dsa", "difficulty": 2.0, "test_cases": q["test_cases"]})
    for q in system:
        questions.append({"question_text": q, "question_type": "system_design", "category": "system_design", "difficulty": 2.5})

    return questions[:num_questions]
