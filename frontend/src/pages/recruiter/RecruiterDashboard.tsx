import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import type { Interview } from "@/types";
import { Calendar, Clock, Users, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

export function RecruiterDashboard() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    candidate_id: "",
    title: "",
    description: "",
    interview_type: "mixed",
    difficulty_level: 2,
    duration_minutes: 60,
  });

  const { data: interviews = [], isLoading } = useQuery<Interview[]>({
    queryKey: ["interviews"],
    queryFn: async () => {
      const res = await api.get("/interviews/");
      return res.data;
    },
  });

  const { data: candidates = [] } = useQuery<{ id: number; full_name: string; email: string }[]>({
    queryKey: ["candidates"],
    queryFn: async () => {
      const res = await api.get("/auth/candidates");
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/interviews/", {
        ...form,
        candidate_id: Number(form.candidate_id),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Interview scheduled!");
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      setShowModal(false);
      setForm({
        candidate_id: "",
        title: "",
        description: "",
        interview_type: "mixed",
        difficulty_level: 2,
        duration_minutes: 60,
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to schedule");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruiter Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage interviews and view candidate reports</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Schedule Interview
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Total Interviews</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{interviews.length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Scheduled</div>
          <div className="text-3xl font-bold text-yellow-600 mt-1">
            {interviews.filter((i) => i.status === "scheduled").length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">In Progress</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            {interviews.filter((i) => i.status === "in_progress").length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="text-sm text-gray-500">Completed</div>
          <div className="text-3xl font-bold text-blue-600 mt-1">
            {interviews.filter((i) => i.status === "completed").length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Interviews</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : interviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No interviews scheduled yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {interviews.map((interview) => (
              <div key={interview.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <Users size={20} className="text-indigo-600" />
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
                      <span className="capitalize">{interview.interview_type.replace("_", " ")}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[interview.status]}`}>
                    {interview.status.replace("_", " ")}
                  </span>

                  {interview.status === "completed" && (
                    <Link
                      to={`/reports/${interview.id}`}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      View Report
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Schedule Interview</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Candidate</label>
                <select
                  value={form.candidate_id}
                  onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a candidate</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.email})
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No candidates registered yet</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Backend Developer Interview"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={form.interview_type}
                    onChange={(e) => setForm({ ...form, interview_type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="technical">Technical</option>
                    <option value="coding">Coding</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="system_design">System Design</option>
                    <option value="dsa">DSA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select
                    value={form.difficulty_level}
                    onChange={(e) => setForm({ ...form, difficulty_level: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>Easy</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={15}
                  max={180}
                />
              </div>

              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.candidate_id || !form.title || createMutation.isPending}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? "Scheduling..." : "Schedule Interview"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
