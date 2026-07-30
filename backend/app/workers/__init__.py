from app.workers.celery_app import celery_app, generate_report_task, parse_resume_task

__all__ = ["celery_app", "generate_report_task", "parse_resume_task"]
