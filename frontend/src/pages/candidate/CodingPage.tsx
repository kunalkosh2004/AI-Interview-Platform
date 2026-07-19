import { useParams } from "react-router-dom";

export function CodingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Coding Session #{sessionId}</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <p className="text-gray-500">
          Monaco Editor-based coding environment will be implemented here.
          This will include live code execution, test cases, and AI code evaluation.
        </p>
      </div>
    </div>
  );
}
