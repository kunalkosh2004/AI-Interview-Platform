import asyncio
import json
import logging
import tempfile
import os
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

LANGUAGE_CONFIGS = {
    "python": {
        "extension": ".py",
        "command": ["python3", "{file}"],
        "timeout": 30,
    },
    "javascript": {
        "extension": ".js",
        "command": ["node", "{file}"],
        "timeout": 30,
    },
    "java": {
        "extension": ".java",
        "command": ["javac", "{file}", "&&", "java", "-cp", "{dir}", "{class_name}"],
        "timeout": 30,
    },
    "cpp": {
        "extension": ".cpp",
        "command": ["g++", "{file}", "-o", "{dir}/out", "&&", "{dir}/out"],
        "timeout": 30,
    },
    "go": {
        "extension": ".go",
        "command": ["go", "run", "{file}"],
        "timeout": 30,
    },
}


async def execute_code(
    code: str,
    language: str,
    test_cases: list[dict] | None = None,
    time_limit: int = 30,
    memory_limit: str = "256m",
) -> dict:
    lang_config = LANGUAGE_CONFIGS.get(language)
    if not lang_config:
        return {
            "status": "error",
            "error": f"Unsupported language: {language}",
            "tests_passed": 0,
            "tests_total": 0,
        }

    if test_cases:
        return await _run_with_test_cases(code, language, test_cases, time_limit)

    return await _run_single(code, language, time_limit)


async def _run_single(code: str, language: str, time_limit: int) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        ext = LANGUAGE_CONFIGS[language]["extension"]
        filepath = os.path.join(tmpdir, f"solution{ext}")

        with open(filepath, "w") as f:
            f.write(code)

        cmd = _build_command(language, filepath, tmpdir)

        try:
            proc = await asyncio.create_subprocess_shell(
                " ".join(cmd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=time_limit
            )

            return {
                "status": "success" if proc.returncode == 0 else "error",
                "stdout": stdout.decode(errors="replace"),
                "stderr": stderr.decode(errors="replace"),
                "exit_code": proc.returncode,
                "execution_time_ms": 0,
            }
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            return {
                "status": "timeout",
                "error": f"Execution timed out after {time_limit}s",
                "tests_passed": 0,
                "tests_total": 0,
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "tests_passed": 0,
                "tests_total": 0,
            }


async def _run_with_test_cases(
    code: str, language: str, test_cases: list[dict], time_limit: int
) -> dict:
    if language == "python":
        return await _run_python_tests(code, test_cases, time_limit)

    results = []
    for i, tc in enumerate(test_cases):
        input_data = tc.get("input", "")
        expected = tc.get("expected", "")

        wrapped_code = _wrap_with_io(code, language, input_data)
        result = await _run_single(wrapped_code, language, time_limit // len(test_cases))

        passed = result.get("stdout", "").strip() == expected.strip()
        results.append({
            "test_case": i + 1,
            "passed": passed,
            "expected": expected,
            "got": result.get("stdout", "").strip(),
        })

    passed_count = sum(1 for r in results if r["passed"])
    return {
        "status": "success" if passed_count == len(results) else "error",
        "tests_passed": passed_count,
        "tests_total": len(results),
        "test_results": results,
    }


async def _run_python_tests(
    code: str, test_cases: list[dict], time_limit: int
) -> dict:
    test_code = code + "\n\nimport json, sys\nresults = []\n"
    for i, tc in enumerate(test_cases):
        input_data = json.dumps(tc.get("input", ""))
        expected = json.dumps(tc.get("expected", ""))

        is_list_input = isinstance(tc.get("input"), list)
        call = f"solution(*{input_data})" if is_list_input else f"solution({input_data})"

        test_code += f"""
try:
    result = {call}
    results.append({{"test_case": {i+1}, "passed": result == {expected}, "expected": {expected}, "got": result}})
except Exception as e:
    results.append({{"test_case": {i+1}, "passed": False, "expected": {expected}, "got": str(e)}})
"""
    test_code += '\nprint(json.dumps(results))\n'

    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = os.path.join(tmpdir, "test_solution.py")
        with open(filepath, "w") as f:
            f.write(test_code)

        try:
            proc = await asyncio.create_subprocess_exec(
                "python3", filepath,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=time_limit)

            if proc.returncode == 0:
                results = json.loads(stdout.decode().strip())
                passed = sum(1 for r in results if r["passed"])
                return {
                    "status": "success",
                    "tests_passed": passed,
                    "tests_total": len(results),
                    "test_results": results,
                }
            else:
                return {
                    "status": "error",
                    "error": stderr.decode(errors="replace"),
                    "tests_passed": 0,
                    "tests_total": len(test_cases),
                }
        except asyncio.TimeoutError:
            return {
                "status": "timeout",
                "error": f"Execution timed out after {time_limit}s",
                "tests_passed": 0,
                "tests_total": len(test_cases),
            }


def _build_command(language: str, filepath: str, tmpdir: str) -> list[str]:
    config = LANGUAGE_CONFIGS[language]
    class_name = Path(filepath).stem
    cmd = []
    for part in config["command"]:
        cmd.append(
            part
            .replace("{file}", filepath)
            .replace("{dir}", tmpdir)
            .replace("{class_name}", class_name)
        )
    return cmd


def _wrap_with_io(code: str, language: str, input_data: str) -> str:
    if language == "python":
        return f"{code}\n\nimport sys\nsys.stdin = open('/dev/stdin')\nprint(solution({input_data}))\n"
    return code
