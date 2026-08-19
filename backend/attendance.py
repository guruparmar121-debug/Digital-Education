from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from collections import defaultdict
from core import db, new_id, now_iso, audit, get_current_user, require_roles

router = APIRouter()


class AttendanceMark(BaseModel):
    student_id: str
    status: str


class AttendanceIn(BaseModel):
    academic_year_id: str
    date: str
    school_id: str
    standard: str
    division: Optional[str] = ""
    records: List[AttendanceMark]


@router.get("/attendance/sheet")
async def attendance_sheet(academic_year_id: str, date: str, school_id: str, standard: str,
                           user: dict = Depends(get_current_user)):
    q = {"academic_year_id": academic_year_id, "school_id": school_id, "standard": standard}
    say = await db.student_academic_years.find(q, {"_id": 0}).to_list(2000)
    codes = [r["student_id"] for r in say]
    students = {s["student_id"]: s for s in await db.students.find(
        {"student_id": {"$in": codes}, "status": "active"}, {"_id": 0}).to_list(2000)}
    marks = {a["student_id"]: a["status"] for a in await db.attendance.find(
        {"academic_year_id": academic_year_id, "date": date, "student_id": {"$in": codes}},
        {"_id": 0}).to_list(5000)}
    rows = []
    for r in say:
        s = students.get(r["student_id"])
        if not s:
            continue
        rows.append({"student_id": s["student_id"], "name": s["name"], "gender": s.get("gender", ""),
                     "division": r.get("division", ""), "status": marks.get(s["student_id"], "")})
    rows.sort(key=lambda x: x["name"])
    return {"already_marked": bool(marks), "students": rows}


@router.post("/attendance")
async def save_attendance(payload: AttendanceIn, user: dict = Depends(require_roles("admin", "coordinator", "teacher"))):
    school = await db.schools.find_one({"id": payload.school_id}, {"_id": 0})
    saved = 0
    for rec in payload.records:
        if rec.status not in ("present", "absent"):
            continue
        doc = {"student_id": rec.student_id, "academic_year_id": payload.academic_year_id,
               "date": payload.date, "status": rec.status, "school_id": payload.school_id,
               "standard": payload.standard, "division": payload.division,
               "village_id": (school or {}).get("village_id", ""),
               "block_id": (school or {}).get("block_id", ""),
               "marked_by": user.get("name"), "updated_at": now_iso()}
        existing = await db.attendance.find_one(
            {"student_id": rec.student_id, "date": payload.date,
             "academic_year_id": payload.academic_year_id}, {"_id": 0})
        if existing:
            await db.attendance.update_one({"id": existing["id"]}, {"$set": doc})
        else:
            await db.attendance.insert_one({**doc, "id": new_id(), "created_at": now_iso()})
        saved += 1
    await audit(user, "save_attendance", "attendance", payload.date, None,
                {"school_id": payload.school_id, "standard": payload.standard, "count": saved})
    return {"saved": saved}


@router.get("/attendance/history")
async def attendance_history(academic_year_id: str, school_id: str = "", standard: str = "",
                             student_id: str = "", date_from: str = "", date_to: str = "",
                             user: dict = Depends(get_current_user)):
    q = {"academic_year_id": academic_year_id}
    if school_id:
        q["school_id"] = school_id
    if standard:
        q["standard"] = standard
    if student_id:
        q["student_id"] = student_id
    if user.get("role") == "student":
        q["student_id"] = user.get("student_code")
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    recs = await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(20000)
    names = {s["student_id"]: s["name"] for s in await db.students.find({}, {"_id": 0, "student_id": 1, "name": 1}).to_list(50000)}
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    for r in recs:
        r["name"] = names.get(r["student_id"], "")
        r["school_name"] = schools.get(r.get("school_id"), "")
    return recs


async def attendance_stats(academic_year_id: str, extra: dict = None):
    q = {"academic_year_id": academic_year_id}
    if extra:
        q.update(extra)
    recs = await db.attendance.find(q, {"_id": 0}).to_list(200000)
    per_student = defaultdict(lambda: {"present": 0, "absent": 0})
    for r in recs:
        per_student[r["student_id"]][r["status"]] += 1
    return recs, per_student


@router.get("/attendance/low")
async def low_attendance(academic_year_id: str, threshold: float = 75, school_id: str = "",
                         block_id: str = "", standard: str = "",
                         user: dict = Depends(get_current_user)):
    extra = {k: v for k, v in (("school_id", school_id), ("block_id", block_id),
                               ("standard", standard)) if v}
    recs, per = await attendance_stats(academic_year_id, extra)
    say = {r["student_id"]: r for r in await db.student_academic_years.find(
        {"academic_year_id": academic_year_id}, {"_id": 0}).to_list(50000)}
    students = {s["student_id"]: s for s in await db.students.find({}, {"_id": 0}).to_list(50000)}
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0}).to_list(5000)}
    blocks = {b["id"]: b["name"] for b in await db.blocks.find({}, {"_id": 0}).to_list(5000)}
    out = []
    for sid, v in per.items():
        total = v["present"] + v["absent"]
        pct = round(v["present"] / total * 100, 1) if total else 0
        if pct >= threshold:
            continue
        s, e = students.get(sid, {}), say.get(sid, {})
        out.append({"student_id": sid, "name": s.get("name", ""), "standard": e.get("standard", ""),
                    "school_name": schools.get(e.get("school_id"), ""),
                    "block_name": blocks.get(e.get("block_id"), ""),
                    "working_days": total, "present": v["present"], "absent": v["absent"],
                    "attendance_pct": pct})
    out.sort(key=lambda x: x["attendance_pct"])
    return out
