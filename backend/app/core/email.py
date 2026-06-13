"""
Email service for lab invitations.
Uses SMTP — configure SMTP_* variables in .env
Falls back to printing the link to logs if SMTP is not configured (dev mode).
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def _build_invite_html(invite_url: str, admin_name: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f1923;font-family:Georgia,serif">
  <div style="max-width:520px;margin:40px auto;background:#1a2535;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0a1628,#0b3d2e);padding:40px;text-align:center">
      <div style="font-size:48px">🐠</div>
      <h1 style="color:#fff;font-size:24px;margin:12px 0 4px">MarineAnnotate</h1>
      <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0">Marine biology annotation platform</p>
    </div>
    <div style="padding:36px">
      <p style="color:#e8edf2;font-size:15px;line-height:1.6">
        <strong>{admin_name}</strong> has invited you to join the lab annotation platform.
      </p>
      <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6">
        Click the button below to set your password and access the platform. This link expires in <strong>48 hours</strong>.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="{invite_url}" style="background:#1D9E75;color:#fff;padding:14px 32px;border-radius:8px;
           text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
          Accept Invitation →
        </a>
      </div>
      <p style="color:rgba(255,255,255,0.35);font-size:12px;text-align:center">
        Or copy this link: <br/>
        <span style="color:#1D9E75;word-break:break-all">{invite_url}</span>
      </p>
    </div>
    <div style="padding:20px;border-top:1px solid rgba(255,255,255,0.08);text-align:center">
      <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0">
        If you didn't expect this invitation, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>
"""


async def send_invite_email(
    to_email: str,
    invite_url: str,
    admin_name: str,
) -> bool:
    """
    Send invitation email. Returns True on success.
    Falls back to console log if SMTP not configured.
    """
    if not settings.SMTP_HOST:
        # Dev fallback — print to logs
        print(f"\n{'='*60}")
        print(f"INVITE LINK (no SMTP configured — share manually):")
        print(f"To: {to_email}")
        print(f"URL: {invite_url}")
        print(f"{'='*60}\n")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"You've been invited to MarineAnnotate"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email

    html_part = MIMEText(_build_invite_html(invite_url, admin_name), "html")
    msg.attach(html_part)

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            if settings.SMTP_TLS:
                server.starttls(context=context)
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False
