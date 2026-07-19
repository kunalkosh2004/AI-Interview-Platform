import { useState } from "react";
import Editor from "@monaco-editor/react";
import { runCode } from "@/api/resume";
import {
  Play,
  Loader2,
  ChevronDown,
  Terminal,
  Copy,
  Check,
  Send,
  FileCheck,
  XCircle,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const LANGUAGES = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "javascript", label: "JavaScript", monaco: "javascript" },
  { id: "java", label: "Java", monaco: "java" },
  { id: "cpp", label: "C++", monaco: "cpp" },
  { id: "go", label: "Go", monaco: "go" },
];

const DEFAULT_CODE: Record<string, string> = {
  python: `def solution(arr, target):\n    # Write your solution here\n    pass`,
  javascript: `function solution(arr, target) {\n  // Write your solution here\n}`,
  java: `class Solution {\n    public static int[] solution(int[] arr, int target) {\n        // Write your solution here\n        return new int[]{};\n    }\n}`,
  cpp: `vector<int> solution(vector<int>& arr, int target) {\n    // Write your solution here\n    return {};\n}`,
  go: `func solution(arr []int, target int) []int {\n\t// Write your solution here\n\treturn nil\n}`,
};

interface TestCase {
  input: string;
  expected: string;
  explanation?: string;
}

interface TestResult {
  test_case: number;
  passed: boolean;
  expected: string;
  got: string;
}

interface CodeEditorProps {
  testCases?: TestCase[];
  onSubmit: (code: string, language: string) => void;
  isSubmitting?: boolean;
}

