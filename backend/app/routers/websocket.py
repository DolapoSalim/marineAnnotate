import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import get_current_user_id
from app.services.websocket import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: int, token: str) -> None:
    """
    Connect with: ws://host/ws/{project_id}?token=<jwt>
    Messages received are broadcast to all other users in the same project.
    """
    try:
        user_id = await get_current_user_id(token)  # type: ignore[arg-type]
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, project_id, user_id)
    try:
        # Announce presence
        await manager.broadcast_to_project(
            project_id,
            {"event": "user_joined", "data": {"user_id": user_id}},
            exclude_user=user_id,
        )
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
