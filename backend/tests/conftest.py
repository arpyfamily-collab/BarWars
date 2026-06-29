import os, requests, pytest
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None

@pytest.fixture(scope="session")
def base_url():
    # Read from frontend .env if not set
    if not os.environ.get("EXPO_PUBLIC_BACKEND_URL"):
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=",1)[1].strip().rstrip("/")
    return BASE_URL

@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
