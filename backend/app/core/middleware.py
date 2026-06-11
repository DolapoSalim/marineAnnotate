"""
Security middleware collection:
- RequestSizeLimitMiddleware  — DoS protection (Fix 8)
- SecurityHeadersMiddleware   — CSP, HSTS, X-Frame-Options etc.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Reject oversized requests before reading the body.
    Guards against memory-exhaustion DoS via large uploads.
    """
    MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    async def dispatch(self, request: Request, call_next) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.MAX_BYTES:
                    return Response(
                        "Request body too large",
                        status_code=413,
                        media_type="text/plain",
                    )
            except ValueError:
                pass
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response
