import uuid

from tests.conftest import ADMIN_PASSWORD, login


async def test_login_success(client, admin_user):
    r = await client.post(
        "/api/auth/token",
        data={"username": admin_user.email, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_wrong_password(client, admin_user):
    r = await client.post(
        "/api/auth/token",
        data={"username": admin_user.email, "password": "definitely-wrong"},
    )
    assert r.status_code == 401


async def test_login_nonexistent_user(client):
    r = await client.post(
        "/api/auth/token",
        data={"username": "nobody@test.local", "password": "whatever12345"},
    )
    assert r.status_code == 401


async def test_me_requires_token(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


async def test_me_returns_current_user(client, admin_user):
    token = await login(client, admin_user.email, ADMIN_PASSWORD)
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == admin_user.email


async def test_password_reset_invalidates_existing_sessions(client, admin_user):
    """
    Regression test for the token_version fix: resetting a password must
    kill every access token issued before the reset, not just let it expire
    naturally. Exercises the actual reset-password endpoint end-to-end,
    using a Redis-backed reset token the same way the real email flow does.
    """
    from app.routers.auth import _set_reset_token

    old_token = await login(client, admin_user.email, ADMIN_PASSWORD)

    me_before = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert me_before.status_code == 200

    reset_token = uuid.uuid4().hex
    await _set_reset_token(reset_token, admin_user.id)

    reset_resp = await client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "BrandNewPassword456"},
    )
    assert reset_resp.status_code == 200

    me_after = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert me_after.status_code == 401

    new_login = await client.post(
        "/api/auth/token",
        data={"username": admin_user.email, "password": "BrandNewPassword456"},
    )
    assert new_login.status_code == 200


async def test_reset_password_rejects_invalid_token(client, admin_user):
    r = await client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-real-token", "new_password": "SomePassword123"},
    )
    assert r.status_code == 400
