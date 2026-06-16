"""
PrepVista - Email validation helpers
Adds stricter deliverability checks for manual email flows.
"""

from __future__ import annotations

from email_validator import EmailNotValidError, validate_email

REAL_EMAIL_ERROR_MESSAGE = "This email looks fake. Please use a real email address."
TEMPORARY_EMAIL_ERROR_MESSAGE = "Temporary email addresses are not allowed. Please use a real email address."

COMMON_PROVIDER_DOMAIN_TYPOS = {
    "gamil.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.om": "gmail.com",
    "gmial.com": "gmail.com",
    "gmil.com": "gmail.com",
    "gnail.com": "gmail.com",
    "hotnail.com": "hotmail.com",
    "hotmai.com": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "iclod.com": "icloud.com",
    "icloud.co": "icloud.com",
    "outllok.com": "outlook.com",
    "outlok.com": "outlook.com",
    "outloo.com": "outlook.com",
    "yaho.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "yahoo.con": "yahoo.com",
    "yahho.com": "yahoo.com",
}

BLOCKED_EMAIL_DOMAINS = {
    "10minutemail.com",
    "dispostable.com",
    "emailondeck.com",
    "example.com",
    "example.net",
    "example.org",
    "fakeinbox.com",
    "getairmail.com",
    "getnada.com",
    "grr.la",
    "guerrillamail.com",
    "guerrillamailblock.com",
    "invalid",
    "maildrop.cc",
    "mailinator.com",
    "mintemail.com",
    "nada.email",
    "sharklasers.com",
    "temp-mail.org",
    "tempail.com",
    "tempmail.com",
    "throwawaymail.com",
    "trashmail.com",
    "yopmail.com",
}


def _extract_email_parts(normalized_email: str) -> tuple[str, str]:
    local_part, _, domain = normalized_email.rpartition("@")
    return local_part, domain.lower()


def _is_blocked_domain(domain: str) -> bool:
    return any(domain == blocked or domain.endswith(f".{blocked}") for blocked in BLOCKED_EMAIL_DOMAINS)


def _reject_known_fake_email_patterns(normalized_email: str) -> None:
    local_part, domain = _extract_email_parts(normalized_email)

    if _is_blocked_domain(domain):
        raise ValueError(TEMPORARY_EMAIL_ERROR_MESSAGE)

    suggested_domain = COMMON_PROVIDER_DOMAIN_TYPOS.get(domain)
    if suggested_domain:
        raise ValueError(
            f"{REAL_EMAIL_ERROR_MESSAGE} Did you mean {local_part}@{suggested_domain}?"
        )


def validate_deliverable_email_address(email: str, *, check_deliverability: bool = True) -> str:
    """Return the normalized email when the address syntax and domain are deliverable."""
    try:
        validated = validate_email(
            (email or "").strip(),
            check_deliverability=check_deliverability,
        )
    except EmailNotValidError as exc:
        raise ValueError(REAL_EMAIL_ERROR_MESSAGE) from exc

    normalized_email = validated.normalized
    _reject_known_fake_email_patterns(normalized_email)
    return normalized_email
