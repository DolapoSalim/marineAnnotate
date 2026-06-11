import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections grouped by project_id."""

    def __init__(self) -> None:
        # project_id -> {user_id: WebSocket}
        self._connections: dict[int, dict[int, WebSocket]] = defaultdict(dict)

    async def connect(self, websocket: WebSocket, project_id: int, user_id: int) -> None:
        await websocket.accept()
        self._connections[project_id][user_id] = websocket

    def disconnect(self, project_id: int, user_id: int) -> None:
        self._connections[project_id].pop(user_id, None)
        if not self._connections[project_id]:
            del self._connections[project_id]

    async def broadcast_to_project(
        self,
        project_id: int,
        message: dict[str, Any],
        exclude_user: int | None = None,
    ) -> None:
        conns = self._connections.get(project_id, {})
        dead: list[int] = []
        for uid, ws in conns.items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(project_id, uid)

    def get_active_users(self, project_id: int) -> list[int]:
        return list(self._connections.get(project_id, {}).keys())


manager = ConnectionManager()
