from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Auth config
JWT_SECRET = os.environ.get("JWT_SECRET", "ole-miss-promos-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for convenience
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Oxford, MS center (Ole Miss campus area)
OXFORD_CENTER = {"lat": 34.3650, "lon": -89.5384}

app = FastAPI(title="Ole Miss Proximity Promos API")
api_router = APIRouter(prefix="/api")


# =========================
# Pydantic Models
# =========================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Preferences(BaseModel):
    radius_miles: float = 2.5
    event_types: List[str] = Field(default_factory=lambda: ["trivia", "live_music", "happy_hour"])
    channels: List[str] = Field(default_factory=lambda: ["push"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    role: str
    age_verified: bool = False
    location_permission: bool = False
    opt_in_status: bool = False
    preferences: Preferences = Preferences()
    loyalty_points: int = 0


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    name: Optional[str] = None
    age_verified: Optional[bool] = None
    location_permission: Optional[bool] = None
    opt_in_status: Optional[bool] = None
    preferences: Optional[Preferences] = None


class BarCreate(BaseModel):
    name: str
    description: str = ""
    campus_area: str = "Oxford Square"
    lat: float
    lon: float
    image_url: Optional[str] = None
    rating: float = 4.5


class BarOut(BaseModel):
    id: str
    name: str
    description: str
    campus_area: str
    lat: float
    lon: float
    image_url: Optional[str] = None
    rating: float
    distance_miles: Optional[float] = None


class PromoOffer(BaseModel):
    type: str
    value: str


class PromoCreate(BaseModel):
    bar_id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    offers: List[PromoOffer] = Field(default_factory=list)
    max_recipients: int = 200
    radius_miles: float = 2.5
    event_type: str = "happy_hour"
    is_alcohol: bool = True
    image_url: Optional[str] = None


class PromoOut(BaseModel):
    id: str
    bar_id: str
    bar_name: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    offers: List[PromoOffer]
    max_recipients: int
    radius_miles: float
    event_type: str
    is_alcohol: bool
    image_url: Optional[str] = None
    status: str
    distance_miles: Optional[float] = None
    bar_lat: float
    bar_lon: float


class QROut(BaseModel):
    code: str
    promo_id: str
    user_id: str
    valid_until: datetime
    is_redeemed: bool


class RedeemRequest(BaseModel):
    code: str


class EngagementCreate(BaseModel):
    promo_id: str
    action: str  # view | save | click | redeem


# =========================
# Auth helpers
# =========================
def hash_password(pw: str) -> str:
    # bcrypt has a 72-byte limit; truncate gracefully
    return pwd_context.hash(pw[:72])


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(pw[:72], hashed)
    except Exception:
        return False


def create_access_token(sub: str, role: str) -> str:
    payload = {
        "sub": sub,
        "role": role,
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_to_out(doc: Dict[str, Any]) -> UserOut:
    prefs = doc.get("preferences") or {}
    return UserOut(
        id=doc["id"],
        email=doc["email"],
        name=doc.get("name"),
        role=doc.get("role", "user"),
        age_verified=doc.get("age_verified", False),
        location_permission=doc.get("location_permission", False),
        opt_in_status=doc.get("opt_in_status", False),
        preferences=Preferences(**prefs) if prefs else Preferences(),
        loyalty_points=doc.get("loyalty_points", 0),
    )


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "bar_admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def promo_status(p: Dict[str, Any]) -> str:
    if p.get("status") == "paused":
        return "paused"
    end = p.get("end_time")
    if isinstance(end, datetime):
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end < now_utc():
            return "completed"
    return "active"


async def audit(action: str, actor_id: str, target_id: str = "", details: Optional[dict] = None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "actor_id": actor_id,
        "target_id": target_id,
        "timestamp": now_utc(),
        "details": details or {},
    })


# =========================
# AUTH ROUTES
# =========================
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": data.email.lower(),
        "name": data.name or data.email.split("@")[0],
        "hashed_password": hash_password(data.password),
        "role": "user",
        "age_verified": False,
        "location_permission": False,
        "opt_in_status": False,
        "preferences": Preferences().dict(),
        "loyalty_points": 0,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    await audit("user.register", user_id, user_id)
    token = create_access_token(user_id, "user")
    return TokenResponse(access_token=token, user=user_to_out(doc))


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], user.get("role", "user"))
    await audit("user.login", user["id"], user["id"])
    return TokenResponse(access_token=token, user=user_to_out(user))


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return user_to_out(user)


# =========================
# USER ROUTES
# =========================
@api_router.patch("/users/me", response_model=UserOut)
async def update_me(update: UserUpdate, user: Dict[str, Any] = Depends(get_current_user)):
    payload = {k: v for k, v in update.dict(exclude_unset=True).items() if v is not None}
    if "preferences" in payload and isinstance(payload["preferences"], dict) is False:
        payload["preferences"] = payload["preferences"].dict()
    if "preferences" in payload and hasattr(payload["preferences"], "dict"):
        payload["preferences"] = payload["preferences"].dict()
    # Handle Preferences object
    if "preferences" in payload and not isinstance(payload["preferences"], dict):
        payload["preferences"] = dict(payload["preferences"])
    if payload:
        await db.users.update_one({"id": user["id"]}, {"$set": payload})
        await audit("user.update", user["id"], user["id"], payload if "password" not in payload else {})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_out(updated)


@api_router.post("/users/me/opt-in", response_model=UserOut)
async def opt_in(user: Dict[str, Any] = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"opt_in_status": True, "location_permission": True}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    await audit("user.opt_in", user["id"], user["id"])
    return user_to_out(updated)


@api_router.get("/users/me/loyalty")
async def loyalty(user: Dict[str, Any] = Depends(get_current_user)):
    redemptions = await db.engagements.count_documents({"user_id": user["id"], "action": "redeem"})
    return {
        "points": user.get("loyalty_points", 0),
        "redemptions": redemptions,
        "tier": "Gold" if user.get("loyalty_points", 0) >= 200 else ("Silver" if user.get("loyalty_points", 0) >= 100 else "Bronze"),
    }


@api_router.post("/users/me/loyalty/redeem")
async def redeem_loyalty(user: Dict[str, Any] = Depends(get_current_user)):
    if user.get("loyalty_points", 0) < 100:
        raise HTTPException(status_code=400, detail="Need at least 100 points to redeem")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": -100}})
    await audit("loyalty.redeem", user["id"], user["id"], {"points": 100})
    return {"ok": True, "reward": "Free drink at any partner bar"}


# =========================
# BAR ROUTES
# =========================
@api_router.get("/bars", response_model=List[BarOut])
async def list_bars(lat: Optional[float] = None, lon: Optional[float] = None):
    cursor = db.bars.find({}, {"_id": 0})
    bars = await cursor.to_list(500)
    out = []
    for b in bars:
        dist = None
        if lat is not None and lon is not None:
            dist = round(haversine_miles(lat, lon, b["lat"], b["lon"]), 2)
        out.append(BarOut(
            id=b["id"], name=b["name"], description=b.get("description", ""),
            campus_area=b.get("campus_area", ""), lat=b["lat"], lon=b["lon"],
            image_url=b.get("image_url"), rating=b.get("rating", 4.5),
            distance_miles=dist,
        ))
    out.sort(key=lambda x: x.distance_miles if x.distance_miles is not None else 0)
    return out


@api_router.get("/bars/{bar_id}", response_model=BarOut)
async def get_bar(bar_id: str):
    b = await db.bars.find_one({"id": bar_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bar not found")
    return BarOut(**{k: b.get(k) for k in ["id", "name", "description", "campus_area", "lat", "lon", "image_url", "rating"]})


# =========================
# PROMO ROUTES
# =========================
def serialize_promo(p: Dict[str, Any], bar: Dict[str, Any], user_lat: Optional[float] = None, user_lon: Optional[float] = None) -> PromoOut:
    dist = None
    if user_lat is not None and user_lon is not None:
        dist = round(haversine_miles(user_lat, user_lon, bar["lat"], bar["lon"]), 2)
    return PromoOut(
        id=p["id"],
        bar_id=p["bar_id"],
        bar_name=bar.get("name", "Unknown"),
        title=p["title"],
        description=p["description"],
        start_time=p["start_time"],
        end_time=p["end_time"],
        offers=[PromoOffer(**o) for o in p.get("offers", [])],
        max_recipients=p.get("max_recipients", 200),
        radius_miles=p.get("radius_miles", 2.5),
        event_type=p.get("event_type", "happy_hour"),
        is_alcohol=p.get("is_alcohol", True),
        image_url=p.get("image_url"),
        status=promo_status(p),
        distance_miles=dist,
        bar_lat=bar["lat"],
        bar_lon=bar["lon"],
    )


@api_router.get("/promos", response_model=List[PromoOut])
async def list_promos(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_miles: Optional[float] = None,
    event_type: Optional[str] = None,
    bar_id: Optional[str] = None,
):
    q: Dict[str, Any] = {}
    if event_type and event_type != "all":
        q["event_type"] = event_type
    if bar_id:
        q["bar_id"] = bar_id
    promos = await db.promos.find(q, {"_id": 0}).to_list(500)
    bars = {b["id"]: b for b in await db.bars.find({}, {"_id": 0}).to_list(500)}
    out = []
    for p in promos:
        bar = bars.get(p["bar_id"])
        if not bar:
            continue
        sp = serialize_promo(p, bar, lat, lon)
        if radius_miles is not None and sp.distance_miles is not None and sp.distance_miles > radius_miles:
            continue
        out.append(sp)
    out.sort(key=lambda x: (x.distance_miles if x.distance_miles is not None else 999, x.start_time))
    return out


@api_router.get("/promos/{promo_id}", response_model=PromoOut)
async def get_promo(promo_id: str, lat: Optional[float] = None, lon: Optional[float] = None):
    p = await db.promos.find_one({"id": promo_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Promo not found")
    bar = await db.bars.find_one({"id": p["bar_id"]}, {"_id": 0})
    return serialize_promo(p, bar, lat, lon)


@api_router.post("/promos", response_model=PromoOut)
async def create_promo(data: PromoCreate, admin: Dict[str, Any] = Depends(require_admin)):
    bar = await db.bars.find_one({"id": data.bar_id}, {"_id": 0})
    if not bar:
        raise HTTPException(404, "Bar not found")
    if data.end_time <= data.start_time:
        raise HTTPException(400, "End time must be after start time")
    promo_id = str(uuid.uuid4())
    doc = {
        "id": promo_id,
        "bar_id": data.bar_id,
        "title": data.title,
        "description": data.description,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "offers": [o.dict() for o in data.offers],
        "max_recipients": data.max_recipients,
        "radius_miles": data.radius_miles,
        "event_type": data.event_type,
        "is_alcohol": data.is_alcohol,
        "image_url": data.image_url,
        "status": "active",
        "created_by": admin["id"],
        "created_at": now_utc(),
    }
    await db.promos.insert_one(doc)
    await audit("promo.create", admin["id"], promo_id, {"title": data.title})
    return serialize_promo(doc, bar)


# =========================
# QR + REDEMPTION
# =========================
@api_router.post("/promos/{promo_id}/qr", response_model=QROut)
async def generate_qr(promo_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    promo = await db.promos.find_one({"id": promo_id}, {"_id": 0})
    if not promo:
        raise HTTPException(404, "Promo not found")
    if promo.get("is_alcohol", True) and not user.get("age_verified", False):
        raise HTTPException(403, "Age verification required for alcohol offers")
    # Reuse existing non-redeemed QR if present
    existing = await db.qrcodes.find_one(
        {"promo_id": promo_id, "user_id": user["id"], "is_redeemed": False},
        {"_id": 0},
    )
    if existing:
        vu = existing["valid_until"]
        if vu.tzinfo is None:
            vu = vu.replace(tzinfo=timezone.utc)
        if vu > now_utc():
            existing["valid_until"] = vu
            return QROut(**existing)
    code = uuid.uuid4().hex[:12].upper()
    doc = {
        "code": code,
        "promo_id": promo_id,
        "user_id": user["id"],
        "valid_until": now_utc() + timedelta(hours=2),
        "is_redeemed": False,
        "created_at": now_utc(),
    }
    await db.qrcodes.insert_one(doc)
    # Log save engagement
    await db.engagements.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "promo_id": promo_id,
        "action": "save",
        "timestamp": now_utc(),
    })
    return QROut(**{k: doc[k] for k in ["code", "promo_id", "user_id", "valid_until", "is_redeemed"]})


@api_router.get("/qrcodes/{code}", response_model=QROut)
async def get_qr(code: str, user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.qrcodes.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "QR not found")
    return QROut(**{k: doc[k] for k in ["code", "promo_id", "user_id", "valid_until", "is_redeemed"]})


@api_router.post("/qrcodes/{code}/redeem")
async def redeem_qr(code: str, user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.qrcodes.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "QR not found")
    if doc["is_redeemed"]:
        raise HTTPException(400, "Already redeemed")
    vu = doc["valid_until"]
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    if vu < now_utc():
        raise HTTPException(400, "QR expired")
    await db.qrcodes.update_one({"code": code}, {"$set": {"is_redeemed": True, "redeemed_at": now_utc()}})
    await db.engagements.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": doc["user_id"],
        "promo_id": doc["promo_id"],
        "action": "redeem",
        "timestamp": now_utc(),
    })
    await db.users.update_one({"id": doc["user_id"]}, {"$inc": {"loyalty_points": 25}})
    await audit("qr.redeem", user["id"], code)
    return {"ok": True, "points_earned": 25}


# =========================
# ENGAGEMENTS
# =========================
@api_router.post("/engagements")
async def log_engagement(data: EngagementCreate, user: Dict[str, Any] = Depends(get_current_user)):
    await db.engagements.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "promo_id": data.promo_id,
        "action": data.action,
        "timestamp": now_utc(),
    })
    if data.action == "view":
        await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": 1}})
    elif data.action == "save":
        await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": 5}})
    return {"ok": True}


