from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from core import db, new_id, now_iso, audit, get_current_user, require_roles

router = APIRouter()


class CourseIn(BaseModel):
    course_code: str
    name: str
    subject: Optional[str] = ""
    description: Optional[str] = ""
    academic_year_id: str
    standard: Optional[str] = ""
    school_id: Optional[str] = ""
    block_id: Optional[str] = ""
    total_modules: int = 1
    total_lessons: int = 10
    duration: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    status: Optional[str] = "active"


@router.get("/courses")
async def list_courses(academic_year_id: str = "", school_id: str = "", standard: str = "",
                       search: str = "", status: str = "", user: dict = Depends(get_current_user)):
    q = {}
    for k, v in (("academic_year_id", academic_year_id), ("school_id", school_id),
                 ("standard", standard), ("status", status)):
        if v:
            q[k] = v
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    courses = await db.courses.find(q, {"_id": 0}).sort("name", 1).to_list(2000)
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0}).to_list(5000)}
    for c in courses:
        c["school_name"] = schools.get(c.get("school_id"), "All Schools")
        c["enrolled"] = await db.student_courses.count_documents({"course_id": c["id"]})
    return courses


@router.post("/courses")
async def create_course(payload: CourseIn, user: dict = Depends(require_roles("admin"))):
    doc = payload.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.courses.insert_one(doc)
    await audit(user, "create", "courses", doc["id"], None, doc)
    doc.pop("_id", None)
    return doc


@router.put("/courses/{course_id}")
async def update_course(course_id: str, payload: CourseIn, user: dict = Depends(require_roles("admin"))):
    old = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    upd = payload.model_dump()
    await db.courses.update_one({"id": course_id}, {"$set": upd})
    if upd.get("total_lessons") != old.get("total_lessons"):
        await db.student_courses.update_many({"course_id": course_id},
                                             {"$set": {"total_lessons": upd["total_lessons"]}})
    await audit(user, "update", "courses", course_id, old, upd)
    return await db.courses.find_one({"id": course_id}, {"_id": 0})


@router.delete("/courses/{course_id}")
async def deactivate_course(course_id: str, user: dict = Depends(require_roles("admin"))):
    await db.courses.update_one({"id": course_id}, {"$set": {"status": "inactive"}})
    await audit(user, "deactivate", "courses", course_id)
    return {"ok": True}


class AssignIn(BaseModel):
    course_id: str
    academic_year_id: str
    student_ids: Optional[List[str]] = None
    school_id: Optional[str] = None
    standard: Optional[str] = None
    teacher_id: Optional[str] = None


