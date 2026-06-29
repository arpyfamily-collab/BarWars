import uuid, pytest

ADMIN = {"email": "admin@olemiss.app", "password": "Admin123!"}
STUDENT = {"email": "student@olemiss.app", "password": "Student123!"}

def _login(api_client, base_url, creds):
    r = api_client.post(f"{base_url}/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()

@pytest.fixture(scope="module")
def admin_token(base_url):
    import requests
    r = requests.post(f"{base_url}/api/auth/login", json=ADMIN)
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def student_token(base_url):
    import requests
    r = requests.post(f"{base_url}/api/auth/login", json=STUDENT)
    return r.json()["access_token"]

# AUTH
def test_admin_login(api_client, base_url):
    d = _login(api_client, base_url, ADMIN)
    assert "access_token" in d
    assert d["user"]["role"] == "bar_admin"

def test_student_login(api_client, base_url):
    d = _login(api_client, base_url, STUDENT)
    assert d["user"]["role"] == "user"
    assert d["user"]["age_verified"] is True

def test_register_new_user(api_client, base_url):
    email = f"test_{uuid.uuid4().hex[:8]}@olemiss.app"
    r = api_client.post(f"{base_url}/api/auth/register", json={"email": email, "password": "Test123!", "name": "Tester"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "user"

def test_auth_me(api_client, base_url, student_token):
    r = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == STUDENT["email"]

# BARS
def test_bars_seed(api_client, base_url):
    r = api_client.get(f"{base_url}/api/bars?lat=34.365&lon=-89.5384")
    assert r.status_code == 200
    bars = r.json()
    assert len(bars) >= 3
    names = " ".join(b["name"] for b in bars)
    for k in ["Library", "Funky", "Rooster"]:
        assert k in names
    assert all(b.get("distance_miles") is not None for b in bars)

# PROMOS
def test_promos_proximity(api_client, base_url):
    r = api_client.get(f"{base_url}/api/promos?lat=34.365&lon=-89.5384&radius_miles=5")
    assert r.status_code == 200
    promos = r.json()
    assert len(promos) >= 3
    assert all(p.get("distance_miles") is not None for p in promos)
    assert all(p["distance_miles"] <= 5 for p in promos)

def test_promos_filter_trivia(api_client, base_url):
    r = api_client.get(f"{base_url}/api/promos?event_type=trivia")
    assert r.status_code == 200
    promos = r.json()
    assert len(promos) >= 1
    assert all(p["event_type"] == "trivia" for p in promos)

# QR + REDEEM
def test_qr_and_redeem_flow(api_client, base_url, student_token):
    h = {"Authorization": f"Bearer {student_token}"}
    promos = api_client.get(f"{base_url}/api/promos").json()
    promo_id = promos[0]["id"]
    r = api_client.post(f"{base_url}/api/promos/{promo_id}/qr", headers=h)
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    # loyalty before
    before = api_client.get(f"{base_url}/api/users/me/loyalty", headers=h).json()["points"]
    r2 = api_client.post(f"{base_url}/api/qrcodes/{code}/redeem", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["points_earned"] == 25
    after = api_client.get(f"{base_url}/api/users/me/loyalty", headers=h).json()["points"]
    assert after == before + 25

# ADMIN ROLE
def test_create_promo_as_admin(api_client, base_url, admin_token):
    bars = api_client.get(f"{base_url}/api/bars").json()
    from datetime import datetime, timedelta, timezone
    start = datetime.now(timezone.utc)
    payload = {
        "bar_id": bars[0]["id"], "title": "TEST_Promo", "description": "test",
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=2)).isoformat(),
        "offers": [{"type":"drink","value":"$1 beer"}], "event_type":"happy_hour",
    }
    r = api_client.post(f"{base_url}/api/promos", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "TEST_Promo"

def test_create_promo_forbidden_for_user(api_client, base_url, student_token):
    bars = api_client.get(f"{base_url}/api/bars").json()
    from datetime import datetime, timedelta, timezone
    start = datetime.now(timezone.utc)
    payload = {
        "bar_id": bars[0]["id"], "title": "x", "description": "y",
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=2)).isoformat(),
        "offers": [], "event_type":"happy_hour",
    }
    r = api_client.post(f"{base_url}/api/promos", json=payload, headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 403

def test_analytics_requires_admin(api_client, base_url, student_token, admin_token):
    r = api_client.get(f"{base_url}/api/admin/analytics", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 403
    r2 = api_client.get(f"{base_url}/api/admin/analytics", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    for k in ["total_promos","active_promos","total_views","total_saves","total_redeems","total_users","opted_in_users","opt_in_rate"]:
        assert k in r2.json()

# USER PATCH + LOYALTY
def test_patch_user_preferences(api_client, base_url, student_token):
    h = {"Authorization": f"Bearer {student_token}"}
    payload = {"age_verified": True, "preferences": {"radius_miles": 3.5, "event_types": ["trivia"], "channels": ["push","sms"]}}
    r = api_client.patch(f"{base_url}/api/users/me", json=payload, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["preferences"]["radius_miles"] == 3.5
    assert "sms" in r.json()["preferences"]["channels"]

def test_loyalty_endpoint(api_client, base_url, student_token):
    r = api_client.get(f"{base_url}/api/users/me/loyalty", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200
    d = r.json()
    for k in ["points","tier","redemptions"]:
        assert k in d
