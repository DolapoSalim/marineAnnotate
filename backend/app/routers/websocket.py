"""
WebSocket router — Fix 5: token sent in first message, NOT in URL query string.
Tokens in query strings are logged by every proxy/CDN by default.
"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_current_user_id
from app.models import ProjectMember
from app.services.websocket import manager

router = APIRouter(tags=["websocket"])

WS_AUTH_TIMEOUT = 5.0  # seconds to send auth message before disconnect


async def _is_project_member(project_id: int, user_id: int) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: int) -> None:
    """
    Connect with: ws://host/ws/{project_id}
    First message MUST be: {"token": "<jwt>"}
    All subsequent messages are broadcast to other users in the project.
    """
    await websocket.accept()

    # Step 1 — Authenticate via first message (not URL)
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT)
        auth = json.loads(raw)
        user_id = await get_current_user_id(auth.get("token", ""))  # type: ignore[arg-type]
    except Exception:
        await websocket.close(code=4001)
        return

    # Step 2 — Only project members may join this room
    if not await _is_project_member(project_id, user_id):
        await websocket.close(code=4003)
        return

    # Step 3 — Register and announce
    manager.connect(websocket, project_id, user_id)
    try:
        await manager.broadcast_to_project(
            project_id,
            {"event": "user_joined", "data": {"user_id": user_id}},
            exclude_user=user_id,
        )

        # Step 3 — Main message loop
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg["user_id"] = user_id
                msg["project_id"] = project_id
                await manager.broadcast_to_project(project_id, msg, exclude_user=user_id)
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(project_id, user_id)
        await manager.broadcast_to_project(
            project_id,
            {"event": "user_left", "data": {"user_id": user_id}},
        )
