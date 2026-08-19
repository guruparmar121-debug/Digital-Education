from fastapi import APIRouter, Depends
from collections import defaultdict
from core import db, get_current_user

router = APIRouter()


async def gather(academic_year_id: str, block_id="", village_id="", school_id="", standard="",
                 gender="", course_id="", date_from="", date_to=""):
    sq = {"academic_year_id": academic_year_id}
    for k, v in (("block_id", block_id), ("village_id", village_id),
                 ("school_id", school_id), ("standard", standard)):
        if v:
            sq[k] = v
    say = await db.student_academic_years.find(sq, {"_id": 0}).to_list(100000)
    students = {s["student_id"]: s for s in await db.students.find({}, {"_id": 0}).to_list(100000)}
    if gender:
        say = [r for r in say if students.get(r["student_id"], {}).get("gender") == gender]
    codes = {r["student_id"] for r in say}
    aq = {"academic_year_id": academic_year_id, "student_id": {"$in": list(codes)}}
    if date_from or date_to:
        aq["date"] = {}
        if date_from:
            aq["date"]["$gte"] = date_from
        if date_to:
            aq["date"]["$lte"] = date_to
    att = await db.attendance.find(aq, {"_id": 0}).to_list(500000)
    pq = {"academic_year_id": academic_year_id, "student_id": {"$in": list(codes)}}
    if course_id:
        pq["course_id"] = course_id
    prog = await db.student_courses.find(pq, {"_id": 0}).to_list(500000)
    return say, students, att, prog


def pct(a, b):
    return round(a / b * 100, 1) if b else 0.0


@router.get("/dashboard/overview")
async def overview(academic_year_id: str, block_id: str = "", village_id: str = "", school_id: str = "",
                   standard: str = "", gender: str = "", course_id: str = "", date_from: str = "",
                   date_to: str = "", user: dict = Depends(get_current_user)):
    if user.get("role") == "coordinator" and user.get("block_ids") and not block_id:
        block_id = user["block_ids"][0]
    if user.get("role") == "teacher" and user.get("school_id"):
        school_id = user["school_id"]
    say, students, att, prog = await gather(academic_year_id, block_id, village_id, school_id,
                                            standard, gender, course_id, date_from, date_to)
    schools = {s["id"]: s for s in await db.schools.find({}, {"_id": 0}).to_list(5000)}
    blocks = {b["id"]: b for b in await db.blocks.find({}, {"_id": 0}).to_list(5000)}
    villages = {v["id"]: v for v in await db.villages.find({}, {"_id": 0}).to_list(5000)}
    courses = {c["id"]: c for c in await db.courses.find({"academic_year_id": academic_year_id}, {"_id": 0}).to_list(5000)}
    teachers_count = await db.teachers.count_documents({"status": "active"})

    present = sum(1 for a in att if a["status"] == "present")
    absent = sum(1 for a in att if a["status"] == "absent")

    per_student = defaultdict(lambda: {"present": 0, "absent": 0})
    for a in att:
        per_student[a["student_id"]][a["status"]] += 1
    low_att = [s for s, v in per_student.items() if pct(v["present"], v["present"] + v["absent"]) < 75]

    prog_pcts = [pct(p.get("completed_lessons", 0), p.get("total_lessons") or 1) for p in prog]
    avg_prog = round(sum(prog_pcts) / len(prog_pcts), 1) if prog_pcts else 0
    completed = sum(1 for p in prog if p.get("status") == "completed")
    low_prog = sum(1 for p in prog_pcts if p < 50)

    def bucket(items, keyfn, valfn=None):
        d = defaultdict(int)
        for i in items:
            d[keyfn(i)] += 1
        return [{"name": k, "value": v} for k, v in sorted(d.items(), key=lambda x: -x[1]) if k]

    say_school = defaultdict(list)
    for r in say:
        say_school[r.get("school_id")].append(r)
    student_school = {r["student_id"]: r for r in say}

    att_by = lambda keyfn: [
        {"name": k, "present": v["present"], "absent": v["absent"],
         "value": pct(v["present"], v["present"] + v["absent"])}
        for k, v in sorted(_group(att, keyfn).items(), key=lambda x: x[0]) if k]

    monthly = att_by(lambda a: a["date"][:7])
    school_att = att_by(lambda a: schools.get(a.get("school_id"), {}).get("name", ""))
    class_att = att_by(lambda a: f"Std {a.get('standard','')}")

    prog_group = defaultdict(lambda: {"sum": 0, "n": 0})
    for p in prog:
        keys = [("course", courses.get(p["course_id"], {}).get("name", "")),
                ("school", schools.get(student_school.get(p["student_id"], {}).get("school_id"), {}).get("name", "")),
                ("class", "Std " + str(student_school.get(p["student_id"], {}).get("standard", ""))),
                ("month", (p.get("last_activity") or p.get("created_at", ""))[:7])]
        v = pct(p.get("completed_lessons", 0), p.get("total_lessons") or 1)
        for kind, name in keys:
            if name:
                g = prog_group[(kind, name)]
                g["sum"] += v
                g["n"] += 1
    def prog_chart(kind):
        return [{"name": name, "value": round(g["sum"] / g["n"], 1)}
                for (k, name), g in sorted(prog_group.items()) if k == kind]

    return {
        "kpis": {
            "total_students": len(say), "total_schools": len({r.get("school_id") for r in say if r.get("school_id")}) or len(schools),
            "total_blocks": len(blocks), "total_villages": len(villages),
            "total_teachers": teachers_count, "total_courses": len(courses),
            "present_students": present, "absent_students": absent,
            "attendance_pct": pct(present, present + absent),
            "avg_progress_pct": avg_prog,
            "course_completion_pct": pct(completed, len(prog)),
            "low_attendance_students": len(low_att), "low_progress_students": low_prog,
        },
        "charts": {
            "block_students": bucket(say, lambda r: blocks.get(r.get("block_id"), {}).get("name", "")),
            "school_students": bucket(say, lambda r: schools.get(r.get("school_id"), {}).get("name", "")),
            "class_students": bucket(say, lambda r: f"Std {r.get('standard','')}"),
            "gender_students": bucket(say, lambda r: students.get(r["student_id"], {}).get("gender", "")),
            "monthly_attendance": monthly,
            "school_attendance": school_att,
            "class_attendance": class_att,
            "present_vs_absent": [{"name": "Present", "value": present}, {"name": "Absent", "value": absent}],
            "course_progress": prog_chart("course"),
            "school_progress": prog_chart("school"),
            "class_progress": prog_chart("class"),
            "monthly_progress": prog_chart("month"),
            "course_completion": [
                {"name": "Completed", "value": completed},
                {"name": "In Progress", "value": sum(1 for p in prog if p.get("status") == "in_progress")},
                {"name": "Not Started", "value": sum(1 for p in prog if p.get("status") == "not_started")}],
        },
    }


