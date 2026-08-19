from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core import db, new_id, now_iso, audit, get_current_user, require_roles, READ_ROLES, _strip_mongo_ids

router = APIRouter()

MASTERS = {
    "academic-years": ("academic_years", ["year", "start_date", "end_date", "status", "is_current"]),
    "blocks": ("blocks", ["block_code", "name", "district", "status"]),
    "villages": ("villages", ["village_code", "name", "block_id", "district", "status"]),
    "schools": ("schools", ["school_code", "name", "block_id", "village_id", "address",
                            "principal_name", "contact", "status", "academic_year_id"]),
    "teachers": ("teachers", ["staff_code", "name", "mobile", "email", "role", "school_id",
                              "block_id", "village_id", "standards", "status"]),
}


def coll_for(entity: str):
    if entity not in MASTERS:
        raise HTTPException(status_code=404, detail="Unknown entity")
    return MASTERS[entity][0]


@router.get("/masters/{entity}")
async def list_master(entity: str, search: str = "", block_id: str = "", village_id: str = "",
                      status: str = "", user: dict = Depends(get_current_user)):
    coll = coll_for(entity)
    q = {}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"year": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}}]
    if block_id:
        q["block_id"] = block_id
    if village_id:
        q["village_id"] = village_id
    if status:
        q["status"] = status
    if user.get("role") == "coordinator" and user.get("block_ids") and entity in ("villages", "schools", "teachers"):
        q["block_id"] = {"$in": user["block_ids"]}
    items = await db[coll].find(q, {"_id": 0}).sort("name" if entity != "academic-years" else "year", 1).to_list(5000)
    return items


@router.post("/masters/{entity}")
async def create_master(entity: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    coll = coll_for(entity)
    doc = {k: v for k, v in payload.items() if k != "id"}
    doc["id"] = new_id()
    doc.setdefault("status", "active")
    doc["created_at"] = now_iso()
    if entity == "academic-years":
        if await db.academic_years.find_one({"year": doc.get("year")}):
            raise HTTPException(status_code=400, detail="Academic year already exists")
        if doc.get("is_current"):
            await db.academic_years.update_many({}, {"$set": {"is_current": False}})
        doc.setdefault("is_current", False)
    await db[coll].insert_one(doc)
    await audit(user, "create", entity, doc["id"], None, doc)
    doc.pop("_id", None)
    return doc


@router.put("/masters/{entity}/{item_id}")
async def update_master(entity: str, item_id: str, payload: dict,
                        user: dict = Depends(require_roles("admin"))):
    coll = coll_for(entity)
    old = await db[coll].find_one({"id": item_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    upd = {k: v for k, v in payload.items() if k not in ("id", "_id")}
    if entity == "academic-years" and upd.get("is_current"):
        await db.academic_years.update_many({}, {"$set": {"is_current": False}})
    upd["updated_at"] = now_iso()
    await db[coll].update_one({"id": item_id}, {"$set": upd})
    await audit(user, "update", entity, item_id, old, upd)
    return await db[coll].find_one({"id": item_id}, {"_id": 0})


@router.delete("/masters/{entity}/{item_id}")
async def deactivate_master(entity: str, item_id: str, user: dict = Depends(require_roles("admin"))):
    coll = coll_for(entity)
    old = await db[coll].find_one({"id": item_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    await db[coll].update_one({"id": item_id}, {"$set": {"status": "inactive"}})
    await audit(user, "deactivate", entity, item_id, old, {"status": "inactive"})
    return {"ok": True}


@router.post("/masters/academic-years/{item_id}/set-current")
async def set_current_year(item_id: str, user: dict = Depends(require_roles("admin"))):
    y = await db.academic_years.find_one({"id": item_id}, {"_id": 0})
    if not y:
        raise HTTPException(status_code=404, detail="Not found")
    await db.academic_years.update_many({}, {"$set": {"is_current": False}})
    await db.academic_years.update_one({"id": item_id}, {"$set": {"is_current": True, "status": "active"}})
    await audit(user, "set_current", "academic-years", item_id, None, {"is_current": True})
    return {"ok": True}


@router.get("/audit-logs")
async def audit_logs(limit: int = 200, entity: str = "", user: dict = Depends(require_roles("admin", "management"))):
    q = {"entity": entity} if entity else {}
    logs = await db.audit_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_strip_mongo_ids(l) for l in logs]


class UserIn(BaseModel):
    name: str
    email: str
    password: Optional[str] = None
    role: str
    school_id: Optional[str] = None
    block_ids: Optional[List[str]] = None
    student_code: Optional[str] = None
    status: Optional[str] = "active"


@router.get("/users")
async def list_users(user: dict = Depends(require_roles("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(1000)


@router.post("/users")
async def create_user(payload: UserIn, user: dict = Depends(require_roles("admin"))):
    from core import hash_password
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = payload.model_dump()
    doc.update({"id": new_id(), "email": email, "created_at": now_iso(),
                "password_hash": hash_password(payload.password or "changeme123")})
    doc.pop("password")
    await db.users.insert_one(doc)
    await audit(user, "create", "users", doc["id"], None, {"email": email, "role": doc["role"]})
    doc.pop("password_hash")
    doc.pop("_id", None)
    return doc


@router.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserIn, user: dict = Depends(require_roles("admin"))):
    from core import hash_password
    old = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None and k != "password"}
    upd["email"] = payload.email.lower().strip()
    if payload.password:
        upd["password_hash"] = hash_password(payload.password)
    await db.users.update_one({"id": user_id}, {"$set": upd})
    await audit(user, "update", "users", user_id, old, {k: v for k, v in upd.items() if k != "password_hash"})
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
