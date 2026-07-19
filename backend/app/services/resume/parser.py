import json
import logging
from pathlib import Path

import fitz  # PyMuPDF

from app.core.llm import llm_chat

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts).strip()


async def parse_resume_with_llm(raw_text: str) -> dict:
    prompt = f"""Parse this resume into JSON. You MUST return EXACTLY this schema — no extra fields, no different names:

{{
    "skills": ["Python", "FastAPI", "Docker"],
    "experience_years": 3,
    "experience": [
        {{"title": "Job Title", "company": "Company", "duration": "2022-2025", "description": "What they did"}}
    ],
    "education": [
        {{"degree": "B.Tech CS", "institution": "University", "year": "2022"}}
    ],
    "projects": [
        {{"name": "Project Name", "description": "What it does", "technologies": ["Python", "React"]}}
    ],
    "technologies": ["Python", "Docker", "AWS"],
    "domain_expertise": ["backend", "devops"]
}}

Resume text:
---
{raw_text[:10000]}
---

RULES:
- "skills": flat array of ALL skills (languages, frameworks, tools, databases)
- "experience_years": number, calculate from dates (2022-2026 = 4)
- "experience": array of job entries with title, company, duration, description
- "education": array of degrees
- "projects": array of projects with name, description, technologies
- "technologies": flat array of ALL technologies mentioned
- "domain_expertise": infer from skills — e.g. Python+FastAPI="backend", React="frontend", Docker+K8s="devops", TensorFlow="ml"
- Return ONLY the JSON object, no markdown fences, no explanation"""

    try:
        content = await llm_chat(prompt, temperature=0.1)
        logger.info(f"LLM raw (first 800): {content[:800]}")

        # Strip markdown fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()

        parsed = json.loads(content)
        parsed = _normalize(parsed)

        logger.info(
            f"Parsed: skills={len(parsed['skills'])}, "
            f"exp={parsed['experience_years']}y, "
            f"jobs={len(parsed['experience'])}, "
            f"projects={len(parsed['projects'])}, "
            f"domains={len(parsed['domain_expertise'])}"
        )
        return parsed
    except Exception as e:
        logger.error(f"LLM parsing failed: {e}")
        return _fallback_parse(raw_text)


def _normalize(data: dict) -> dict:
    # skills: could be list or dict of lists
    skills = data.get("skills", [])
    if isinstance(skills, dict):
        flat = []
        for v in skills.values():
            if isinstance(v, list):
                flat.extend(v)
            else:
                flat.append(str(v))
        skills = flat
    elif not isinstance(skills, list):
        skills = [str(skills)]

    # experience_years: could be different key names
    exp_years = data.get("experience_years") or data.get("total_experience_years") or data.get("years_of_experience") or 0
    if isinstance(exp_years, str):
        exp_years = int("".join(filter(str.isdigit, exp_years)) or "0")

    # experience: normalize fields
    experience = []
    for job in data.get("experience", data.get("work_experience", [])):
        if isinstance(job, dict):
            desc = job.get("description") or job.get("responsibilities") or ""
            if isinstance(desc, list):
                desc = " ".join(desc)
            experience.append({
                "title": job.get("title") or job.get("position") or "",
                "company": job.get("company") or job.get("organization") or "",
                "duration": job.get("duration") or f"{job.get('start_date', '')}-{job.get('end_date', '')}",
                "description": desc,
            })

    # education: normalize
    education = []
    for edu in data.get("education", []):
        if isinstance(edu, dict):
            education.append({
                "degree": edu.get("degree") or edu.get("qualification") or "",
                "institution": edu.get("institution") or edu.get("school") or edu.get("university") or "",
                "year": edu.get("year") or edu.get("graduation_year") or edu.get("start_date") or "",
            })

    # projects: normalize
    projects = []
    for proj in data.get("projects", []):
        if isinstance(proj, dict):
            techs = proj.get("technologies") or proj.get("tech_stack") or []
            if isinstance(techs, str):
                techs = [t.strip() for t in techs.split(",")]
            projects.append({
                "name": proj.get("name") or proj.get("title") or "",
                "description": proj.get("description") or "",
                "technologies": techs,
            })

    # technologies: flat array
    techs = data.get("technologies", [])
    if isinstance(techs, dict):
        flat = []
        for v in techs.values():
            if isinstance(v, list):
                flat.extend(v)
            else:
                flat.append(str(v))
        techs = flat

    # domain_expertise: flat array
    domains = data.get("domain_expertise", data.get("domains", []))
    if isinstance(domains, dict):
        flat = []
        for v in domains.values():
            if isinstance(v, list):
                flat.extend(v)
            else:
                flat.append(str(v))
        domains = flat

    return {
        "skills": skills,
        "experience_years": exp_years,
        "experience": experience,
        "education": education,
        "projects": projects,
        "technologies": techs,
        "domain_expertise": domains,
    }


def _fallback_parse(raw_text: str) -> dict:
    lines = raw_text.lower()
    common_skills = [
        "python", "java", "javascript", "typescript", "c++", "c", "go", "rust",
        "react", "vue", "angular", "node", "fastapi", "django", "flask", "spring",
        "postgresql", "mysql", "mongodb", "redis", "docker", "kubernetes", "aws",
        "gcp", "azure", "git", "linux", "tensorflow", "pytorch", "pandas",
    ]
    found_skills = [s for s in common_skills if s in lines]
    return {
        "skills": found_skills,
        "experience_years": 0,
        "experience": [],
        "education": [],
        "projects": [],
        "technologies": found_skills,
        "domain_expertise": [],
    }