def _group(items, keyfn):
    d = defaultdict(lambda: {"present": 0, "absent": 0})
    for i in items:
        d[keyfn(i)][i["status"]] += 1
    return d


@router.get("/dashboard/course-progress")
async def progress_dashboard(academic_year_id: str, block_id: str = "", school_id: str = "",
                             standard: str = "", course_id: str = "", user: dict = Depends(get_current_user)):
    data = await overview(academic_year_id, block_id, "", school_id, standard, "", course_id, "", "", user)
    prog = await db.student_courses.find({"academic_year_id": academic_year_id}, {"_id": 0}).to_list(200000)
    courses = await db.courses.find({"academic_year_id": academic_year_id}, {"_id": 0}).to_list(5000)
    students = {s["student_id"]: s["name"] for s in await db.students.find({}, {"_id": 0}).to_list(100000)}
    per_student = defaultdict(lambda: {"sum": 0, "n": 0})
    for p in prog:
        v = pct(p.get("completed_lessons", 0), p.get("total_lessons") or 1)
        per_student[p["student_id"]]["sum"] += v
        per_student[p["student_id"]]["n"] += 1
    ranked = sorted(({"name": students.get(k, k), "value": round(v["sum"] / v["n"], 1)}
                     for k, v in per_student.items()), key=lambda x: -x["value"])
    return {
        "kpis": {**data["kpis"],
                 "total_courses": len(courses),
                 "active_courses": sum(1 for c in courses if c.get("status") == "active"),
                 "enrolled_students": len(per_student),
                 "completed_students": sum(1 for p in prog if p.get("status") == "completed"),
                 "in_progress_students": sum(1 for p in prog if p.get("status") == "in_progress"),
                 "not_started_students": sum(1 for p in prog if p.get("status") == "not_started")},
        "charts": {**data["charts"], "top_students": ranked[:10], "low_students": ranked[-10:][::-1]},
    }


