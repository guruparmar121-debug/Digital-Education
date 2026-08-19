from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os, uuid, jwt, bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
ROLES = ["admin", "management", "coordinator", "teacher", "student"]


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if roles and user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


WRITE_ROLES = ("admin",)
READ_ROLES = ("admin", "management", "coordinator", "teacher")


def _strip_mongo_ids(obj):
    """Recursively remove non-serializable ObjectId '_id' keys from nested dicts/lists."""
    if isinstance(obj, dict):
        return {k: _strip_mongo_ids(v) for k, v in obj.items() if k != "_id"}
    if isinstance(obj, list):
        return [_strip_mongo_ids(x) for x in obj]
    return obj


async def audit(user: dict, action: str, entity: str, entity_id: str = "",
                old_value=None, new_value=None, note: str = ""):
    await db.audit_logs.insert_one({
        "id": new_id(), "action": action, "entity": entity, "entity_id": entity_id,
        "old_value": _strip_mongo_ids(old_value),
        "new_value": _strip_mongo_ids(new_value),
        "note": note,
        "user_id": user.get("id"), "user_name": user.get("name"),
        "user_email": user.get("email"), "created_at": now_iso(),
    })


async def current_year_id() -> str:
    y = await db.academic_years.find_one({"is_current": True}, {"_id": 0})
    if not y:
        y = await db.academic_years.find_one({}, {"_id": 0})
    return y["id"] if y else ""


async def scope_filter(user: dict, base: dict) -> dict:
    """Restrict queries by role scope."""
    f = dict(base)
    role = user.get("role")
    if role == "coordinator" and user.get("block_ids"):
        f["block_id"] = {"$in": user["block_ids"]}
    elif role == "teacher" and user.get("school_id"):
        f["school_id"] = user["school_id"]
    return f
