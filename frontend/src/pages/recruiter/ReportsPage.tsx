import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Shield,
  TrendingUp,
  TrendingDown,
  Camera,
  Copy,
  Monitor,
  MousePointer,
  Keyboard,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";

interface ReportData {
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
  created_at?: string;
}

export function ReportsPage() {
  const { interviewId } = useParams<{ interviewId: string }>();
  const queryClient = useQueryClient();
  const id = Number(interviewId);
  const [showEvents, setShowEvents] = useState(false);

  const { data: report, isLoading } = useQuery<ReportData>({
    queryKey: ["report", id],
    queryFn: async () => {
      const res = await api.get(`/interviews/${id}/report`);
      return res.data;
    },
    enabled: !!id,
    retry: false,
  });

  const { data: proctoringData } = useQuery({
    queryKey: ["proctoring", id],
    queryFn: async () => {
      const res = await api.get(`/interviews/${id}/proctoring/events`);
      return res.data;
    },
    enabled: !!id,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/interviews/${id}/report/generate`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Report generated!");
      queryClient.invalidateQueries({ queryKey: ["report", id] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to generate report");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Interview Report</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileText size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Report Yet</h2>
          <p className="text-gray-500 mb-6">
            Generate an AI-powered report for this interview.
          </p>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {generateMutation.isPending ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>
    );
  }

  const scoreEntries = report.scores
    ? Object.entries(report.scores).filter(([k]) => k !== "overall")
    : [];
  const recommendationConfig = {
    hire: { color: "text-green-600 bg-green-50 border-green-200", icon: CheckCircle, label: "HIRE" },
    borderline: { color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: AlertTriangle, label: "BORDERLINE" },
    reject: { color: "text-red-600 bg-red-50 border-red-200", icon: XCircle, label: "REJECT" },
  };
  const rec = recommendationConfig[report.recommendation || "borderline"];
  const RecIcon = rec.icon;

  const riskColors = {
    low: "text-green-600 bg-green-50",
    medium: "text-yellow-600 bg-yellow-50",
    high: "text-red-600 bg-red-50",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Interview Report</h1>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border font-bold text-lg ${rec.color}`}>
            <RecIcon size={20} />
            {rec.label}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Summary</h2>
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{report.summary}</p>
      </div>

      {/* Scores */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Scores</h2>
        <div className="space-y-3">
          {scoreEntries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-40 capitalize">
                {key.replace(/_/g, " ")}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    value >= 8 ? "bg-green-500" : value >= 6 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${(value / 10) * 100}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-900 w-10 text-right">
                {value}/10
              </span>
            </div>
          ))}
        </div>
        {report.scores?.overall && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Overall Score</span>
            <span className="text-2xl font-bold text-blue-600">
              {report.scores.overall}/10
            </span>
          </div>
        )}
      </div>

      {/* Proctoring Assessment */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Shield size={20} />
          Proctoring Assessment
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Cheating Risk:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${riskColors[report.cheating_risk || "low"]}`}>
              {(report.cheating_risk || "low").toUpperCase()}
            </span>
          </div>
          {proctoringData?.summary && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{proctoringData.summary.total} total events</span>
              {proctoringData.summary.critical > 0 && (
                <span className="text-red-600 font-medium">{proctoringData.summary.critical} critical</span>
              )}
              {proctoringData.summary.high > 0 && (
                <span className="text-orange-600 font-medium">{proctoringData.summary.high} high</span>
              )}
            </div>
          )}
        </div>

        {proctoringData?.events?.length > 0 && (
          <div>
            <button
              onClick={() => setShowEvents(!showEvents)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {showEvents ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showEvents ? "Hide" : "View"} Event Details ({proctoringData.events.length})
            </button>
            {showEvents && (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {proctoringData.events.map((event: {
                  id: number;
                  event_type: string;
                  severity: string;
                  details?: Record<string, unknown>;
                  timestamp_seconds: number;
                  created_at: string;
                }) => {
                  const severityColor = {
                    critical: "bg-red-100 text-red-700 border-red-200",
                    high: "bg-orange-100 text-orange-700 border-orange-200",
                    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
                    low: "bg-gray-100 text-gray-600 border-gray-200",
                  }[event.severity] || "bg-gray-100 text-gray-600";

                  const eventIcon = {
                    tab_switch: Monitor,
                    window_blur: EyeOff,
                    copy_paste: Copy,
                    right_click: MousePointer,
                    devtools_open: Keyboard,
                    camera_tamper: Camera,
                  }[event.event_type] || AlertTriangle;

                  const EventIcon = eventIcon;
                  const timeStr = `${Math.floor(event.timestamp_seconds / 60)}:${String(Math.floor(event.timestamp_seconds % 60)).padStart(2, "0")}`;

                  return (
                    <div key={event.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${severityColor}`}>
                      <EventIcon size={14} />
                      <span className="font-medium capitalize">{event.event_type.replace(/_/g, " ")}</span>
                      <span className="text-xs opacity-70">{timeStr}</span>
                      {event.details && (
                        <span className="text-xs opacity-60 ml-auto">
                          {JSON.stringify(event.details)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(!proctoringData?.events || proctoringData.events.length === 0) && (
          <p className="text-sm text-gray-400">No proctoring events recorded</p>
        )}
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-600" />
            Strengths
          </h2>
          <ul className="space-y-2">
            {(report.strengths || []).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
            {(!report.strengths || report.strengths.length === 0) && (
              <li className="text-sm text-gray-400">No strengths recorded</li>
            )}
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingDown size={20} className="text-red-600" />
            Weaknesses
          </h2>
          <ul className="space-y-2">
            {(report.weaknesses || []).map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <AlertTriangle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
            {(!report.weaknesses || report.weaknesses.length === 0) && (
              <li className="text-sm text-gray-400">No weaknesses recorded</li>
            )}
          </ul>
        </div>
      </div>

      {/* Improvement Areas */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          Improvement Areas
        </h2>
        <div className="flex flex-wrap gap-2">
          {(report.improvement_areas || []).map((area, i) => (
            <span
              key={i}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200"
            >
              {area}
            </span>
          ))}
          {(!report.improvement_areas || report.improvement_areas.length === 0) && (
            <span className="text-sm text-gray-400">No improvement areas recorded</span>
          )}
        </div>
      </div>
    </div>
  );
}