@router.get("/dashboard/student/{student_code}")
async def student_dashboard(student_code: str, academic_year_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "student":
        student_code = user.get("student_code")
    s = await db.students.find_one({"student_id": student_code}, {"_id": 0}) or {}
    e = await db.student_academic_years.find_one(
        {"student_id": student_code, "academic_year_id": academic_year_id}, {"_id": 0}) or {}
    school = await db.schools.find_one({"id": e.get("school_id")}, {"_id": 0}) or {}
    village = await db.villages.find_one({"id": e.get("village_id")}, {"_id": 0}) or {}
    block = await db.blocks.find_one({"id": e.get("block_id")}, {"_id": 0}) or {}
    att = await db.attendance.find({"student_id": student_code, "academic_year_id": academic_year_id},
                                   {"_id": 0}).sort("date", 1).to_list(5000)
    present = sum(1 for a in att if a["status"] == "present")
    prog = await db.student_courses.find({"student_id": student_code, "academic_year_id": academic_year_id},
                                          {"_id": 0}).to_list(500)
    courses = {c["id"]: c for c in await db.courses.find({}, {"_id": 0}).to_list(5000)}
    prog_rows = [{"course_name": courses.get(p["course_id"], {}).get("name", ""),
                  "subject": courses.get(p["course_id"], {}).get("subject", ""),
                  "completed_lessons": p.get("completed_lessons", 0),
                  "total_lessons": p.get("total_lessons", 0), "status": p.get("status"),
                  "last_activity": p.get("last_activity", ""),
                  "value": pct(p.get("completed_lessons", 0), p.get("total_lessons") or 1)} for p in prog]
    monthly = [{"name": k, "value": pct(v["present"], v["present"] + v["absent"]),
                "present": v["present"], "absent": v["absent"]}
               for k, v in sorted(_group(att, lambda a: a["date"][:7]).items())]
    return {
        "profile": {**s, "standard": e.get("standard", ""), "division": e.get("division", ""),
                    "school_name": school.get("name", ""), "village_name": village.get("name", ""),
                    "block_name": block.get("name", "")},
        "attendance": {"working_days": len(att), "present": present, "absent": len(att) - present,
                       "attendance_pct": pct(present, len(att))},
        "courses": {"total": len(prog),
                    "completed": sum(1 for p in prog if p.get("status") == "completed"),
                    "in_progress": sum(1 for p in prog if p.get("status") == "in_progress"),
                    "not_started": sum(1 for p in prog if p.get("status") == "not_started"),
                    "overall_pct": round(sum(r["value"] for r in prog_rows) / len(prog_rows), 1) if prog_rows else 0},
        "charts": {"monthly_attendance": monthly, "course_progress": prog_rows,
                   "present_vs_absent": [{"name": "Present", "value": present},
                                          {"name": "Absent", "value": len(att) - present}],
                   "trend": [{"name": a["date"], "value": 100 if a["status"] == "present" else 0} for a in att[-30:]]},
        "progress_rows": prog_rows,
        "attendance_rows": att[-60:][::-1],
    }


@router.get("/dashboard/year-comparison")
async def year_comparison(year_a: str, year_b: str, user: dict = Depends(get_current_user)):
    async def snap(yid):
        d = await overview(yid, user=user)
        k = d["kpis"]
        return {"students": k["total_students"], "schools": k["total_schools"], "blocks": k["total_blocks"],
                "attendance_pct": k["attendance_pct"], "avg_progress_pct": k["avg_progress_pct"],
                "course_completion_pct": k["course_completion_pct"],
                "low_attendance": k["low_attendance_students"], "low_progress": k["low_progress_students"]}
    a, b = await snap(year_a), await snap(year_b)
    labels = {"students": "Total Students", "schools": "Total Schools", "blocks": "Total Blocks",
              "attendance_pct": "Attendance %", "avg_progress_pct": "Avg Course Progress %",
              "course_completion_pct": "Course Completion %", "low_attendance": "Low Attendance Students",
              "low_progress": "Low Progress Students"}
    rows = []
    for k, label in labels.items():
        va, vb = a[k], b[k]
        change = round((vb - va) / va * 100, 1) if va else (100.0 if vb else 0.0)
        rows.append({"kpi": label, "year_a": va, "year_b": vb, "change_pct": change})
    return {"rows": rows}
