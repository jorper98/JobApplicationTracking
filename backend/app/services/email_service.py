"""Email delivery via SMTP, used for registration email verification."""
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings


def smtp_configured() -> bool:
    """SMTP is usable only when a host is set."""
    return bool(settings.SMTP_HOST)


def send_email(to: str, subject: str, html: str) -> None:
    """Send an HTML email through the configured SMTP server.

    Raises RuntimeError when SMTP is not configured, and lets smtplib
    exceptions propagate when delivery fails.
    """
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured")

    from_address = formataddr((settings.SMTP_FROM_NAME or "JobApplicationTracker", settings.SMTP_FROM or settings.SMTP_USER))

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_address
    message["To"] = to
    if settings.SMTP_BCC:
        message["Bcc"] = settings.SMTP_BCC
    message.set_content("This email requires an HTML-capable client.")
    message.add_alternative(html, subtype="html")

    if settings.SMTP_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            _authenticate(server)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_TLS:
                server.starttls()
            _authenticate(server)
            server.send_message(message)


def _authenticate(server: smtplib.SMTP) -> None:
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)


def verification_email_html(link: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
    <h2 style="margin-top: 0; color: #111827;">Verify your email</h2>
    <p style="color: #374151;">To avoid spammers and bad actors, we need to confirm this email is really yours. Please check your inbox (or spam folders) and click the link below to verify your account, then log in with your credentials.</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="{link}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email</a>
    </p>
    <p style="color: #6b7280; font-size: 13px;">If the button does not work, copy this link into your browser:<br/>{link}</p>
    <p style="color: #6b7280; font-size: 13px;">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
  </div>
</body>
</html>"""


def send_verification_email(to: str, token: str) -> None:
    base_url = (settings.FRONTEND_URL or "http://localhost:8137").rstrip("/")
    link = f"{base_url}/verify-email?token={token}"
    send_email(to, "Verify your email - JobApplicationTracker", verification_email_html(link))
