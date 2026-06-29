"""Backend tests for SMS / Twilio OTP flow.

Twilio credentials in /app/backend/.env are placeholders, so we exercise the
config-aware branches (503) AND insert OTP docs directly via motor to verify
the OTP verify happy path without real Twilio.
"""
import os
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Load EXPO_PUBLIC_BACKEND_URL
def _read_base_url() -> str:
    if os.environ.get("EXPO_PUBLIC_BACKEND_URL"):
        return os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")

BASE_URL = _read_base_url()
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

STUDENT = {"email": "student@olemiss.app", "password": "Student123!"}
ADMIN = {"email": "admin@olemiss.app", "password": "Admin123!"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT["email"], STUDENT["password"])  # full token response


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_id(student_token):
    return student_token["user"]["id"]


# Async helpers to manipulate phone_otps directly
async def _insert_otp(user_id, phone, code, used=False, expires_in=600):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "phone": phone,
        "code": code,
        "used": used,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    }
    await db.phone_otps.insert_one(doc)
    client.close()


async def _set_user_phone_verified(user_id, phone, verified):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.users.update_one({"id": user_id}, {"$set": {"phone": phone, "phone_verified": verified}})
    client.close()


async def _cleanup_otps(user_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.phone_otps.delete_many({"user_id": user_id})
    client.close()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if not asyncio.get_event_loop().is_running() else asyncio.new_event_loop().run_until_complete(coro)


# ---- /api/sms/status ----
class TestSmsStatus:
    def test_status_unconfigured(self):
        r = requests.get(f"{BASE_URL}/api/sms/status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "configured" in data
        assert data["configured"] is False  # placeholders -> false


# ---- /api/sms/otp/send ----
class TestOtpSend:
    def test_send_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/sms/otp/send", json={"phone": "+16625551234"}, timeout=10)
        assert r.status_code == 401

    def test_send_bad_e164(self, student_headers):
        r = requests.post(f"{BASE_URL}/api/sms/otp/send", json={"phone": "6625551234"}, headers=student_headers, timeout=10)
        assert r.status_code == 400
        assert "E.164" in r.text or "E.164" in r.json().get("detail", "")

    def test_send_valid_e164_placeholder_creds_503(self, student_headers, student_id):
        # Clean any recent OTPs to avoid rate limit
        asyncio.new_event_loop().run_until_complete(_cleanup_otps(student_id))
        r = requests.post(f"{BASE_URL}/api/sms/otp/send", json={"phone": "+16625559001"}, headers=student_headers, timeout=15)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text}"
        assert "not configured" in r.json().get("detail", "").lower()


# ---- /api/sms/otp/verify ----
class TestOtpVerify:
    def test_verify_wrong_code(self, student_headers, student_id):
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_cleanup_otps(student_id))
        loop.run_until_complete(_insert_otp(student_id, "+16625559101", "123456"))
        r = requests.post(f"{BASE_URL}/api/sms/otp/verify",
                          json={"phone": "+16625559101", "code": "999999"},
                          headers=student_headers, timeout=10)
        assert r.status_code == 400
        assert r.json().get("detail") == "Invalid code"

    def test_verify_expired(self, student_headers, student_id):
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_cleanup_otps(student_id))
        loop.run_until_complete(_insert_otp(student_id, "+16625559102", "555555", expires_in=-10))
        r = requests.post(f"{BASE_URL}/api/sms/otp/verify",
                          json={"phone": "+16625559102", "code": "555555"},
                          headers=student_headers, timeout=10)
        assert r.status_code == 400
        assert "expired" in r.json().get("detail", "").lower()

    def test_verify_success_then_replay_fails(self, student_headers, student_id):
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_cleanup_otps(student_id))
        loop.run_until_complete(_insert_otp(student_id, "+16625559103", "424242"))
        # 1st verify
        r1 = requests.post(f"{BASE_URL}/api/sms/otp/verify",
                           json={"phone": "+16625559103", "code": "424242"},
                           headers=student_headers, timeout=10)
        assert r1.status_code == 200, r1.text
        body = r1.json()
        # UserOut fields
        assert body["phone"] == "+16625559103"
        assert body["phone_verified"] is True
        assert "id" in body and "email" in body and "role" in body

        # 2nd verify same code (used flag now true)
        r2 = requests.post(f"{BASE_URL}/api/sms/otp/verify",
                           json={"phone": "+16625559103", "code": "424242"},
                           headers=student_headers, timeout=10)
        assert r2.status_code == 400
        assert r2.json().get("detail") == "Invalid code"

    def test_auth_me_includes_phone_fields(self, student_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=student_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "phone" in data
        assert "phone_verified" in data


# ---- /api/sms/test ----
class TestSmsTestEndpoint:
    def test_test_without_phone_verified(self, student_headers, student_id):
        # Make sure user is not verified
        asyncio.new_event_loop().run_until_complete(_set_user_phone_verified(student_id, None, False))
        r = requests.post(f"{BASE_URL}/api/sms/test", headers=student_headers, timeout=10)
        assert r.status_code == 400
        assert "verify" in r.json().get("detail", "").lower()

    def test_test_verified_user_placeholder_creds_503(self, student_headers, student_id):
        asyncio.new_event_loop().run_until_complete(_set_user_phone_verified(student_id, "+16625559199", True))
        r = requests.post(f"{BASE_URL}/api/sms/test", headers=student_headers, timeout=15)
        assert r.status_code == 503
        assert "not configured" in r.json().get("detail", "").lower()
        # cleanup: revert verified flag so other tests aren't affected
        asyncio.new_event_loop().run_until_complete(_set_user_phone_verified(student_id, None, False))
