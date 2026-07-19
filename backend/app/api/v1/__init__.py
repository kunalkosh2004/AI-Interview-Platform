from fastapi import APIRouter
from app.api.v1 import auth, interviews, resumes, coding

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(interviews.router)
api_router.include_router(resumes.router)
api_router.include_router(coding.router)
