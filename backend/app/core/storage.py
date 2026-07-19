import os
import uuid
from pathlib import Path

import aiofiles

from app.core.config import get_settings

settings = get_settings()


def _local_dir() -> Path:
    path = Path(settings.LOCAL_STORAGE_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_file(file_bytes: bytes, filename: str, folder: str = "resumes") -> str:
    if settings.STORAGE_BACKEND == "s3":
        return await _save_to_s3(file_bytes, filename, folder)
    return await _save_to_local(file_bytes, filename, folder)


async def delete_file(file_path: str) -> bool:
    if settings.STORAGE_BACKEND == "s3":
        return await _delete_from_s3(file_path)
    return await _delete_from_local(file_path)


async def _save_to_local(file_bytes: bytes, filename: str, folder: str) -> str:
    ext = Path(filename).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    base = _local_dir() / folder
    base.mkdir(parents=True, exist_ok=True)
    full_path = base / unique_name

    async with aiofiles.open(full_path, "wb") as f:
        await f.write(file_bytes)

    return str(full_path)


async def _delete_from_local(file_path: str) -> bool:
    try:
        p = Path(file_path)
        if p.exists():
            p.unlink()
            return True
    except OSError:
        pass
    return False


async def _save_to_s3(file_bytes: bytes, filename: str, folder: str) -> str:
    import boto3

    ext = Path(filename).suffix
    unique_name = f"{folder}/{uuid.uuid4().hex}{ext}"

    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )
    s3.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=unique_name,
        Body=file_bytes,
        ContentType="application/pdf",
    )
    return unique_name


async def _delete_from_s3(file_path: str) -> bool:
    import boto3

    try:
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        s3.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=file_path)
        return True
    except Exception:
        return False
