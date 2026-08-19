import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel
import pandas as pd
from core import db, new_id, now_iso, audit, get_current_user, require_roles

router = APIRouter()

TEMPLATE_COLUMNS = ["Student ID", "Student Name", "Gender", "Date of Birth", "Parent/Guardian Name",
                    "Parent Mobile", "Academic Year", "Standard/Class", "Division", "School",
                    "Village", "Block", "Admission Date", "Status"]


class StudentIn(BaseModel):
    student_id: str
    name: str
    gender: str
    dob: Optional[str] = None
    parent_name: Optional[str] = None
    parent_mobile: Optional[str] = None
    admission_date: Optional[str] = None
    status: Optional[str] = "active"
    academic_year_id: str
    standard: str
    division: Optional[str] = ""
    school_id: str
    village_id: Optional[str] = ""
    block_id: Optional[str] = ""


async def enrich(rows: List[dict]) -> List[dict]:
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    villages = {v["id"]: v["name"] for v in await db.villages.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    blocks = {b["id"]: b["name"] for b in await db.blocks.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    for r in rows:
        r["school_name"] = schools.get(r.get("school_id"), "")
        r["village_name"] = villages.get(r.get("village_id"), "")
        r["block_name"] = blocks.get(r.get("block_id"), "")
    return rows


@router.get("/students")
async def list_students(academic_year_id: str = "", search: str = "", block_id: str = "",
                        village_id: str = "", school_id: str = "", standard: str = "",
                        gender: str = "", status: str = "", user: dict = Depends(get_current_user)):
    q = {}
    if academic_year_id:
        q["academic_year_id"] = academic_year_id
    for k, v in (("block_id", block_id), ("village_id", village_id),
                 ("school_id", school_id), ("standard", standard)):
        if v:
            q[k] = v
    if user.get("role") == "coordinator" and user.get("block_ids"):
        q["block_id"] = {"$in": user["block_ids"]}
    if user.get("role") == "teacher" and user.get("school_id"):
        q["school_id"] = user["school_id"]
    if user.get("role") == "student":
        q["student_id"] = user.get("student_code")
    say = await db.student_academic_years.find(q, {"_id": 0}).to_list(20000)
    codes = list({r["student_id"] for r in say})
    sq = {"student_id": {"$in": codes}}
    if gender:
        sq["gender"] = gender
    if status:
        sq["status"] = status
    if search:
        sq["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                     {"student_id": {"$regex": search, "$options": "i"}},
                     {"parent_name": {"$regex": search, "$options": "i"}}]
    students = {s["student_id"]: s for s in await db.students.find(sq, {"_id": 0}).to_list(20000)}
    out = []
    for r in say:
        s = students.get(r["student_id"])
        if not s:
            continue
        out.append({**s, **{k: v for k, v in r.items() if k != "id"}, "say_id": r["id"]})
    out.sort(key=lambda x: (x.get("standard", ""), x.get("name", "")))
    return await enrich(out)


@router.get("/students/{student_code}")
async def get_student(student_code: str, academic_year_id: str = "", user: dict = Depends(get_current_user)):
    if user.get("role") == "student" and user.get("student_code") != student_code:
        raise HTTPException(status_code=403, detail="Forbidden")
    s = await db.students.find_one({"student_id": student_code}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    q = {"student_id": student_code}
    if academic_year_id:
        q["academic_year_id"] = academic_year_id
    enrollments = await db.student_academic_years.find({"student_id": student_code}, {"_id": 0}).to_list(50)
    cur = await db.student_academic_years.find_one(q, {"_id": 0})
    merged = {**s, **({k: v for k, v in cur.items() if k != "id"} if cur else {})}
    merged = (await enrich([merged]))[0]
    merged["enrollments"] = await enrich(enrollments)
    return merged


@router.post("/students")
async def create_student(payload: StudentIn, user: dict = Depends(require_roles("admin"))):
    exists = await db.students.find_one({"student_id": payload.student_id})
    d = payload.model_dump()
    core_fields = {k: d[k] for k in ("student_id", "name", "gender", "dob", "parent_name",
                                     "parent_mobile", "admission_date", "status")}
    if exists:
        await db.students.update_one({"student_id": payload.student_id}, {"$set": core_fields})
    else:
        await db.students.insert_one({**core_fields, "id": new_id(), "created_at": now_iso()})
    dup = await db.student_academic_years.find_one(
        {"student_id": payload.student_id, "academic_year_id": payload.academic_year_id})
    say = {k: d[k] for k in ("student_id", "academic_year_id", "standard", "division",
                             "school_id", "village_id", "block_id")}
    say["status"] = d["status"]
    if dup:
        await db.student_academic_years.update_one({"id": dup["id"]}, {"$set": say})
    else:
        await db.student_academic_years.insert_one({**say, "id": new_id(), "created_at": now_iso()})
    await audit(user, "create", "students", payload.student_id, None, d)
    return {"ok": True, "student_id": payload.student_id}


@router.put("/students/{student_code}")
async def update_student(student_code: str, payload: StudentIn, user: dict = Depends(require_roles("admin"))):
    old = await db.students.find_one({"student_id": student_code}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    d = payload.model_dump()
    d["student_id"] = student_code
    await create_student(StudentIn(**d), user)
    await audit(user, "update", "students", student_code, old, d)
    return {"ok": True}


@router.delete("/students/{student_code}")
async def deactivate_student(student_code: str, user: dict = Depends(require_roles("admin"))):
    await db.students.update_one({"student_id": student_code}, {"$set": {"status": "inactive"}})
    await audit(user, "deactivate", "students", student_code)
    return {"ok": True}


# ---------------- Bulk upload ----------------

@router.get("/students/bulk/template")
async def download_template(user: dict = Depends(require_roles("admin"))):
    year = await db.academic_years.find_one({"is_current": True}, {"_id": 0})
    school = await db.schools.find_one({}, {"_id": 0})
    village = await db.villages.find_one({}, {"_id": 0})
    block = await db.blocks.find_one({}, {"_id": 0})
    sample = [{
        "Student ID": "1001", "Student Name": "Rahul Patel", "Gender": "Male",
        "Date of Birth": "2012-06-15", "Parent/Guardian Name": "Suresh Patel",
        "Parent Mobile": "9876543210", "Academic Year": (year or {}).get("year", "2026-27"),
        "Standard/Class": "7", "Division": "A", "School": (school or {}).get("name", ""),
        "Village": (village or {}).get("name", ""), "Block": (block or {}).get("name", ""),
        "Admission Date": "2024-06-10", "Status": "active",
    }]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        pd.DataFrame(sample, columns=TEMPLATE_COLUMNS).to_excel(w, index=False, sheet_name="Students")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=student_upload_template.xlsx"})


def read_upload(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith(".csv"):
        return pd.read_csv(io.BytesIO(content), dtype=str).fillna("")
    return pd.read_excel(io.BytesIO(content), dtype=str).fillna("")


async def lookup_maps():
    return (
        {y["year"].strip(): y for y in await db.academic_years.find({}, {"_id": 0}).to_list(100)},
        {s["name"].strip().lower(): s for s in await db.schools.find({}, {"_id": 0}).to_list(5000)},
        {v["name"].strip().lower(): v for v in await db.villages.find({}, {"_id": 0}).to_list(5000)},
        {b["name"].strip().lower(): b for b in await db.blocks.find({}, {"_id": 0}).to_list(5000)},
    )


async def validate_rows(df: pd.DataFrame, mode: str = "insert"):
    years, schools, villages, blocks = await lookup_maps()
    existing = {s["student_id"] for s in await db.students.find({}, {"_id": 0, "student_id": 1}).to_list(50000)}
    existing_say = {(r["student_id"], r["academic_year_id"]) for r in
                    await db.student_academic_years.find({}, {"_id": 0, "student_id": 1, "academic_year_id": 1}).to_list(50000)}
    seen = set()
    valid, errors = [], []
    for idx, row in df.iterrows():
        rownum = int(idx) + 2
        g = lambda c: str(row.get(c, "") or "").strip()
        errs = []
        sid, name = g("Student ID"), g("Student Name")
        gender = g("Gender").title()
        year_name, standard = g("Academic Year"), g("Standard/Class")
        if not sid:
            errs.append("Student ID is required")
        if not name:
            errs.append("Student Name is required")
        if gender not in ("Male", "Female", "Other"):
            errs.append("Gender must be Male/Female/Other")
        year = years.get(year_name)
        if not year:
            errs.append(f"Academic Year '{year_name}' not found")
        if not standard:
            errs.append("Standard/Class is required")
        school = schools.get(g("School").lower())
        if not school:
            errs.append(f"School '{g('School')}' not found")
        village = villages.get(g("Village").lower())
        if g("Village") and not village:
            errs.append(f"Village '{g('Village')}' not found")
        block = blocks.get(g("Block").lower())
        if g("Block") and not block:
            errs.append(f"Block '{g('Block')}' not found")
        mobile = g("Parent Mobile")
        if mobile and not (mobile.isdigit() and len(mobile) == 10):
            errs.append("Parent Mobile must be 10 digits")
        key = (sid, year_name)
        if sid and key in seen:
            errs.append("Duplicate Student ID for same Academic Year inside file")
        seen.add(key)
        if mode == "insert":
            if sid and year and (sid, year["id"]) in existing_say:
                errs.append("Student already enrolled for this Academic Year")
        else:
            if sid and sid not in existing:
                errs.append("Student ID does not exist (update requires existing student)")
        record = {
            "row": rownum, "student_id": sid, "name": name, "gender": gender,
            "dob": g("Date of Birth"), "parent_name": g("Parent/Guardian Name"),
            "parent_mobile": mobile, "academic_year_id": year["id"] if year else "",
            "academic_year": year_name, "standard": standard, "division": g("Division"),
            "school_id": school["id"] if school else "", "school_name": g("School"),
            "village_id": village["id"] if village else "", "village_name": g("Village"),
            "block_id": block["id"] if block else (school or {}).get("block_id", ""),
            "block_name": g("Block"), "admission_date": g("Admission Date"),
            "status": (g("Status") or "active").lower(),
        }
        if errs:
            errors.append({**record, "error": "; ".join(errs), "raw": {c: g(c) for c in df.columns}})
        else:
            valid.append(record)
    return valid, errors


PENDING = {}


@router.post("/students/bulk/validate")
async def bulk_validate(file: UploadFile = File(...), mode: str = Form("insert"),
                        user: dict = Depends(require_roles("admin"))):
    content = await file.read()
    try:
        df = read_upload(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    missing = [c for c in ["Student ID", "Student Name", "Academic Year"] if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
    valid, errors = await validate_rows(df, mode)
    token = new_id()
    PENDING[token] = {"valid": valid, "errors": errors, "file": file.filename,
                      "mode": mode, "columns": list(df.columns)}
    return {"token": token, "file_name": file.filename, "total": len(df),
             "valid_count": len(valid), "error_count": len(errors),
             "preview": valid[:50], "errors": errors[:200]}


@router.get("/students/bulk/errors/{token}")
async def download_error_excel(token: str, user: dict = Depends(require_roles("admin"))):
    data = PENDING.get(token)
    if not data:
        raise HTTPException(status_code=404, detail="Validation session expired, please re-upload")
    rows = [{**e["raw"], "Error Message": e["error"], "Row": e["row"]} for e in data["errors"]]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        pd.DataFrame(rows or [{"Error Message": "No errors"}]).to_excel(w, index=False, sheet_name="Errors")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=upload_errors.xlsx"})


@router.post("/students/bulk/import/{token}")
async def bulk_import(token: str, user: dict = Depends(require_roles("admin"))):
    data = PENDING.get(token)
    if not data:
        raise HTTPException(status_code=404, detail="Validation session expired, please re-upload")
    imported = updated = 0
    for r in data["valid"]:
        core_fields = {"student_id": r["student_id"], "name": r["name"], "gender": r["gender"],
                       "dob": r["dob"], "parent_name": r["parent_name"],
                       "parent_mobile": r["parent_mobile"], "admission_date": r["admission_date"],
                       "status": r["status"]}
        old = await db.students.find_one({"student_id": r["student_id"]}, {"_id": 0})
        if old:
            await db.students.update_one({"student_id": r["student_id"]}, {"$set": core_fields})
            changes = {k: {"old": old.get(k), "new": v} for k, v in core_fields.items()
                       if old.get(k) not in (v,) and k != "student_id"}
            if changes:
                await audit(user, "bulk_update", "students", r["student_id"], old, changes,
                            note=f"Bulk file: {data['file']}")
            updated += 1
        else:
            await db.students.insert_one({**core_fields, "id": new_id(), "created_at": now_iso()})
            imported += 1
        say = {"student_id": r["student_id"], "academic_year_id": r["academic_year_id"],
               "standard": r["standard"], "division": r["division"], "school_id": r["school_id"],
               "village_id": r["village_id"], "block_id": r["block_id"], "status": r["status"]}
        dup = await db.student_academic_years.find_one(
            {"student_id": r["student_id"], "academic_year_id": r["academic_year_id"]}, {"_id": 0})
        if dup:
            await db.student_academic_years.update_one({"id": dup["id"]}, {"$set": say})
        else:
            await db.student_academic_years.insert_one({**say, "id": new_id(), "created_at": now_iso()})
    hist = {"id": new_id(), "file_name": data["file"], "mode": data["mode"],
            "academic_year": data["valid"][0]["academic_year"] if data["valid"] else "",
            "academic_year_id": data["valid"][0]["academic_year_id"] if data["valid"] else "",
            "total_records": len(data["valid"]) + len(data["errors"]),
            "imported": imported, "updated": updated, "errors": len(data["errors"]),
            "error_details": data["errors"][:500],
            "uploaded_by": user.get("name"), "created_at": now_iso()}
    await db.upload_history.insert_one(hist)
    PENDING.pop(token, None)
    hist.pop("_id", None)
    return {"imported": imported, "updated": updated, "skipped": len(data["errors"]),
            "message": f"{imported} students imported, {updated} updated, {len(data['errors'])} records skipped due to errors."}


@router.get("/students/bulk/history")
async def upload_history(user: dict = Depends(require_roles("admin", "management"))):
    return await db.upload_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/students/bulk/export")
async def export_for_update(academic_year_id: str, school_id: str = "",
                            user: dict = Depends(require_roles("admin"))):
    rows = await list_students(academic_year_id=academic_year_id, school_id=school_id, user=user)
    years = {y["id"]: y["year"] for y in await db.academic_years.find({}, {"_id": 0}).to_list(100)}
    data = [{"Student ID": r["student_id"], "Student Name": r["name"], "Gender": r.get("gender", ""),
             "Date of Birth": r.get("dob", ""), "Parent/Guardian Name": r.get("parent_name", ""),
             "Parent Mobile": r.get("parent_mobile", ""),
             "Academic Year": years.get(r.get("academic_year_id"), ""),
             "Standard/Class": r.get("standard", ""), "Division": r.get("division", ""),
             "School": r.get("school_name", ""), "Village": r.get("village_name", ""),
             "Block": r.get("block_name", ""), "Admission Date": r.get("admission_date", ""),
             "Status": r.get("status", "active")} for r in rows]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        pd.DataFrame(data, columns=TEMPLATE_COLUMNS).to_excel(w, index=False, sheet_name="Students")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=students_bulk_update.xlsx"})


# ---------------- Promotion ----------------

class PromotionIn(BaseModel):
    from_year_id: str
    to_year_id: str
    student_ids: List[str]
    to_standard: Optional[str] = None
    to_division: Optional[str] = None
    to_school_id: Optional[str] = None


@router.post("/promotions")
async def promote(payload: PromotionIn, user: dict = Depends(require_roles("admin"))):
    promoted, skipped = 0, 0
    for sid in payload.student_ids:
        src = await db.student_academic_years.find_one(
            {"student_id": sid, "academic_year_id": payload.from_year_id}, {"_id": 0})
        if not src:
            skipped += 1
            continue
        std = payload.to_standard or str(int(src["standard"]) + 1 if str(src["standard"]).isdigit() else src["standard"])
        new_rec = {"student_id": sid, "academic_year_id": payload.to_year_id, "standard": std,
                   "division": payload.to_division or src.get("division", ""),
                   "school_id": payload.to_school_id or src.get("school_id"),
                   "village_id": src.get("village_id"), "block_id": src.get("block_id"),
                   "status": "active"}
        if payload.to_school_id:
            sch = await db.schools.find_one({"id": payload.to_school_id}, {"_id": 0})
            if sch:
                new_rec["village_id"] = sch.get("village_id")
                new_rec["block_id"] = sch.get("block_id")
        dup = await db.student_academic_years.find_one(
            {"student_id": sid, "academic_year_id": payload.to_year_id}, {"_id": 0})
        if dup:
            await db.student_academic_years.update_one({"id": dup["id"]}, {"$set": new_rec})
        else:
            await db.student_academic_years.insert_one({**new_rec, "id": new_id(), "created_at": now_iso()})
        await db.student_promotions.insert_one({
            "id": new_id(), "student_id": sid, "from_year_id": payload.from_year_id,
            "to_year_id": payload.to_year_id, "from_standard": src["standard"], "to_standard": std,
            "from_school_id": src.get("school_id"), "to_school_id": new_rec["school_id"],
            "promoted_by": user.get("name"), "created_at": now_iso()})
        promoted += 1
    await audit(user, "promote", "students", "", None, {"count": promoted})
    return {"promoted": promoted, "skipped": skipped}


@router.get("/promotions")
async def promotion_history(user: dict = Depends(require_roles("admin", "management"))):
    return await db.student_promotions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
