#!/usr/bin/env python3
"""End-to-end interview smoke test.

Walks through the full flow against a running backend:
  recruiter login -> create interview (schedule) -> candidate login ->
  start interview -> start session (questions generated) -> candidate answers
  every question -> log a few proctoring events -> end interview ->
  generate report (Celery) -> poll until complete -> print report JSON.

Usage:
    backend/venv/bin/python backend/scripts/run_full_interview.py \
        --recruiter rec@rec.com --candidate test@test.com --password password123
"""

import argparse
import json
import sys
import time

import httpx

BASE_URL = "http://localhost:8000/api/v1"
REPORT_POLL_INTERVAL = 5
REPORT_TIMEOUT = 180


class ApiError(Exception):
    pass


class Api:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.Client(timeout=60.0)

    def _headers(self, token: str | None = None) -> dict:
        return {"Authorization": f"Bearer {token}"} if token else {}

    def _check(self, resp: httpx.Response, what: str) -> dict:
        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise ApiError(f"{what}: HTTP {resp.status_code}: {detail}")
        return resp.json()

    def login(self, email: str, password: str) -> str:
        resp = self.client.post(
            f"{self.base_url}/auth/login", json={"email": email, "password": password}
        )
        data = self._check(resp, f"login {email}")
        return data["access_token"]

    def me(self, token: str) -> dict:
        resp = self.client.get(f"{self.base_url}/auth/me", headers=self._headers(token))
        return self._check(resp, "auth/me")

    def candidates(self, token: str) -> list[dict]:
        resp = self.client.get(f"{self.base_url}/auth/candidates", headers=self._headers(token))
        return self._check(resp, "auth/candidates")

    def create_interview(self, token: str, payload: dict) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/", headers=self._headers(token), json=payload
        )
        return self._check(resp, "create interview")

    def start_interview(self, token: str, interview_id: int) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/start",
            headers=self._headers(token),
        )
        return self._check(resp, "start interview")

    def start_session(self, token: str, interview_id: int) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/session/start",
            headers=self._headers(token),
        )
        return self._check(resp, "start session")

    def answer(self, token: str, interview_id: int, question_id: int, text: str) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/session/answer",
            headers=self._headers(token),
            json={"question_id": question_id, "answer_text": text},
        )
        return self._check(resp, "submit answer")

    def log_proctoring(self, token: str, interview_id: int, payload: dict) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/proctoring/events",
            headers=self._headers(token),
            json=payload,
        )
        return self._check(resp, "log proctoring event")

    def end_interview(self, token: str, interview_id: int) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/end",
            headers=self._headers(token),
        )
        return self._check(resp, "end interview")

    def generate_report(self, token: str, interview_id: int) -> dict:
        resp = self.client.post(
            f"{self.base_url}/interviews/{interview_id}/report/generate",
            headers=self._headers(token),
        )
        return self._check(resp, "generate report")

    def get_report(self, token: str, interview_id: int) -> dict:
        resp = self.client.get(
            f"{self.base_url}/interviews/{interview_id}/report",
            headers=self._headers(token),
        )
        return self._check(resp, "get report")

    def close(self):
        self.client.close()


ANSWER_TEMPLATES = {
    "verbal": (
        "I have solid hands-on experience with {topic}. In a previous project I "
        "applied these concepts directly, iterating based on feedback and measuring "
        "results. I made trade-offs consciously, and the outcome improved both quality "
        "and delivery speed."
    ),
    "coding": (
        "My approach is to first clarify constraints and pick the right data "
        "structure for the worst case. I write a clean solution with helper functions, "
        "handle edge cases like empty inputs, and verify with the provided test cases. "
        "For this problem I would use an efficient algorithm with O(n log n) or better "
        "complexity and would refactor for readability."
    ),
    "system_design": (
        "I would start with functional and non-functional requirements, estimate load, "
        "then sketch the high-level architecture: stateless API layer, a database "
        "optimized for the read/write ratio, caching and a message queue for async "
        "work. I would add monitoring, rate limiting, and plan for horizontal scaling "
        "and fault tolerance."
    ),
    "behavioral": (
        "In a past situation like this I communicated the plan early, broke the work "
        "into small milestones, and asked for feedback after each step. When priorities "
        "shifted I re-scoped quickly with the team, which kept us aligned and on time."
    ),
}


