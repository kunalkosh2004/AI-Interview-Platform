import json
import logging
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, interview_id: int):
        await websocket.accept()
        if interview_id not in self.active_connections:
            self.active_connections[interview_id] = []
        self.active_connections[interview_id].append(websocket)

    def disconnect(self, websocket: WebSocket, interview_id: int):
        if interview_id in self.active_connections:
            self.active_connections[interview_id] = [
                ws for ws in self.active_connections[interview_id] if ws != websocket
            ]
            if not self.active_connections[interview_id]:
                del self.active_connections[interview_id]

    async def broadcast(self, interview_id: int, message: dict):
        if interview_id in self.active_connections:
            for connection in self.active_connections[interview_id]:
                with suppress(Exception):
                    await connection.send_json(message)


manager = ConnectionManager()


def _verify_ws_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


@router.websocket("/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = int(payload["sub"])
    await manager.connect(websocket, interview_id)

    try:
        await manager.broadcast(
            interview_id,
            {
                "type": "user_joined",
                "user_id": user_id,
                "message": "User connected",
            },
        )

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "")

            if msg_type == "chat":
                await manager.broadcast(
                    interview_id,
                    {
                        "type": "chat",
                        "user_id": user_id,
                        "content": message.get("content", ""),
                        "role": message.get("role", "candidate"),
                    },
                )

            elif msg_type == "typing":
                await manager.broadcast(
                    interview_id,
                    {
                        "type": "typing",
                        "user_id": user_id,
                        "is_typing": message.get("is_typing", False),
                    },
                )

            elif msg_type == "proctoring_event":
                from app.core.database import async_session
                from app.models.coding import ProctoringEvent

                async with async_session() as session:
                    event = ProctoringEvent(
                        interview_id=interview_id,
                        event_type=message.get("event_type", ""),
                        severity=message.get("severity", "low"),
                        confidence=message.get("confidence", 0.0),
                        details=message.get("details"),
                        timestamp_seconds=message.get("timestamp_seconds", 0),
                    )
                    session.add(event)
                    await session.commit()

                await manager.broadcast(
                    interview_id,
                    {
                        "type": "proctoring_alert",
                        "event_type": message.get("event_type"),
                        "severity": message.get("severity"),
                    },
                )

            elif msg_type == "code_update":
                await manager.broadcast(
                    interview_id,
                    {
                        "type": "code_update",
                        "user_id": user_id,
                        "code": message.get("code", ""),
                        "language": message.get("language", ""),
                    },
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket, interview_id)
        await manager.broadcast(
            interview_id,
            {
                "type": "user_left",
                "user_id": user_id,
                "message": "User disconnected",
            },
        )
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, interview_id)
