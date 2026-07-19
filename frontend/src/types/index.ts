export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "candidate" | "recruiter" | "admin";
  is_active: boolean;
  is_verified: boolean;
  avatar_url?: string;
  created_at: string;
}

export interface Resume {
  id: number;
  user_id: number;
  file_name: string;
  file_path: string;
  raw_text?: string;
  parsed_data?: {
    skills: string[];
    experience_years: number;
    experience: { title: string; company: string; duration: string; description: string }[];
    education: { degree: string; institution: string; year: string }[];
    projects: { name: string; description: string; technologies: string[] }[];
    technologies: string[];
    domain_expertise: string[];
  };
  created_at: string;
}

export interface Interview {
  id: number;
  candidate_id: number;
  recruiter_id?: number;
  resume_id?: number;
  title: string;
  description?: string;
  interview_type: string;
  difficulty_level: number;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes: number;
  created_at: string;
}

export interface Question {
  id: number;
  question_text: string;
  question_type: string;
  category: string;
  difficulty: number;
  order_index: number;
  answer_text?: string;
  test_cases?: {
    input: string;
    expected: string;
    explanation?: string;
  }[];
  ai_evaluation?: {
    score: number;
    correctness: string;
    depth: string;
    feedback: string;
    follow_up?: string;
  };
}

export interface ConversationMessage {
  id: number;
  role: "ai" | "candidate";
  content: string;
  message_type: string;
  audio_url?: string;
  created_at: string;
}

export interface CodingSession {
  id: number;
  problem_title: string;
  problem_description: string;
  language: string;
  starter_code?: string;
  candidate_code?: string;
  execution_result?: {
    status: string;
    tests_passed: number;
    tests_total: number;
    execution_time_ms: number;
    memory_used_mb: number;
  };
  ai_code_evaluation?: {
    quality_score: number;
    time_complexity: string;
    space_complexity: string;
    naming_conventions: string;
    readability: string;
    edge_cases_handled: boolean;
    feedback: string;
  };
}

export interface ProctoringEvent {
  id: number;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  details?: Record<string, unknown>;
  screenshot_url?: string;
  timestamp_seconds?: number;
  created_at: string;
}

export interface InterviewReport {
  id: number;
  interview_id: number;
  scores?: {
    technical_knowledge: number;
    coding: number;
    communication: number;
    problem_solving: number;
    system_design: number;
    confidence: number;
    overall: number;
  };
  strengths?: string[];
  weaknesses?: string[];
  improvement_areas?: string[];
  recommendation?: "hire" | "borderline" | "reject";
  cheating_risk?: "low" | "medium" | "high";
  summary?: string;
  created_at: string;
}
