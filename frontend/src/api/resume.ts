import api from "./client";
import type { Resume, Question, ConversationMessage } from "@/types";

export async function uploadResume(file: File): Promise<{
  resume: Resume;
  message: string;
  parsing_status: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/resumes/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getMyResume(): Promise<Resume | null> {
  const { data } = await api.get("/resumes/me");
  return data;
}

export async function deleteResume(resumeId: number): Promise<void> {
  await api.delete(`/resumes/${resumeId}`);
}

export async function startInterviewSession(interviewId: number): Promise<{
  interview: { id: number; status: string };
  questions: Question[];
  welcome_message: ConversationMessage;
}> {
  const { data } = await api.post(`/interviews/${interviewId}/session/start`);
  return data;
}

export async function submitAnswer(
  interviewId: number,
  questionId: number,
  answerText: string
): Promise<{
  evaluation: Record<string, unknown> | null;
  ai_response: string;
  next_question_id: number | null;
}> {
  const { data } = await api.post(
    `/interviews/${interviewId}/session/answer`,
    { question_id: questionId, answer_text: answerText }
  );
  return data;
}

export async function getConversation(
  interviewId: number
): Promise<ConversationMessage[]> {
  const { data } = await api.get(
    `/interviews/${interviewId}/session/conversation`
  );
  return data.messages;
}

export async function getQuestions(
  interviewId: number
): Promise<Question[]> {
  const { data } = await api.get(
    `/interviews/${interviewId}/session/questions`
  );
  return data.questions;
}

export async function submitCode(
  sessionId: number,
  code: string,
  language: string
): Promise<{
  status: string;
  stdout?: string;
  stderr?: string;
  tests_passed?: number;
  tests_total?: number;
  test_results?: Record<string, unknown>[];
  error?: string;
}> {
  const { data } = await api.post(`/coding/${sessionId}/submit`, {
    code,
    language,
  });
  return data;
}

export async function runCode(
  code: string,
  language: string,
  testCases?: { input: string; expected: string; explanation?: string }[]
): Promise<{
  status: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  tests_passed?: number;
  tests_total?: number;
  test_results?: { test_case: number; passed: boolean; expected: string; got: string }[];
  error?: string;
}> {
  const { data } = await api.post("/coding/run", {
    code,
    language,
    test_cases: testCases || null,
  });
  return data;
}

export async function logProctoringEvent(
  interviewId: number,
  event: {
    event_type: string;
    severity?: string;
    confidence?: number;
    details?: Record<string, unknown>;
    timestamp_seconds?: number;
  }
): Promise<void> {
  await api.post(`/interviews/${interviewId}/proctoring/events`, event);
}

export async function getProctoringEvents(interviewId: number): Promise<{
  events: {
    id: number;
    event_type: string;
    severity: string;
    confidence: number;
    details?: Record<string, unknown>;
    timestamp_seconds: number;
    created_at: string;
  }[];
  summary: { total: number; critical: number; high: number };
}> {
  const { data } = await api.get(`/interviews/${interviewId}/proctoring/events`);
  return data;
}
