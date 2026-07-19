import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import type { Interview } from "@/types";
import { Calendar, Clock, Play, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { ResumeUpload } from "@/components/ResumeUpload";

export function CandidateDashboard() {
  const { data: interviews = [], isLoading } = useQuery<Interview[]>({
    queryKey: ["interviews"],
    queryFn: async () => {
      const res = await api.get("/interviews/");
      return res.data;
    },
  });

  const statusColor: Record<string, string> = {
    scheduled: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Candidate Dashboard</h1>
        <p className="text-gray-500 mt-1">Upload your resume and manage your interviews</p>
      </div>

      {/* Resume Upload Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Resume</h2>
        <ResumeUpload />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Total Interviews</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{interviews.length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Completed</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            {interviews.filter((i) => i.status === "completed").length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Upcoming</div>
          <div className="text-3xl font-bold text-blue-600 mt-1">
            {interviews.filter((i) => i.status === "scheduled").length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Your Interviews</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : interviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No interviews yet. Upload your resume first, then your recruiter will schedule one.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {interviews.map((interview) => (
              <div key={interview.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{interview.title}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(interview.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {interview.duration_minutes} min
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[interview.status]}`}>
                    {interview.status.replace("_", " ")}
                  </span>

                  {(interview.status === "scheduled" || interview.status === "in_progress") && (
                    <Link
                      to={`/interview/${interview.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Play size={14} />
                      {interview.status === "scheduled" ? "Start" : "Continue"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