@router.post("/courses/assign")
async def assign_course(payload: AssignIn, user: dict = Depends(require_roles("admin", "coordinator"))):
    course = await db.courses.find_one({"id": payload.course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if payload.teacher_id:
        await db.teachers.update_one({"id": payload.teacher_id},
                                     {"$addToSet": {"course_ids": payload.course_id}})
    codes = payload.student_ids or []
    if not codes:
        q = {"academic_year_id": payload.academic_year_id}
        if payload.school_id:
            q["school_id"] = payload.school_id
        if payload.standard:
            q["standard"] = payload.standard
        codes = [r["student_id"] for r in await db.student_academic_years.find(q, {"_id": 0}).to_list(20000)]
    assigned = 0
    for sid in codes:
        if await db.student_courses.find_one({"student_id": sid, "course_id": payload.course_id,
                                             "academic_year_id": payload.academic_year_id}):
            continue
        await db.student_courses.insert_one({
            "id": new_id(), "student_id": sid, "course_id": payload.course_id,
            "academic_year_id": payload.academic_year_id,
            "total_lessons": course.get("total_lessons", 10), "completed_lessons": 0,
            "start_date": "", "last_activity": "", "completion_date": "",
            "status": "not_started", "created_at": now_iso()})
        assigned += 1
    await audit(user, "assign", "courses", payload.course_id, None, {"assigned": assigned})
    return {"assigned": assigned, "total_targets": len(codes)}


class ProgressIn(BaseModel):
    completed_lessons: int


class LessonToggleIn(BaseModel):
    completed: bool


async def ensure_curriculum(course: dict):
    """Create default modules and lessons for a course the first time they are needed."""
    mods = await db.course_modules.find({"course_id": course["id"]}, {"_id": 0}).sort("order", 1).to_list(200)
    if mods:
        return mods
    total_lessons = max(int(course.get("total_lessons") or 1), 1)
    total_modules = max(min(int(course.get("total_modules") or 1), total_lessons), 1)
    per_module = -(-total_lessons // total_modules)
    created, n = [], 0
    for mi in range(total_modules):
        mod = {"id": new_id(), "course_id": course["id"], "name": f"Module {mi + 1}",
               "order": mi + 1, "created_at": now_iso()}
        await db.course_modules.insert_one(dict(mod))
        lessons = []
        for _ in range(per_module):
            if n >= total_lessons:
                break
            n += 1
            lessons.append({"id": new_id(), "course_id": course["id"], "module_id": mod["id"],
                            "name": f"Lesson {n}", "order": n, "created_at": now_iso()})
        if lessons:
            await db.course_lessons.insert_many([dict(l) for l in lessons])
        created.append(mod)
    return created


@router.get("/courses/{course_id}/curriculum")
async def get_curriculum(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    mods = await ensure_curriculum(course)
    lessons = await db.course_lessons.find({"course_id": course_id}, {"_id": 0}).sort("order", 1).to_list(2000)
    by_mod = {}
    for l in lessons:
        by_mod.setdefault(l["module_id"], []).append(l)
    return {"course": course, "modules": [{**m, "lessons": by_mod.get(m["id"], [])} for m in mods]}


@router.get("/course-progress/{record_id}/lessons")
async def progress_lessons(record_id: str, user: dict = Depends(get_current_user)):
    rec = await db.student_courses.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Progress record not found")
    if user.get("role") == "student" and user.get("student_code") != rec["student_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    course = await db.courses.find_one({"id": rec["course_id"]}, {"_id": 0}) or {}
    mods = await ensure_curriculum(course)
    lessons = await db.course_lessons.find({"course_id": rec["course_id"]}, {"_id": 0}).sort("order", 1).to_list(2000)
    ticks = {t["lesson_id"]: t for t in await db.student_lessons.find(
        {"student_id": rec["student_id"], "course_id": rec["course_id"],
         "academic_year_id": rec["academic_year_id"]}, {"_id": 0}).to_list(2000)}
    by_mod = {}
    for l in lessons:
        by_mod.setdefault(l["module_id"], []).append(
            {**l, "completed": l["id"] in ticks, "completed_at": ticks.get(l["id"], {}).get("completed_at", "")})
    student = await db.students.find_one({"student_id": rec["student_id"]}, {"_id": 0}) or {}
    total = len(lessons) or 1
    done = sum(1 for l in lessons if l["id"] in ticks)
    return {"record": rec, "student_name": student.get("name", ""), "course_name": course.get("name", ""),
            "total_lessons": len(lessons), "completed_lessons": done,
            "progress_pct": round(done / total * 100, 1),
            "modules": [{**m, "lessons": by_mod.get(m["id"], []),
                         "completed": sum(1 for l in by_mod.get(m["id"], []) if l["completed"])} for m in mods]}


async def recount_progress(rec: dict, user: dict):
    lessons = await db.course_lessons.find({"course_id": rec["course_id"]}, {"_id": 0}).to_list(2000)
    total = len(lessons) or (rec.get("total_lessons") or 1)
    done = await db.student_lessons.count_documents(
        {"student_id": rec["student_id"], "course_id": rec["course_id"],
         "academic_year_id": rec["academic_year_id"]})
    status = progress_status(done, total)
    upd = {"completed_lessons": done, "total_lessons": total, "status": status,
           "last_activity": now_iso()[:10],
           "completion_date": now_iso()[:10] if status == "completed" else ""}
    if not rec.get("start_date") and done > 0:
        upd["start_date"] = now_iso()[:10]
    await db.student_courses.update_one({"id": rec["id"]}, {"$set": upd})
    return {**rec, **upd, "progress_pct": round(done / total * 100, 1)}


@router.post("/course-progress/{record_id}/lessons/{lesson_id}")
async def toggle_lesson(record_id: str, lesson_id: str, payload: LessonToggleIn,
                        user: dict = Depends(require_roles("admin", "coordinator", "teacher"))):
    rec = await db.student_courses.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Progress record not found")
    lesson = await db.course_lessons.find_one({"id": lesson_id, "course_id": rec["course_id"]}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found for this course")
    key = {"student_id": rec["student_id"], "course_id": rec["course_id"],
           "academic_year_id": rec["academic_year_id"], "lesson_id": lesson_id}
    if payload.completed:
        await db.student_lessons.update_one(key, {"$set": {**key, "completed_at": now_iso(),
                                                          "marked_by": user.get("name")}}, upsert=True)
    else:
        await db.student_lessons.delete_one(key)
    out = await recount_progress(rec, user)
    await audit(user, "toggle_lesson", "course_progress", record_id, None,
                {"lesson": lesson["name"], "completed": payload.completed,
                 "completed_lessons": out["completed_lessons"]})
    return out


def progress_status(completed: int, total: int) -> str:
    if completed <= 0:
        return "not_started"
    return "completed" if completed >= total else "in_progress"


@router.get("/course-progress")
async def list_progress(academic_year_id: str, course_id: str = "", school_id: str = "",
                        block_id: str = "", standard: str = "", student_id: str = "",
                        max_progress: Optional[float] = None, user: dict = Depends(get_current_user)):
    q = {"academic_year_id": academic_year_id}
    if course_id:
        q["course_id"] = course_id
    if student_id:
        q["student_id"] = student_id
    if user.get("role") == "student":
        q["student_id"] = user.get("student_code")
    recs = await db.student_courses.find(q, {"_id": 0}).to_list(100000)
    say = {r["student_id"]: r for r in await db.student_academic_years.find(
        {"academic_year_id": academic_year_id}, {"_id": 0}).to_list(50000)}
    students = {s["student_id"]: s for s in await db.students.find({}, {"_id": 0}).to_list(50000)}
    courses = {c["id"]: c for c in await db.courses.find({}, {"_id": 0}).to_list(5000)}
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0}).to_list(5000)}
    out = []
    for r in recs:
        e = say.get(r["student_id"], {})
        if school_id and e.get("school_id") != school_id:
            continue
        if block_id and e.get("block_id") != block_id:
            continue
        if standard and e.get("standard") != standard:
            continue
        total = r.get("total_lessons") or 1
        pct = round(r.get("completed_lessons", 0) / total * 100, 1)
        if max_progress is not None and pct >= max_progress:
            continue
        c = courses.get(r["course_id"], {})
        out.append({**r, "progress_pct": pct,
                    "pending_lessons": max(total - r.get("completed_lessons", 0), 0),
                    "name": students.get(r["student_id"], {}).get("name", ""),
                    "standard": e.get("standard", ""),
                    "school_name": schools.get(e.get("school_id"), ""),
                    "course_name": c.get("name", ""), "subject": c.get("subject", "")})
    out.sort(key=lambda x: x["progress_pct"])
    return out


@router.put("/course-progress/{record_id}")
async def update_progress(record_id: str, payload: ProgressIn,
                          user: dict = Depends(require_roles("admin", "coordinator", "teacher"))):
    rec = await db.student_courses.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    total = rec.get("total_lessons") or 1
    completed = max(0, min(payload.completed_lessons, total))
    status = progress_status(completed, total)
    upd = {"completed_lessons": completed, "status": status, "last_activity": now_iso()[:10]}
    if not rec.get("start_date") and completed > 0:
        upd["start_date"] = now_iso()[:10]
    upd["completion_date"] = now_iso()[:10] if status == "completed" else ""
    await db.student_courses.update_one({"id": record_id}, {"$set": upd})
    await audit(user, "update", "course_progress", record_id, rec, upd)
    return {**rec, **upd, "progress_pct": round(completed / total * 100, 1)}