# =========================
# ADMIN ANALYTICS
# =========================
@api_router.get("/admin/analytics")
async def analytics(admin: Dict[str, Any] = Depends(require_admin)):
    total_promos = await db.promos.count_documents({})
    active_promos = 0
    cursor = db.promos.find({}, {"_id": 0})
    async for p in cursor:
        if promo_status(p) == "active":
            active_promos += 1
    total_views = await db.engagements.count_documents({"action": "view"})
    total_saves = await db.engagements.count_documents({"action": "save"})
    total_redeems = await db.engagements.count_documents({"action": "redeem"})
    total_users = await db.users.count_documents({"role": "user"})
    opted_in_users = await db.users.count_documents({"opt_in_status": True})
    return {
        "total_promos": total_promos,
        "active_promos": active_promos,
        "total_views": total_views,
        "total_saves": total_saves,
        "total_redeems": total_redeems,
        "total_users": total_users,
        "opted_in_users": opted_in_users,
        "opt_in_rate": round(opted_in_users / total_users * 100, 1) if total_users else 0,
    }


@api_router.get("/admin/promos")
async def admin_promo_list(admin: Dict[str, Any] = Depends(require_admin)):
    promos = await db.promos.find({}, {"_id": 0}).to_list(500)
    bars = {b["id"]: b for b in await db.bars.find({}, {"_id": 0}).to_list(500)}
    out = []
    for p in promos:
        redeems = await db.engagements.count_documents({"promo_id": p["id"], "action": "redeem"})
        views = await db.engagements.count_documents({"promo_id": p["id"], "action": "view"})
        out.append({
            "id": p["id"],
            "title": p["title"],
            "bar_name": bars.get(p["bar_id"], {}).get("name", ""),
            "status": promo_status(p),
            "start_time": p["start_time"],
            "end_time": p["end_time"],
            "redeems": redeems,
            "views": views,
        })
    return out