def build_answer(question: dict) -> str:
    qtype = question.get("question_type", "verbal")
    template = ANSWER_TEMPLATES.get(qtype, ANSWER_TEMPLATES["verbal"])
    topic = (question.get("category", "the topic") or "the topic").replace("_", " ")
    return template.format(topic=topic)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recruiter", default="rec@rec.com")
    parser.add_argument("--candidate", default="test@test.com")
    parser.add_argument("--password", default="password123")
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--title", default="End-to-End Interview")
    parser.add_argument("--type", default="mixed")
    parser.add_argument("--difficulty", type=int, default=2)
    parser.add_argument("--duration", type=int, default=30)
    args = parser.parse_args()

    api = Api(args.base_url)
    try:
        print("1. Logging in as recruiter...")
        recruiter_token = api.login(args.recruiter, args.password)
        recruiter = api.me(recruiter_token)
        print(f"   -> {recruiter['email']} (role={recruiter['role']}, id={recruiter['id']})")

        print("2. Resolving candidate...")
        candidate_token = api.login(args.candidate, args.password)
        candidate = api.me(candidate_token)
        print(f"   -> {candidate['email']} (role={candidate['role']}, id={candidate['id']})")
        if candidate["role"] != "candidate":
            print(f"   WARNING: {args.candidate} is not a candidate", file=sys.stderr)

        print("3. Scheduling interview...")
        interview = api.create_interview(
            recruiter_token,
            {
                "title": args.title,
                "description": "Automated end-to-end smoke test interview.",
                "interview_type": args.type,
                "difficulty_level": args.difficulty,
                "duration_minutes": args.duration,
                "candidate_id": candidate["id"],
            },
        )
        interview_id = interview["id"]
        print(f"   -> interview id={interview_id} status={interview['status']}")

        print("4. Candidate starts interview...")
        started = api.start_interview(candidate_token, interview_id)
        print(f"   -> status={started['status']}")

        print("5. Starting session (LLM generates questions)...")
        session = api.start_session(candidate_token, interview_id)
        questions = session["questions"]
        print(f"   -> {len(questions)} questions generated")

        print("6. Answering every question...")
        for i, q in enumerate(questions, 1):
            answer = build_answer(q)
            result = api.answer(candidate_token, interview_id, q["id"], answer)
            score = result.get("evaluation", {}).get("score")
            print(
                f"   [{i}/{len(questions)}] q={q['id']} "
                f"({q.get('question_type')}, score={score}) answered"
            )
            time.sleep(0.5)

        print("7. Logging a few proctoring events...")
        for ts, event_type in [
            (120, "window_blur"),
            (300, "tab_switch"),
            (480, "copy_paste"),
        ]:
            api.log_proctoring(
                candidate_token,
                interview_id,
                {
                    "event_type": event_type,
                    "confidence": 0.9,
                    "details": {"note": "simulated by e2e script"},
                    "timestamp_seconds": ts,
                },
            )
            print(f"   -> {event_type} @ {ts}s")

        print("8. Ending interview...")
        ended = api.end_interview(candidate_token, interview_id)
        print(f"   -> status={ended['status']}")

        print("9. Generating report (async Celery)...")
        gen = api.generate_report(recruiter_token, interview_id)
        print(f"   -> {gen}")

        print(f"10. Polling report (every {REPORT_POLL_INTERVAL}s, up to {REPORT_TIMEOUT}s)...")
        report = None
        deadline = time.time() + REPORT_TIMEOUT
        while time.time() < deadline:
            time.sleep(REPORT_POLL_INTERVAL)
            report = api.get_report(recruiter_token, interview_id)
            if report.get("status") != "processing" and report.get("scores"):
                break
        if not report or report.get("scores") is None:
            print("ERROR: report did not complete in time", file=sys.stderr)
            return 1

        print("\n" + "=" * 60)
        print("INTERVIEW REPORT")
        print("=" * 60)
        print(json.dumps(report, indent=2, default=str))
        print("\nOpen in the UI: report page for interview", interview_id)
        return 0
    except ApiError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        return 1
    finally:
        api.close()


if __name__ == "__main__":
    sys.exit(main())
