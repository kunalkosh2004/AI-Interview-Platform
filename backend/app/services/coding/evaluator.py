import json
import logging

from app.core.llm import llm_chat

logger = logging.getLogger(__name__)


async def evaluate_code_with_ai(
    code: str,
    language: str,
    problem_description: str,
    execution_result: dict,
) -> dict:
    prompt = f"""Evaluate this candidate's code submission for a technical interview.

Problem: {problem_description}
Language: {language}

Code:
```{language}
{code}
```

Execution Result:
- Status: {execution_result.get('status', 'unknown')}
- Tests Passed: {execution_result.get('tests_passed', 0)}/{execution_result.get('tests_total', 0)}

Evaluate the code on these dimensions. Return ONLY valid JSON:

{{
    "quality_score": 8.5,
    "time_complexity": "O(n)",
    "space_complexity": "O(1)",
    "naming_conventions": "excellent" | "good" | "fair" | "poor",
    "readability": "excellent" | "good" | "fair" | "poor",
    "edge_cases_handled": true,
    "design_patterns_used": ["list of patterns used"],
    "feedback": "Detailed constructive feedback on the code quality, approach, and suggestions for improvement.",
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"]
}}

Rules:
- Be constructive and specific
- Consider code readability, not just correctness
- Check for edge cases (empty input, null, boundary values)
- Evaluate naming, comments, and code structure
- Suggest concrete improvements"""

    try:
        content = await llm_chat(prompt, temperature=0.3, response_format={"type": "json_object"})
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI code evaluation failed: {e}")
        return {
            "quality_score": 5.0,
            "time_complexity": "unknown",
            "space_complexity": "unknown",
            "naming_conventions": "fair",
            "readability": "fair",
            "edge_cases_handled": False,
            "feedback": "AI evaluation unavailable. Manual review recommended.",
            "strengths": [],
            "weaknesses": [],
        }