export function CodeEditor({
  testCases,
  onSubmit,
  isSubmitting = false,
}: CodeEditorProps) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [output, setOutput] = useState<string>("");
  const [outputError, setOutputError] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testsPassed, setTestsPassed] = useState<number | null>(null);
  const [testsTotal, setTestsTotal] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"testcases" | "output">("testcases");
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];
  const hasTestCases = testCases && testCases.length > 0;

  const handleLanguageChange = (langId: string) => {
    setLanguage(langId);
    setCode(DEFAULT_CODE[langId] || "");
    setLangOpen(false);
    setOutput("");
    setOutputError(false);
    setTestResults(null);
    setTestsPassed(null);
    setTestsTotal(null);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput("");
    setOutputError(false);
    setTestResults(null);
    setTestsPassed(null);
    setTestsTotal(null);
    setActiveTab("output");

    try {
      const result = await runCode(
        code,
        language,
        hasTestCases ? testCases : undefined
      );

      if (result.test_results && result.test_results.length > 0) {
        setTestResults(result.test_results);
        setTestsPassed(result.tests_passed ?? 0);
        setTestsTotal(result.tests_total ?? 0);
        setOutputError(result.status !== "success");
      } else {
        let out = "";
        if (result.stdout) out += result.stdout;
        if (result.stderr) out += `\n${result.stderr}`;
        if (result.error) out += `\nError: ${result.error}`;
        if (!out.trim()) out = "(no output)";
        setOutput(out);
        setOutputError(result.status !== "success");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run code";
      setOutput(`Error: ${msg}`);
      setOutputError(true);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = () => {
    onSubmit(code, language);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {currentLang.label}
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            {langOpen && (
              <div className="absolute top-full left-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageChange(lang.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                      language === lang.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {hasTestCases && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isRunning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              Run Tests
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-600 text-white text-xs font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            Run
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            Submit
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={currentLang.monaco}
          value={code}
          onChange={(val) => setCode(val || "")}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: false },
            padding: { top: 8, bottom: 8 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 4,
            lineNumbers: "on",
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            smoothScrolling: true,
          }}
        />
      </div>

      {/* Bottom Panel: Test Cases / Output */}
      <div className="border-t border-gray-200 shrink-0">
        {/* Tabs */}
        <div className="flex items-center bg-gray-50 border-b border-gray-200">
          {hasTestCases && (
            <button
              onClick={() => setActiveTab("testcases")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "testcases"
                  ? "border-blue-600 text-blue-700 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <FileCheck size={12} />
              Test Cases
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1 rounded">
                {testCases!.length}
              </span>
            </button>
          )}
          <button
            onClick={() => setActiveTab("output")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "output"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Terminal size={12} />
            Output
            {isRunning && <Loader2 size={10} className="animate-spin" />}
            {testsPassed !== null && testsTotal !== null && (
              <span
                className={`text-[10px] px-1 rounded ${
                  testsPassed === testsTotal
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {testsPassed}/{testsTotal}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[180px] overflow-y-auto">
          {activeTab === "testcases" && (
            <div className="p-2">
              {hasTestCases ? (
                <div className="space-y-2">
                  {testCases!.map((tc, i) => {
                    const result = testResults?.find((r) => r.test_case === i + 1);
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-2 text-xs ${
                          result
                            ? result.passed
                              ? "border-green-200 bg-green-50"
                              : "border-red-200 bg-red-50"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-700">
                            Case {i + 1}
                          </span>
                          {result && (
                            <span
                              className={`flex items-center gap-0.5 text-[10px] font-medium ${
                                result.passed ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {result.passed ? (
                                <>
                                  <CheckCircle size={10} /> Passed
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} /> Failed
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Input</span>
                            <pre className="mt-0.5 p-1.5 bg-white rounded border border-gray-100 text-gray-800 font-mono text-[11px] overflow-x-auto">
                              {typeof tc.input === 'object' ? JSON.stringify(tc.input) : tc.input}
                            </pre>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Expected</span>
                            <pre className="mt-0.5 p-1.5 bg-white rounded border border-gray-100 text-gray-800 font-mono text-[11px] overflow-x-auto">
                              {typeof tc.expected === 'object' ? JSON.stringify(tc.expected) : tc.expected}
                            </pre>
                          </div>
                        </div>
                        {result && !result.passed && (
                          <div className="mt-1.5">
                            <span className="text-[10px] text-red-500 uppercase">Got</span>
                            <pre className="mt-0.5 p-1.5 bg-white rounded border border-red-100 text-red-700 font-mono text-[11px] overflow-x-auto">
                              {typeof result.got === 'object' ? JSON.stringify(result.got) : result.got}
                            </pre>
                          </div>
                        )}
                        {tc.explanation && (
                          <p className="mt-1 text-[10px] text-gray-500 italic">
                            {tc.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400 text-xs">
                  <FileCheck size={20} className="mx-auto mb-1 opacity-50" />
                  <p>No test cases for this question</p>
                  <p className="text-[10px] mt-0.5">Click "Run" to execute your code</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "output" && (
            <div>
              {testResults && testResults.length > 0 ? (
                <div className="p-2">
                  {/* Summary */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${
                      testsPassed === testsTotal
                        ? "bg-green-50 border border-green-200"
                        : "bg-red-50 border border-red-200"
                    }`}
                  >
                    {testsPassed === testsTotal ? (
                      <CheckCircle size={16} className="text-green-600" />
                    ) : (
                      <XCircle size={16} className="text-red-600" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        testsPassed === testsTotal ? "text-green-800" : "text-red-800"
                      }`}
                    >
                      {testsPassed === testsTotal
                        ? "All test cases passed!"
                        : `${testsPassed} of ${testsTotal} test cases passed`}
                    </span>
                  </div>
                  {/* Individual results */}
                  {testResults.map((r) => (
                    <div
                      key={r.test_case}
                      className={`flex items-center gap-2 px-2 py-1 text-xs ${
                        r.passed ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {r.passed ? (
                        <CheckCircle size={12} />
                      ) : (
                        <XCircle size={12} />
                      )}
                      <span>
                        Case {r.test_case}: {r.passed ? "Passed" : `Expected ${r.expected}, got ${r.got}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <pre
                  className={`px-3 py-2 text-xs font-mono ${
                    outputError
                      ? "bg-red-50 text-red-800"
                      : "bg-gray-900 text-green-400"
                  }`}
                >
                  {output || (isRunning ? "Running..." : "Click 'Run' to see output")}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
