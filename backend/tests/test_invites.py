import pytest

from app.routers.invites import _is_local_app_url
from tests.conftest import ADMIN_PASSWORD, login


@pytest.mark.parametrize("url,expected", [
    ("http://localhost:5173", True),
    ("http://127.0.0.1:5173", True),
    ("http://192.168.1.50:5173", True),
    ("http://10.0.0.5", True),
    ("https://lab.example.org", False),
    ("https://abs-significance-divx-lawrence.trycloudflare.com", False),
])
def test_is_local_app_url(monkeypatch, url, expected):
    from app.core.config import settings
    monkeypatch.setattr(settings, "APP_URL", url)
    assert _is_local_app_url() is expected


async def test_invite_response_includes_link_and_local_warning(client, admin_user, monkeypatch):
    """
    Regression test for the invite-link fiasco: an admin sending an invite
    while APP_URL is still the local default must see both the actual link
    that was emailed and a clear warning that it won't work for anyone off
    this machine — not discover it only when the recipient reports back.
    """
    from app.core.config import settings
    monkeypatch.setattr(settings, "APP_URL", "http://localhost:5173")

    token = await login(client, admin_user.email, ADMIN_PASSWORD)
    r = await client.post(
        "/api/invites/send",
        # NOT "@test.local" — email-validator (Pydantic's EmailStr backend)
        # rejects .local as a reserved/special-use TLD. This is the only
        # test in the suite that actually sends an email through EmailStr
        # validation; every other test creates users directly via the ORM,
        # bypassing it, which is why ".local" elsewhere never tripped this.
        json={"email": "newmember@marinelab-test.io", "full_name": "New Member", "role": "annotator"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["invite_url"].startswith("http://localhost:5173/accept-invite?token=")
    assert body["app_url_is_local"] is True


async def test_invite_response_no_warning_for_public_url(client, admin_user, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "APP_URL", "https://lab.example.org")

    token = await login(client, admin_user.email, ADMIN_PASSWORD)
    r = await client.post(
        "/api/invites/send",
        json={"email": "anothermember@marinelab-test.io", "full_name": "Another Member", "role": "annotator"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["app_url_is_local"] is False