# =========================
# PRIVACY
# =========================
@api_router.get("/privacy/me")
async def privacy_get(user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "user_id": user["id"],
        "data_retention_days": user.get("data_retention_days", 90),
        "sharing_preferences": user.get("sharing_preferences", {"analytics": True, "third_party": False}),
        "age_verification_status": user.get("age_verified", False),
        "opt_in_status": user.get("opt_in_status", False),
    }


@api_router.post("/privacy/me/export")
async def privacy_export(user: Dict[str, Any] = Depends(get_current_user)):
    engagements = await db.engagements.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    qrs = await db.qrcodes.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    return {
        "user": user_to_out(user).dict(),
        "engagements": engagements,
        "qrcodes": qrs,
        "exported_at": now_utc(),
    }


@api_router.delete("/privacy/me")
async def privacy_delete(user: Dict[str, Any] = Depends(get_current_user)):
    if user.get("role") == "bar_admin":
        raise HTTPException(400, "Admin accounts cannot be deleted via this endpoint")
    await db.users.delete_one({"id": user["id"]})
    await db.engagements.delete_many({"user_id": user["id"]})
    await db.qrcodes.delete_many({"user_id": user["id"]})
    await audit("user.delete", user["id"], user["id"])
    return {"ok": True}


# =========================
# Root
# =========================
@api_router.get("/")
async def root():
    return {"service": "Ole Miss Proximity Promos API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# =========================
# Seeding
# =========================
SEED_BARS = [
    {
        "name": "The Library Sports Bar",
        "description": "Iconic Ole Miss hangout with cold beer, pub grub, and game-day energy.",
        "campus_area": "Oxford Square",
        "lat": 34.3661, "lon": -89.5345,
        "image_url": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800",
        "rating": 4.6,
    },
    {
        "name": "Funky's Pizza & Daiquiri Bar",
        "description": "Slices, frozen daiquiris, and a rooftop view of the Square.",
        "campus_area": "Oxford Square",
        "lat": 34.3655, "lon": -89.5360,
        "image_url": "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800",
        "rating": 4.4,
    },
    {
        "name": "Rooster's Blues House",
        "description": "Live blues, smoky vibes, and the best wings near the Grove.",
        "campus_area": "Oxford Square",
        "lat": 34.3648, "lon": -89.5398,
        "image_url": "https://images.unsplash.com/photo-1571266028243-d220c6a52b7d?w=800",
        "rating": 4.7,
    },
]


async def seed_data():
    # Admin
    admin_email = "admin@olemiss.app"
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id,
            "email": admin_email,
            "name": "Bar Admin",
            "hashed_password": hash_password("Admin123!"),
            "role": "bar_admin",
            "age_verified": True,
            "location_permission": True,
            "opt_in_status": True,
            "preferences": Preferences().dict(),
            "loyalty_points": 0,
            "created_at": now_utc(),
        })
        logger.info("Seeded admin user")

    # Demo user
    demo_email = "student@olemiss.app"
    demo = await db.users.find_one({"email": demo_email})
    if not demo:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": demo_email,
            "name": "Student Rebel",
            "hashed_password": hash_password("Student123!"),
            "role": "user",
            "age_verified": True,
            "location_permission": True,
            "opt_in_status": True,
            "preferences": Preferences().dict(),
            "loyalty_points": 75,
            "created_at": now_utc(),
        })

    # Bars
    existing_count = await db.bars.count_documents({})
    if existing_count == 0:
        for b in SEED_BARS:
            await db.bars.insert_one({"id": str(uuid.uuid4()), **b})
        logger.info("Seeded bars")

    # Promos
    promos_count = await db.promos.count_documents({})
    if promos_count == 0:
        bars = await db.bars.find({}, {"_id": 0}).to_list(10)
        now = now_utc()
        samples = [
            {
                "bar_idx": 0,
                "title": "Trivia Night Happy Hour",
                "description": "2-for-1 craft beer during trivia. Win a Library swag pack.",
                "start_time": now - timedelta(hours=1),
                "end_time": now + timedelta(hours=5),
                "event_type": "trivia",
                "offers": [{"type": "drink", "value": "2-for-1 craft beer"}],
                "image_url": "https://images.unsplash.com/photo-1546726747-421c6d69c929?w=800",
            },
            {
                "bar_idx": 1,
                "title": "Daiquiri Friday",
                "description": "$5 frozen daiquiris all night. DJ sets after 10pm.",
                "start_time": now,
                "end_time": now + timedelta(hours=8),
                "event_type": "happy_hour",
                "offers": [{"type": "drink", "value": "$5 daiquiris"}],
                "image_url": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800",
            },
            {
                "bar_idx": 2,
                "title": "Live Blues + Wings Combo",
                "description": "Live blues 9pm-1am. $10 wings & beer combo.",
                "start_time": now,
                "end_time": now + timedelta(hours=6),
                "event_type": "live_music",
                "offers": [{"type": "combo", "value": "$10 wings + beer"}],
                "image_url": "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=800",
            },
            {
                "bar_idx": 0,
                "title": "Sunday Game Day Special",
                "description": "Pitchers $8 during all SEC games. Free chips & salsa.",
                "start_time": now + timedelta(days=1),
                "end_time": now + timedelta(days=1, hours=8),
                "event_type": "happy_hour",
                "offers": [{"type": "drink", "value": "$8 pitchers"}],
                "image_url": "https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800",
            },
        ]
        for s in samples:
            bar = bars[s["bar_idx"]]
            await db.promos.insert_one({
                "id": str(uuid.uuid4()),
                "bar_id": bar["id"],
                "title": s["title"],
                "description": s["description"],
                "start_time": s["start_time"],
                "end_time": s["end_time"],
                "offers": s["offers"],
                "max_recipients": 200,
                "radius_miles": 3.0,
                "event_type": s["event_type"],
                "is_alcohol": True,
                "image_url": s["image_url"],
                "status": "active",
                "created_by": "seed",
                "created_at": now_utc(),
            })
        logger.info("Seeded promos")


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
