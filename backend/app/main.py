import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.api.v1.websocket import router as ws_router
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS must be added BEFORE the exception handler so headers are present on all responses
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global handler — logs the real error and returns JSON with CORS headers intact
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception on %s %s\n%s",
            request.method,
            request.url.path,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    app.include_router(ws_router)

    @app.get("/health")
    async def health():
        return {"status": "healthy", "version": settings.VERSION}

    return app


app = create_app()
