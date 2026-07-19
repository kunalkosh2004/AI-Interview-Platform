from datetime import datetime

from pydantic import BaseModel


class ResumeResponse(BaseModel):
    id: int
    user_id: int
    file_name: str
    file_path: str
    raw_text: str | None = None
    parsed_data: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ParsedResumeData(BaseModel):
    skills: list[str] = []
    experience_years: int = 0
    experience: list[dict] = []
    education: list[dict] = []
    projects: list[dict] = []
    technologies: list[str] = []
    domain_expertise: list[str] = []


class ResumeUploadResponse(BaseModel):
    resume: ResumeResponse
    message: str = "Resume uploaded successfully"
    parsing_status: str = "pending"


class ResumeParseStatus(BaseModel):
    resume_id: int
    status: str  # pending | parsing | completed | failed
    raw_text: str | None = None
    parsed_data: dict | None = None
    error: str | None = None
