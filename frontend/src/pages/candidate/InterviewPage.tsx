import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  startInterviewSession,
  submitAnswer,
} from "@/api/resume";
import type { Interview, Question, ConversationMessage } from "@/types";
import { CodeEditor } from "@/components/CodeEditor";
import { ProctoringBar } from "@/components/ProctoringBar";
import { useMicrophone } from "@/hooks/useMicrophone";
import {
  Send,
  Loader2,
  Play,
  Clock,
  CheckCircle,
  Code,
  MessageSquare,
  Camera,
  Mic,
  MicOff,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

type CameraPermissionStatus = "pending" | "checking" | "granted" | "denied";

export function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const interviewId = Number(id);

  const [sessionStarted, setSessionStarted] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(null);
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionStatus>("pending");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    permission: micPermission,
    isRecording,
    audioLevel,
    transcript,
    requestPermission: requestMicPermission,
    startRecording,
    stopRecording,
    clearTranscript,
  } = useMicrophone();

  // Clean up lobby camera stream when session starts
  useEffect(() => {
    if (sessionStarted && cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [sessionStarted, cameraStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  const requestCameraAccess = useCallback(async () => {
    setCameraPermission("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      setCameraStream(stream);
      if (lobbyVideoRef.current) {
        lobbyVideoRef.current.srcObject = stream;
      }
      setCameraPermission("granted");
    } catch {
      setCameraPermission("denied");
    }
  }, []);

  // Keep textarea in sync with live speech transcript
  useEffect(() => {
    if (isRecording && transcript) {
      setAnswer(transcript);
    }
  }, [transcript, isRecording]);

  const handleVoiceToggle = useCallback(() => {
    if (!isRecording) {
      clearTranscript();
      setAnswer("");
      startRecording();
    } else {
      const final = stopRecording();
      setAnswer(final);
    }
  }, [isRecording, clearTranscript, startRecording, stopRecording]);

  const { data: interview } = useQuery<Interview>({
    queryKey: ["interview", interviewId],
    queryFn: async () => {
      const res = await api.get(`/interviews/${interviewId}`);
      return res.data;
    },
    enabled: !!interviewId,
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      if (interview?.status === "scheduled") {
        await api.post(`/interviews/${interviewId}/start`);
      }
      return startInterviewSession(interviewId);
    },
    onSuccess: (data) => {
      setSessionStarted(true);
      setMessages([data.welcome_message]);
      setQuestions(data.questions);
      setCurrentQuestionIndex(0);
      toast.success("Interview started!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start session");
    },
  });

  const submitAnswerMutation = useMutation({
    mutationFn: ({ questionId, answerText }: { questionId: number; answerText: string }) =>
      submitAnswer(interviewId, questionId, answerText),
    onSuccess: async (data) => {
      const aiMsg: ConversationMessage = {
        id: Date.now(),
        role: "ai",
        content: data.ai_response,
        message_type: "text",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setEvaluation(data.evaluation);
      setAnswer("");
      setIsSubmitting(false);

      const isLastQuestion =
        data.ai_response.toLowerCase().includes("last question") ||
        data.ai_response.toLowerCase().includes("thank you for completing");

      if (isLastQuestion) {
        try {
          await api.post(`/interviews/${interviewId}/end`);
        } catch {
          // ignore — might already be ended
        }
        toast.success("Interview completed!");
        setTimeout(() => navigate("/candidate"), 2000);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit answer");
      setIsSubmitting(false);
    },
  });

  const handleSubmitAnswer = () => {
    if (!answer.trim() || questions.length === 0) return;

    setIsSubmitting(true);
    const candidateMsg: ConversationMessage = {
      id: Date.now(),
      role: "candidate",
      content: answer,
      message_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, candidateMsg]);

    submitAnswerMutation.mutate({
      questionId: questions[currentQuestionIndex].id,
      answerText: answer,
    });

    setCurrentQuestionIndex((prev) => Math.min(prev + 1, questions.length - 1));
  };

  const handleCodingSubmit = (code: string, language: string) => {
    const formatted = `[${language} code]\n\`\`\`${language}\n${code}\n\`\`\``;
    setIsSubmitting(true);

    const candidateMsg: ConversationMessage = {
      id: Date.now(),
      role: "candidate",
      content: `[Submitted ${language} code]`,
      message_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, candidateMsg]);

    submitAnswerMutation.mutate({
      questionId: questions[currentQuestionIndex].id,
      answerText: formatted,
    });

    setCurrentQuestionIndex((prev) => Math.min(prev + 1, questions.length - 1));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const currentQuestion = questions[currentQuestionIndex];
  const isCodingQuestion = currentQuestion?.question_type === "coding";
  const progress = questions.length > 0 ? ((currentQuestionIndex) / questions.length) * 100 : 0;

  const lastAiMessage = [...messages].reverse().find((m) => m.role === "ai");
  const questionAlreadyInChat = lastAiMessage?.content.includes(currentQuestion?.question_text || "");

  if (!interview) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (interview.status === "completed") {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Interview Completed</h2>
          <p className="text-gray-500 mt-2">
            Your interview has been completed. Check your dashboard for results.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionStarted) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play size={32} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{interview.title}</h2>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">
              {interview.description || "AI-powered interview based on your resume."}
            </p>

            <div className="flex items-center justify-center gap-6 mt-6 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock size={16} />
                {interview.duration_minutes} minutes
              </div>
              <div className="flex items-center gap-1">
                <Code size={16} />
                {interview.interview_type}
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare size={16} />
                Difficulty {interview.difficulty_level}/3
              </div>
            </div>

            {/* Camera + Mic permission section */}
            <div className="mt-8 max-w-sm mx-auto space-y-3">
              {/* ── Camera ───────────────────────────────────────────── */}
              {cameraPermission === "pending" && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-3">
                    <Camera size={20} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Camera access required</p>
                      <p className="text-xs text-amber-700 mt-1">
                        This interview requires your camera to be active for proctoring. You must grant camera access before starting.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={requestCameraAccess}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    <Camera size={15} />
                    Enable Camera
                  </button>
                </div>
              )}

              {cameraPermission === "checking" && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex items-center gap-3">
                  <Loader2 size={18} className="text-blue-600 animate-spin shrink-0" />
                  <p className="text-sm text-blue-700">Requesting camera access...</p>
                </div>
              )}

              {cameraPermission === "denied" && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Camera access denied</p>
                      <p className="text-xs text-red-700 mt-1">
                        Camera permission was denied. Please allow camera access in your browser settings and try again. The interview cannot start without it.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={requestCameraAccess}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Camera size={15} />
                    Try Again
                  </button>
                </div>
              )}

              {cameraPermission === "granted" && (
                <div className="border border-green-200 bg-green-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Camera size={18} className="text-green-600 shrink-0" />
                    <p className="text-sm font-semibold text-green-800">Camera active — ready to start</p>
                  </div>
                  <div className="rounded-lg overflow-hidden bg-gray-900 border border-gray-300 aspect-video max-h-40 mx-auto">
                    <video
                      ref={lobbyVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  </div>
                </div>
              )}

              {/* ── Microphone ───────────────────────────────────────── */}
              {cameraPermission === "granted" && micPermission === "pending" && (
                <div className="border border-violet-200 bg-violet-50 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-3">
                    <Mic size={20} className="text-violet-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-violet-800">Microphone access recommended</p>
                      <p className="text-xs text-violet-700 mt-1">
                        Enable your microphone to answer questions by voice. You can still type if you prefer, but voice answers are encouraged.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={requestMicPermission}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    <Mic size={15} />
                    Enable Microphone
                  </button>
                </div>
              )}

              {cameraPermission === "granted" && micPermission === "checking" && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex items-center gap-3">
                  <Loader2 size={18} className="text-blue-600 animate-spin shrink-0" />
                  <p className="text-sm text-blue-700">Requesting microphone access...</p>
                </div>
              )}

              {cameraPermission === "granted" && micPermission === "denied" && (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-3">
                    <MicOff size={20} className="text-orange-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800">Microphone access denied</p>
                      <p className="text-xs text-orange-700 mt-1">
                        You can still type your answers. To enable voice input, allow microphone access in your browser settings and refresh.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={requestMicPermission}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <Mic size={15} />
                    Try Again
                  </button>
                </div>
              )}

              {cameraPermission === "granted" && micPermission === "granted" && (
                <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-3">
                  <Mic size={18} className="text-green-600 shrink-0" />
                  <p className="text-sm font-semibold text-green-800">Microphone active — voice answers enabled</p>
                </div>
              )}
            </div>

            <button
              onClick={() => startSessionMutation.mutate()}
              disabled={startSessionMutation.isPending || cameraPermission !== "granted"}
              className="mt-6 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {startSessionMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Generating Questions...
                </span>
              ) : (
                "Start Interview"
              )}
            </button>

            {cameraPermission !== "granted" && (
              <p className="mt-2 text-xs text-gray-400">
                Camera access is required to start the interview
              </p>
            )}
            {cameraPermission === "granted" && micPermission !== "granted" && (
              <p className="mt-2 text-xs text-gray-400">
                Microphone is optional — you can still type your answers
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(progress)}% complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Proctoring Bar */}
      <div className="mb-4">
        <ProctoringBar interviewId={interviewId} enabled={sessionStarted} />
      </div>

      {/* Chat Area */}
      <div className={`flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${isCodingQuestion ? "lg:flex-row" : ""}`}>
        {/* Messages */}
        <div className={`${isCodingQuestion ? "lg:w-1/2 lg:border-r lg:border-gray-200" : ""} flex flex-col min-h-0`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "candidate" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === "ai"
                      ? "bg-gray-100 text-gray-900"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  {msg.role === "ai" && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AI</span>
                      </div>
                      <span className="text-xs font-medium text-gray-500">Interviewer</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                </div>
              </div>
            ))}

            {evaluation && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-green-50 border border-green-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle size={14} className="text-green-600" />
                    <span className="text-xs font-medium text-green-700">Evaluation</span>
                  </div>
                  <p className="text-sm text-green-800">
                    {String(evaluation.feedback || "")}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {String(evaluation.correctness || "")}
                    </span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Depth: {String(evaluation.depth || "")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Text + Voice Input (non-coding) */}
          {!isCodingQuestion && (
            <div className="border-t border-gray-200 p-4">
              {currentQuestion && !questionAlreadyInChat && (
                <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {currentQuestion.category}
                    </span>
                    <span className="text-xs text-blue-600">
                      {currentQuestion.question_type} - Difficulty {currentQuestion.difficulty}/3
                    </span>
                  </div>
                  <p className="text-sm text-blue-900 font-medium">
                    {currentQuestion.question_text}
                  </p>
                </div>
              )}

              {/* Voice level bar (visible while recording) */}
              {isRecording && (
                <div className="mb-2 flex items-center gap-2">
                  <Mic size={13} className="text-violet-500 shrink-0 animate-pulse" />
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-75"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-violet-600 font-medium w-8 text-right">
                    {audioLevel}%
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <textarea
                  value={answer}
                  onChange={(e) => {
                    if (!isRecording) setAnswer(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitAnswer();
                    }
                  }}
                  placeholder={
                    isRecording
                      ? "Listening… speak your answer"
                      : micPermission === "granted"
                      ? "Type your answer or use the mic…"
                      : "Type your answer…"
                  }
                  rows={2}
                  readOnly={isRecording}
                  className={`flex-1 resize-none rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                    isRecording
                      ? "border-violet-300 bg-violet-50 focus:ring-violet-400 cursor-not-allowed"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />

                {/* Mic toggle (only shown when permission is granted) */}
                {micPermission === "granted" && (
                  <button
                    onClick={handleVoiceToggle}
                    title={isRecording ? "Stop recording" : "Start voice input"}
                    className={`px-3 py-3 rounded-lg transition-colors ${
                      isRecording
                        ? "bg-violet-600 text-white hover:bg-violet-700 animate-pulse"
                        : "bg-gray-100 text-gray-600 hover:bg-violet-100 hover:text-violet-600"
                    }`}
                  >
                    {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}

                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answer.trim() || isSubmitting}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>

              {isRecording && (
                <p className="mt-1.5 text-[10px] text-violet-500 text-center">
                  Recording in progress — click the mic button to stop and use this as your answer
                </p>
              )}
            </div>
          )}
        </div>

        {/* Code Editor (coding questions) */}
        {isCodingQuestion && (
          <div className="lg:w-1/2 flex flex-col min-h-0">
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center gap-2 mb-1">
                <Code size={14} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  {currentQuestion?.category}
                </span>
                <span className="text-xs text-blue-600">
                  Coding - Difficulty {currentQuestion?.difficulty}/3
                </span>
              </div>
              <p className="text-sm text-blue-900 font-medium">
                {currentQuestion?.question_text}
              </p>
            </div>
            <div className="flex-1 min-h-0">
              <CodeEditor
                testCases={currentQuestion?.test_cases}
                onSubmit={handleCodingSubmit}
                isSubmitting={isSubmitting}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
