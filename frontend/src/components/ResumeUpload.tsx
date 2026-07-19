import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadResume, getMyResume, deleteResume } from "@/api/resume";
import { Upload, FileText, Trash2, CheckCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Resume } from "@/types";

export function ResumeUpload() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: resume, isLoading } = useQuery<Resume | null>({
    queryKey: ["resume"],
    queryFn: getMyResume,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadResume,
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["resume"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteResume,
    onSuccess: () => {
      toast.success("Resume deleted");
      queryClient.invalidateQueries({ queryKey: ["resume"] });
    },
  });

  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading resume...
        </div>
      </div>
    );
  }

  if (resume) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{resume.file_name}</h3>
              <p className="text-sm text-gray-500">
                Uploaded {new Date(resume.created_at).toLocaleDateString()}
                {resume.parsed_data?.skills && (
                  <span> - {resume.parsed_data.skills.length} skills detected</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {resume.parsed_data?.skills && (
              <div className="flex flex-wrap gap-1 mr-4">
                {resume.parsed_data.skills.slice(0, 5).map((skill) => (
                  <span
                    key={skill}
                    className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
                {resume.parsed_data.skills.length > 5 && (
                  <span className="text-xs text-gray-500">
                    +{resume.parsed_data.skills.length - 5} more
                  </span>
                )}
              </div>
            )}
            <button
              onClick={() => deleteMutation.mutate(resume.id)}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {resume.parsed_data && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Experience</div>
              <div className="font-semibold text-gray-900">
                {resume.parsed_data.experience_years} years
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Technologies</div>
              <div className="font-semibold text-gray-900">
                {resume.parsed_data.technologies.length}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Projects</div>
              <div className="font-semibold text-gray-900">
                {resume.parsed_data.projects.length}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Domains</div>
              <div className="font-semibold text-gray-900">
                {resume.parsed_data.domain_expertise.length}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
      className={`bg-white rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <div className="flex flex-col items-center text-center">
        {uploadMutation.isPending ? (
          <Loader2 size={40} className="text-blue-500 animate-spin mb-3" />
        ) : (
          <Upload size={40} className="text-gray-400 mb-3" />
        )}
        <h3 className="text-lg font-medium text-gray-900">
          {uploadMutation.isPending
            ? "Uploading and parsing resume..."
            : "Upload your resume"}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          PDF files only, max 10MB
        </p>
        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
          <FileText size={16} />
          Drag & drop or click to browse
        </div>
      </div>
    </div>
  );
}
