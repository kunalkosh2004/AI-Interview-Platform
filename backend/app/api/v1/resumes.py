import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.storage import save_file, delete_file
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeResponse, ResumeUploadResponse, ResumeParseStatus
from app.services.resume.parser import extract_text_from_pdf, parse_resume_with_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resumes", tags=["resumes"])

ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=ResumeUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    existing = await db.execute(select(Resume).where(Resume.user_id == user.id))
    existing_resume = existing.scalar_one_or_none()

    file_path = await save_file(file_bytes, file.filename, folder="resumes")

    if existing_resume:
        await delete_file(existing_resume.file_path)
        existing_resume.file_path = file_path
        existing_resume.file_name = file.filename
        existing_resume.raw_text = None
        existing_resume.parsed_data = None
        resume = existing_resume
    else:
        resume = Resume(
            user_id=user.id,
            file_path=file_path,
            file_name=file.filename,
        )
        db.add(resume)

    await db.commit()
    await db.refresh(resume)

    raw_text = extract_text_from_pdf(file_path)
    resume.raw_text = raw_text

    parsed_data = await parse_resume_with_llm(raw_text)
    resume.parsed_data = parsed_data

    await db.commit()
    await db.refresh(resume)

    return ResumeUploadResponse(
        resume=ResumeResponse.model_validate(resume),
        message="Resume uploaded and parsed successfully",
        parsing_status="completed",
    )


@router.get("/me", response_model=ResumeResponse | None)
async def get_my_resume(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Resume).where(Resume.user_id == user.id))
    resume = result.scalar_one_or_none()
    return resume


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resume = await db.get(Resume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if user.role == "candidate" and resume.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return resume


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resume = await db.get(Resume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    await delete_file(resume.file_path)
    await db.delete(resume)
    await db.commit()
