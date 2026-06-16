"""
PrepVista — Email Notification Service
Sends transactional emails via Resend API.
Primary use: admin payment notifications.
"""

import asyncio

import structlog
from datetime import datetime, timezone

from app.config import get_settings

logger = structlog.get_logger("prepvista.email")


async def send_admin_payment_notification(
    user_name: str,
    user_email: str,
    plan: str,
    amount_display: str,
    payment_status: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
) -> bool:
    """
    Send a payment notification email to the admin.
    Returns True if sent successfully, False otherwise.
    Non-blocking — failures are logged but don't affect the payment flow.
    """
    settings = get_settings()

    if not settings.ADMIN_EMAIL:
        logger.warning("admin_email_not_configured")
        return False

    if not settings.RESEND_API_KEY:
        logger.warning("resend_api_key_not_configured")
        return False

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    subject = f"💰 PrepVista Payment: {user_name} upgraded to {plan.title()}"

    html_body = f"""
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 20px;">New Payment Received</h1>
            <p style="margin: 4px 0 0; opacity: 0.9;">PrepVista — Payment Notification</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b; width: 160px;">User Name</td>
                <td style="padding: 12px 0; font-weight: 600;">{user_name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">User Email</td>
                <td style="padding: 12px 0;">{user_email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">Plan Purchased</td>
                <td style="padding: 12px 0; font-weight: 600; color: #2563eb;">{plan.title()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">Amount</td>
                <td style="padding: 12px 0; font-weight: 600;">{amount_display}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">Payment Status</td>
                <td style="padding: 12px 0;">
                    <span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 600;">
                        {payment_status.upper()}
                    </span>
                </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">Razorpay Order ID</td>
                <td style="padding: 12px 0; font-family: monospace; font-size: 13px;">{razorpay_order_id}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;">Razorpay Payment ID</td>
                <td style="padding: 12px 0; font-family: monospace; font-size: 13px;">{razorpay_payment_id}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0; color: #64748b;">Timestamp</td>
                <td style="padding: 12px 0;">{timestamp}</td>
            </tr>
        </table>

        <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #64748b;">
            This is an automated notification from PrepVista. You can verify this payment in your
            <a href="https://dashboard.razorpay.com/" style="color: #2563eb;">Razorpay Dashboard</a>.
        </div>
    </div>
    """

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY

        # Offload sync SDK call to threadpool to avoid blocking the event loop
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": settings.FROM_EMAIL,
                "to": [settings.ADMIN_EMAIL],
                "subject": subject,
                "html": html_body,
            },
        )

        logger.info("admin_payment_email_sent",
                     user_email=user_email, plan=plan, order_id=razorpay_order_id)
        return True

    except Exception as e:
        logger.error("admin_payment_email_error", error=str(e))
        return False


# ── User-facing notification emails ──────────────────────────

async def send_plan_expiry_warning(user_email: str, plan: str, days_remaining: int) -> bool:
    """Send pre-expiry warning email (e.g. 3 days before plan expires)."""
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        logger.warning("resend_not_configured_skipping_expiry_warning")
        return False

    subject = f"⏰ Your PrepVista {plan.title()} plan expires in {days_remaining} day{'s' if days_remaining != 1 else ''}"
    html_body = f"""
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 20px;">Plan Expiring Soon</h1>
            <p style="margin: 4px 0 0; opacity: 0.9;">Your {plan.title()} plan expires in {days_remaining} day{'s' if days_remaining != 1 else ''}</p>
        </div>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Your <strong>{plan.title()}</strong> plan is about to expire. After expiry, you'll lose access to:
        </p>
        <ul style="font-size: 15px; color: #334155; line-height: 1.8;">
            <li>{'Unlimited mock interviews' if plan == 'career' else '15 mock interviews per month'}</li>
            <li>Full evaluation reports with ideal answers</li>
            <li>Downloadable PDF reports</li>
            <li>Skill tracking and analytics</li>
        </ul>
        <div style="text-align: center; margin: 32px 0;">
            <a href="{settings.FRONTEND_URL or 'https://prepvista.in'}/pricing"
               style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Renew Your {plan.title()} Plan →
            </a>
        </div>
        <p style="font-size: 13px; color: #94a3b8; text-align: center;">
            Questions? Reply to this email or use the support chat in your dashboard.
        </p>
    </div>
    """

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": settings.FROM_EMAIL,
                "to": [user_email],
                "subject": subject,
                "html": html_body,
            },
        )
        logger.info("expiry_warning_email_sent", user_email=user_email, plan=plan, days_remaining=days_remaining)
        return True
    except Exception as e:
        logger.error("expiry_warning_email_error", error=str(e), user_email=user_email)
        return False


async def send_plan_expired_notification(user_email: str, plan: str) -> bool:
    """Send plan expired notification with renewal CTA."""
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        return False

    subject = f"Your PrepVista {plan.title()} plan has expired"
    html_body = f"""
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 20px;">{plan.title()} Plan Expired</h1>
            <p style="margin: 4px 0 0; opacity: 0.9;">Your premium features are now locked</p>
        </div>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Your <strong>{plan.title()}</strong> plan has expired. You've been moved to the Free plan
            with limited interviews and basic evaluation reports.
        </p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            All your past reports, analytics, and interview history are still safe — they'll be fully
            accessible again once you renew.
        </p>
        <div style="text-align: center; margin: 32px 0;">
            <a href="{settings.FRONTEND_URL or 'https://prepvista.in'}/pricing"
               style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Renew {plan.title()} — Pick Up Where You Left Off →
            </a>
        </div>
    </div>
    """

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": settings.FROM_EMAIL,
                "to": [user_email],
                "subject": subject,
                "html": html_body,
            },
        )
        logger.info("plan_expired_email_sent", user_email=user_email, plan=plan)
        return True
    except Exception as e:
        logger.error("plan_expired_email_error", error=str(e), user_email=user_email)
        return False


async def send_quota_low_warning(user_email: str, plan: str, used: int, limit: int) -> bool:
    """Send quota low warning when remaining interviews ≤ 2."""
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        return False

    remaining = max(0, limit - used)
    subject = f"⚠️ Only {remaining} interview{'s' if remaining != 1 else ''} left on your {plan.title()} plan"
    html_body = f"""
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 20px;">Interview Quota Running Low</h1>
            <p style="margin: 4px 0 0; opacity: 0.9;">{remaining} of {limit} interviews remaining this period</p>
        </div>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            You've used <strong>{used} of {limit}</strong> interviews on your <strong>{plan.title()}</strong> plan.
            {'Upgrade to Pro or Career for more interviews!' if plan == 'free' else 'Your quota resets at the start of your next billing period.'}
        </p>
        {'<div style="text-align: center; margin: 32px 0;"><a href="' + (settings.FRONTEND_URL or 'https://prepvista.in') + '/pricing" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Upgrade Your Plan →</a></div>' if plan == 'free' else ''}
    </div>
    """

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": settings.FROM_EMAIL,
                "to": [user_email],
                "subject": subject,
                "html": html_body,
            },
        )
        logger.info("quota_low_email_sent", user_email=user_email, plan=plan, used=used, limit=limit)
        return True
    except Exception as e:
        logger.error("quota_low_email_error", error=str(e), user_email=user_email)
        return False
