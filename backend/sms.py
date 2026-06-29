"""Twilio SMS helper.

Sends SMS via Twilio's Messages API. OTPs are stored in MongoDB (see server.py).

Credentials live in /app/backend/.env:
    TWILIO_ACCOUNT_SID
    TWILIO_AUTH_TOKEN
    TWILIO_FROM_NUMBER  (E.164, e.g. +16625551234)

If credentials are missing or still the placeholder values, `send_sms` raises
SmsConfigError so callers can return a clear 503 to the client.
"""
import os
import re
import logging
from typing import Optional

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

logger = logging.getLogger(__name__)

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
PLACEHOLDER_VALUES = {
    "your_account_sid_here", "your_auth_token_here", "+15555555555", "", None,
}


class SmsConfigError(RuntimeError):
    """Raised when Twilio credentials are not configured."""


class SmsSendError(RuntimeError):
    """Raised when Twilio rejects the send."""


def _credentials() -> tuple[str, str, str]:
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    from_num = os.environ.get("TWILIO_FROM_NUMBER", "").strip()
    if sid in PLACEHOLDER_VALUES or token in PLACEHOLDER_VALUES or from_num in PLACEHOLDER_VALUES:
        raise SmsConfigError("Twilio credentials not configured")
    return sid, token, from_num


def is_configured() -> bool:
    try:
        _credentials()
        return True
    except SmsConfigError:
        return False


def valid_e164(phone: str) -> bool:
    return bool(E164_RE.match(phone or ""))


def send_sms(to: str, body: str) -> Optional[str]:
    """Send an SMS. Returns Twilio message SID on success."""
    sid, token, from_num = _credentials()
    if not valid_e164(to):
        raise SmsSendError("Phone number must be in E.164 format (e.g. +16625551234)")
    client = Client(sid, token)
    try:
        msg = client.messages.create(to=to, from_=from_num, body=body)
        logger.info("Twilio SMS sent sid=%s to=%s", msg.sid, to)
        return msg.sid
    except TwilioRestException as e:
        logger.warning("Twilio send failed: %s", e)
        raise SmsSendError(str(e.msg or e))
