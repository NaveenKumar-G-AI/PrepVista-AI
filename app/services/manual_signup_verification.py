"""
PrepVista - Manual signup email verification
Sends short-lived verification codes over Gmail API and validates them before signup.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger("prepvista.manual_signup_verification")

VERIFICATION_CODE_LENGTH = 6
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
MAIL_REQUEST_TIMEOUT_SECONDS = 15.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def normalize_verification_code(code: str) -> str:
    cleaned = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(cleaned) != VERIFICATION_CODE_LENGTH:
        raise ValueError("Enter the 6-digit verification code sent to your email.")
    return cleaned


def _verification_code_hash(email: str, code: str) -> str:
    settings = get_settings()
    normalized_email = _normalize_email(email)
    secret = settings.SUPABASE_JWT_SECRET or settings.SUPABASE_SERVICE_KEY or "prepvista-email-code"
    payload = f"{normalized_email}:{code}:{secret}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(10 ** VERIFICATION_CODE_LENGTH):0{VERIFICATION_CODE_LENGTH}d}"


def _mail_from_email() -> str:
    settings = get_settings()
    return settings.GMAIL_API_FROM_EMAIL or settings.FROM_EMAIL


def _gmail_api_is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.GMAIL_API_CLIENT_ID
        and settings.GMAIL_API_CLIENT_SECRET
        and settings.GMAIL_API_REFRESH_TOKEN
        and _mail_from_email()
    )


def _email_delivery_is_configured() -> bool:
    settings = get_settings()
    return _gmail_api_is_configured() or bool(settings.RESEND_API_KEY)


def _email_not_configured_message() -> str:
    return (
        "Email delivery is not configured. Set either Gmail API credentials "
        "(GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET, GMAIL_API_REFRESH_TOKEN) "
        "or RESEND_API_KEY for verification email delivery."
    )


def _extract_gmail_api_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text.strip() or f"HTTP {response.status_code}"

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
            status = str(error.get("status") or "").strip()
            if message and status:
                return f"{status}: {message}"
            if message:
                return message
        elif isinstance(error, str):
            description = str(payload.get("error_description") or "").strip()
            if description:
                return f"{error}: {description}"
            return error

        message = str(payload.get("message") or "").strip()
        if message:
            return message

    return response.text.strip() or f"HTTP {response.status_code}"


def _gmail_api_access_token(client: httpx.Client) -> str:
    settings = get_settings()
    response = client.post(
        GMAIL_TOKEN_URL,
        data={
            "client_id": settings.GMAIL_API_CLIENT_ID,
            "client_secret": settings.GMAIL_API_CLIENT_SECRET,
            "refresh_token": settings.GMAIL_API_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    if response.status_code >= 400:
        detail = _extract_gmail_api_error(response)
        lowered_detail = detail.lower()
        if "invalid_grant" in lowered_detail:
            raise RuntimeError(
                "Gmail API refresh token is invalid or expired. Generate a new GMAIL_API_REFRESH_TOKEN."
            )
        if "invalid_client" in lowered_detail:
            raise RuntimeError(
                "Gmail API client credentials are invalid. Check GMAIL_API_CLIENT_ID and GMAIL_API_CLIENT_SECRET."
            )
        raise RuntimeError(f"Gmail API token request failed: {detail}")

    access_token = str(response.json().get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Gmail API token response did not include an access token.")
    return access_token


def _gmail_api_send_message(message: EmailMessage) -> None:
    if not _gmail_api_is_configured():
        raise RuntimeError(_email_not_configured_message())

    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    try:
        with httpx.Client(timeout=MAIL_REQUEST_TIMEOUT_SECONDS) as client:
            access_token = _gmail_api_access_token(client)
            response = client.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                json={"raw": raw_message},
            )

        if response.status_code >= 400:
            detail = _extract_gmail_api_error(response)
            if response.status_code in {401, 403}:
                raise RuntimeError(
                    "Gmail API rejected the send request. "
                    f"{detail}. Check Gmail API access, sender permissions, and OAuth scopes."
                )
            raise RuntimeError(f"Gmail API send failed: {detail}")
    except httpx.TimeoutException as exc:
        raise RuntimeError("Gmail API timed out. The backend could not reach Google's API in time.") from exc
    except httpx.NetworkError as exc:
        raise RuntimeError(
            "Gmail API is unreachable from the backend. Check outbound HTTPS access to googleapis.com."
        ) from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gmail API request failed: {exc}") from exc


def _deliver_message(message: EmailMessage) -> None:
    """Deliver email via Gmail API with automatic Resend fallback."""
    settings = get_settings()

    # Primary: Gmail API
    if _gmail_api_is_configured():
        try:
            _gmail_api_send_message(message)
            return
        except RuntimeError as exc:
            error_str = str(exc).lower()
            gmail_fatal = (
                "refresh token is invalid" in error_str
                or "invalid_grant" in error_str
                or "invalid_client" in error_str
            )
            if gmail_fatal:
                logger.error("gmail_api_fatal_falling_back_to_resend", error=str(exc))
            else:
                logger.warning("gmail_api_failed_falling_back_to_resend", error=str(exc))

    # Fallback: Resend API
    if settings.RESEND_API_KEY:
        try:
            import resend

            resend.api_key = settings.RESEND_API_KEY

            # Extract parts from EmailMessage
            to_addr = message["To"]
            subject = message["Subject"]

            # Get HTML body if available, otherwise text
            html_body = None
            text_body = None
            for part in message.walk():
                content_type = part.get_content_type()
                if content_type == "text/html":
                    html_body = part.get_content()
                elif content_type == "text/plain" and text_body is None:
                    text_body = part.get_content()

            send_params: dict = {
                "from": settings.FROM_EMAIL,
                "to": [to_addr],
                "subject": subject,
            }
            if html_body:
                send_params["html"] = html_body
            elif text_body:
                send_params["text"] = text_body

            resend.Emails.send(send_params)
            logger.info("verification_email_sent_via_resend", to=to_addr)
            return
        except Exception as resend_exc:
            logger.error("resend_fallback_also_failed", error=str(resend_exc))
            raise RuntimeError(
                "Both Gmail API and Resend email delivery failed. "
                "Unable to send verification code."
            ) from resend_exc

    raise RuntimeError(_email_not_configured_message())


def _send_verification_email_sync(recipient_email: str, verification_code: str) -> None:
    settings = get_settings()

    if not _email_delivery_is_configured():
        raise RuntimeError(_email_not_configured_message())

    subject = f"{settings.APP_NAME} verification code"
    text_body = (
        f"Your {settings.APP_NAME} verification code is {verification_code}.\n\n"
        f"This code expires in {settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES} minutes.\n"
        "If you did not request this code, you can ignore this email."
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0;">
          <div style="font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: #2563eb; font-weight: 700;">
            {settings.APP_NAME}
          </div>
          <h1 style="margin: 16px 0 12px; font-size: 28px; color: #0f172a;">Verify your email</h1>
          <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.7; color: #334155;">
            Use this verification code to complete your account signup.
          </p>
          <div style="margin: 0 0 20px; padding: 18px 20px; border-radius: 14px; background: #eff6ff; border: 1px solid #bfdbfe; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 0.18em; color: #1d4ed8;">
            {verification_code}
          </div>
          <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #475569;">
            This code expires in {settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES} minutes.
          </p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">
            If you did not request this code, you can ignore this email safely.
          </p>
        </div>
      </body>
    </html>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _mail_from_email()
    message["To"] = recipient_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    _deliver_message(message)


async def send_verification_email(recipient_email: str, verification_code: str) -> None:
    await asyncio.to_thread(_send_verification_email_sync, recipient_email, verification_code)


def _send_admin_new_user_notification_sync(
    admin_email: str,
    *,
    user_email: str,
    user_name: str,
    source: str,
) -> None:
    settings = get_settings()
    timestamp = _utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"{settings.APP_NAME} new user login: {user_email}"
    text_body = (
        f"A new user accessed {settings.APP_NAME}.\n\n"
        f"Name: {user_name or 'Not provided'}\n"
        f"Email: {user_email}\n"
        f"Source: {source}\n"
        f"Time: {timestamp}\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0;">
          <div style="font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: #2563eb; font-weight: 700;">
            {settings.APP_NAME}
          </div>
          <h1 style="margin: 16px 0 12px; font-size: 28px; color: #0f172a;">New user login</h1>
          <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.7; color: #334155;">
            A new user has been created and logged into the product.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 12px 0; color: #64748b; width: 120px;">Name</td>
              <td style="padding: 12px 0; font-weight: 600;">{user_name or 'Not provided'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 12px 0; color: #64748b;">Email</td>
              <td style="padding: 12px 0;">{user_email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 12px 0; color: #64748b;">Source</td>
              <td style="padding: 12px 0;">{source}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #64748b;">Time</td>
              <td style="padding: 12px 0;">{timestamp}</td>
            </tr>
          </table>
        </div>
      </body>
    </html>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _mail_from_email()
    message["To"] = admin_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    _deliver_message(message)


async def send_admin_new_user_notification(
    user_email: str,
    *,
    user_name: str = "",
    source: str = "manual_signup",
) -> bool:
    settings = get_settings()
    if not settings.ADMIN_EMAIL:
        logger.warning("admin_email_not_configured_for_new_user_notification")
        return False

    try:
        await asyncio.to_thread(
            _send_admin_new_user_notification_sync,
            settings.ADMIN_EMAIL,
            user_email=user_email,
            user_name=user_name,
            source=source,
        )
        logger.info("admin_new_user_notification_sent", user_email=user_email, source=source)
        return True
    except Exception as exc:
        logger.error("admin_new_user_notification_failed", user_email=user_email, source=source, error=str(exc))
        return False


async def issue_signup_verification_code(conn, email: str) -> dict:
    settings = get_settings()
    normalized_email = _normalize_email(email)
    now = _utcnow()
    row = await conn.fetchrow(
        """SELECT last_sent_at
           FROM manual_signup_verification_codes
           WHERE email_normalized = $1""",
        normalized_email,
    )

    if row and row["last_sent_at"]:
        last_sent_at = row["last_sent_at"]
        if last_sent_at.tzinfo is None:
            last_sent_at = last_sent_at.replace(tzinfo=timezone.utc)
        retry_after = int(settings.EMAIL_VERIFICATION_RESEND_SECONDS)
        elapsed = int((now - last_sent_at).total_seconds())
        remaining = max(0, retry_after - elapsed)
        if remaining > 0:
            raise ValueError(f"Please wait {remaining} seconds before requesting a new verification code.")

    verification_code = _generate_verification_code()
    expires_at = now + timedelta(minutes=int(settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES))
    await conn.execute(
        """INSERT INTO manual_signup_verification_codes (
               email_normalized, email, code_hash, expires_at, last_sent_at, failed_attempts, updated_at
           )
           VALUES ($1, $2, $3, $4, NOW(), 0, NOW())
           ON CONFLICT (email_normalized)
           DO UPDATE SET
               email = EXCLUDED.email,
               code_hash = EXCLUDED.code_hash,
               expires_at = EXCLUDED.expires_at,
               last_sent_at = NOW(),
               failed_attempts = 0,
               updated_at = NOW()""",
        normalized_email,
        email,
        _verification_code_hash(normalized_email, verification_code),
        expires_at,
    )

    try:
        await send_verification_email(email, verification_code)
    except Exception:
        await conn.execute(
            "DELETE FROM manual_signup_verification_codes WHERE email_normalized = $1",
            normalized_email,
        )
        raise
    logger.info("manual_signup_verification_sent", email=normalized_email)

    return {
        "expires_in_seconds": int(settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES) * 60,
    }


async def verify_signup_code(conn, email: str, verification_code: str) -> None:
    settings = get_settings()
    normalized_email = _normalize_email(email)
    normalized_code = normalize_verification_code(verification_code)
    row = await conn.fetchrow(
        """SELECT code_hash, expires_at, failed_attempts
           FROM manual_signup_verification_codes
           WHERE email_normalized = $1""",
        normalized_email,
    )

    if not row:
        raise ValueError("Request a verification code first.")

    expires_at = row["expires_at"]
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at <= _utcnow():
        await conn.execute(
            "DELETE FROM manual_signup_verification_codes WHERE email_normalized = $1",
            normalized_email,
        )
        raise ValueError("Your verification code expired. Request a new code.")

    expected_hash = _verification_code_hash(normalized_email, normalized_code)
    if hmac.compare_digest(row["code_hash"], expected_hash):
        return

    failed_attempts = int(row["failed_attempts"] or 0) + 1
    max_attempts = int(settings.EMAIL_VERIFICATION_MAX_ATTEMPTS)
    if failed_attempts >= max_attempts:
        await conn.execute(
            "DELETE FROM manual_signup_verification_codes WHERE email_normalized = $1",
            normalized_email,
        )
        raise ValueError("Too many incorrect attempts. Request a new verification code.")

    await conn.execute(
        """UPDATE manual_signup_verification_codes
           SET failed_attempts = $2,
               updated_at = NOW()
           WHERE email_normalized = $1""",
        normalized_email,
        failed_attempts,
    )
    remaining_attempts = max_attempts - failed_attempts
    raise ValueError(f"Incorrect verification code. {remaining_attempts} attempt(s) remaining.")


async def clear_signup_verification_code(conn, email: str) -> None:
    await conn.execute(
        "DELETE FROM manual_signup_verification_codes WHERE email_normalized = $1",
        _normalize_email(email),
    )
