"""
Generic per-key Redis rate limiter, reused across expensive/abuse-prone
endpoints (AI job creation, export, invite sending). Mirrors the hand-rolled
pattern already used for login attempts in routers/auth.py.
"""
from __future__ import annotations

from fastapi import HTTPException, status


async def enforce_rate_limit(key: str, max_calls: int, window_seconds: int) -> None:
    """
    Increment a Redis counter under `key` and raise 429 once it exceeds
    `max_calls` within `window_seconds`. Fails open (allows the request)
    if Redis is unavailable — this is a secondary defense, not the only
    thing standing between the app and abuse, so availability wins.
    """
    try:
        from app.core.redis import redis_client
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, window_seconds)
        if count > max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — please slow down and try again shortly.",
            )
    except HTTPException:
        raise
    except Exception:
        pass
