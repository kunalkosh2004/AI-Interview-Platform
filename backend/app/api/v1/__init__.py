from fastapi import APIRouter

from app.api.v1 import auth, coding, interviews, resumes

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(interviews.router)
api_router.include_router(resumes.router)
api_router.include_router(coding.router)
