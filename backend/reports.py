import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from collections import defaultdict
from core import db, get_current_user

router = APIRouter()

APP_NAME = "DIGITAL EDUCATION PROGRAM"
APP_SUB = "Student Attendance & Learning Management System"


def p(a, b):
    return round(a / b * 100, 1) if b else 0.0


async def build_report(report: str, academic_year_id: str, filters: dict):
    year = await db.academic_years.find_one({"id": academic_year_id}, {"_id": 0}) or {}
    schools = {s["id"]: s["name"] for s in await db.schools.find({}, {"_id": 0}).to_list(5000)}
    blocks = {b["id"]: b["name"] for b in await db.blocks.find({}, {"_id": 0}).to_list(5000)}
    students = {s["student_id"]: s for s in await db.students.find({}, {"_id": 0}).to_list(100000)}
    say = {r["student_id"]: r for r in await db.student_academic_years.find(
        {"academic_year_id": academic_year_id}, {"_id": 0}).to_list(100000)}
    aq = {"academic_year_id": academic_year_id}
    for k in ("school_id", "block_id", "standard"):
        if filters.get(k):
            aq[k] = filters[k]
    if filters.get("date_from") or filters.get("date_to"):
        aq["date"] = {}
        if filters.get("date_from"):
            aq["date"]["$gte"] = filters["date_from"]
        if filters.get("date_to"):
            aq["date"]["$lte"] = filters["date_to"]
    att = await db.attendance.find(aq, {"_id": 0}).to_list(500000)
    prog = await db.student_courses.find({"academic_year_id": academic_year_id}, {"_id": 0}).to_list(200000)
    courses = {c["id"]: c for c in await db.courses.find({}, {"_id": 0}).to_list(5000)}

    def att_group(keyfn, label):
        d = defaultdict(lambda: {"present": 0, "absent": 0})
        for a in att:
            d[keyfn(a)][a["status"]] += 1
        return [{label: k, "Present": v["present"], "Absent": v["absent"],
                 "Working Records": v["present"] + v["absent"],
                 "Attendance %": p(v["present"], v["present"] + v["absent"])}
                for k, v in sorted(d.items()) if k]

    if report in ("daily-attendance", "weekly-attendance", "monthly-attendance",
                  "quarterly-attendance", "yearly-attendance"):
        keys = {"daily-attendance": lambda a: a["date"],
                "weekly-attendance": lambda a: f"Week {datetime.fromisoformat(a['date']).isocalendar()[1]}",
                "monthly-attendance": lambda a: a["date"][:7],
                "quarterly-attendance": lambda a: f"Q{(int(a['date'][5:7]) - 1) // 3 + 1}",
                "yearly-attendance": lambda a: a["date"][:4]}
        return att_group(keys[report], "Period")
    if report == "school-wise":
        return att_group(lambda a: schools.get(a.get("school_id"), ""), "School")
    if report == "block-wise":
        return att_group(lambda a: blocks.get(a.get("block_id"), ""), "Block")
    if report == "class-wise":
        return att_group(lambda a: f"Std {a.get('standard','')}", "Class")
    if report in ("student-attendance-history", "low-attendance"):
        per = defaultdict(lambda: {"present": 0, "absent": 0})
        for a in att:
            per[a["student_id"]][a["status"]] += 1
        thr = float(filters.get("threshold") or 75)
        rows = []
        for sid, v in per.items():
            total = v["present"] + v["absent"]
            val = p(v["present"], total)
            if report == "low-attendance" and val >= thr:
                continue
            e = say.get(sid, {})
            rows.append({"Student ID": sid, "Student Name": students.get(sid, {}).get("name", ""),
                         "School": schools.get(e.get("school_id"), ""), "Class": e.get("standard", ""),
                         "Block": blocks.get(e.get("block_id"), ""), "Working Days": total,
                         "Present": v["present"], "Absent": v["absent"], "Attendance %": val})
        return sorted(rows, key=lambda r: r["Attendance %"])
    if report in ("course-progress", "low-progress"):
        thr = float(filters.get("threshold") or 50)
        rows = []
        for pr in prog:
            val = p(pr.get("completed_lessons", 0), pr.get("total_lessons") or 1)
            if report == "low-progress" and val >= thr:
                continue
            e = say.get(pr["student_id"], {})
            rows.append({"Student ID": pr["student_id"],
                         "Student Name": students.get(pr["student_id"], {}).get("name", ""),
                         "School": schools.get(e.get("school_id"), ""), "Class": e.get("standard", ""),
                         "Course": courses.get(pr["course_id"], {}).get("name", ""),
                         "Total Lessons": pr.get("total_lessons", 0),
                         "Completed Lessons": pr.get("completed_lessons", 0),
                         "Progress %": val, "Status": pr.get("status", "")})
        return sorted(rows, key=lambda r: r["Progress %"])
    if report == "course-completion":
        d = defaultdict(lambda: {"completed": 0, "total": 0})
        for pr in prog:
            name = courses.get(pr["course_id"], {}).get("name", "")
            d[name]["total"] += 1
            if pr.get("status") == "completed":
                d[name]["completed"] += 1
        return [{"Course": k, "Enrolled": v["total"], "Completed": v["completed"],
                 "Completion %": p(v["completed"], v["total"])} for k, v in sorted(d.items()) if k]
    if report == "academic-year":
        pres = sum(1 for a in att if a["status"] == "present")
        return [{"Academic Year": year.get("year", ""), "Students": len(say),
                 "Schools": len({r.get("school_id") for r in say.values()}),
                 "Attendance Records": len(att), "Present": pres, "Absent": len(att) - pres,
                 "Attendance %": p(pres, len(att)),
                 "Courses": len({pr["course_id"] for pr in prog}),
                 "Avg Progress %": round(sum(p(x.get("completed_lessons", 0), x.get("total_lessons") or 1)
                                             for x in prog) / len(prog), 1) if prog else 0}]
    if report == "bulk-upload":
        hist = await db.upload_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return [{"Date": h["created_at"][:19], "File Name": h["file_name"],
                 "Academic Year": h.get("academic_year", ""), "Total": h["total_records"],
                 "Imported": h["imported"], "Updated": h.get("updated", 0),
                 "Errors": h["errors"], "Uploaded By": h.get("uploaded_by", "")} for h in hist]
    if report == "students":
        rows = []
        for sid, e in say.items():
            s = students.get(sid, {})
            rows.append({"Student ID": sid, "Student Name": s.get("name", ""),
                         "Gender": s.get("gender", ""), "Class": e.get("standard", ""),
                         "Division": e.get("division", ""), "School": schools.get(e.get("school_id"), ""),
                         "Block": blocks.get(e.get("block_id"), ""), "Parent": s.get("parent_name", ""),
                         "Mobile": s.get("parent_mobile", ""), "Status": s.get("status", "")})
        return sorted(rows, key=lambda r: (r["Class"], r["Student Name"]))
    raise HTTPException(status_code=404, detail="Unknown report")


@router.get("/reports/{report}")
async def report_data(report: str, academic_year_id: str, school_id: str = "", block_id: str = "",
                      standard: str = "", date_from: str = "", date_to: str = "",
                      threshold: float = None, user: dict = Depends(get_current_user)):
    rows = await build_report(report, academic_year_id, locals())
    return {"report": report, "rows": rows, "count": len(rows)}


@router.get("/reports/{report}/export")
async def report_export(report: str, academic_year_id: str, fmt: str = "excel", school_id: str = "",
                        block_id: str = "", standard: str = "", date_from: str = "", date_to: str = "",
                        threshold: float = None, user: dict = Depends(get_current_user)):
    rows = await build_report(report, academic_year_id, locals())
    year = await db.academic_years.find_one({"id": academic_year_id}, {"_id": 0}) or {}
    title = report.replace("-", " ").title() + " Report"
    if not rows:
        rows = [{"Message": "No data available for the selected filters"}]
    if fmt == "excel":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            meta = pd.DataFrame([{"A": APP_NAME}, {"A": APP_SUB}, {"A": title},
                                 {"A": f"Academic Year: {year.get('year','')}"},
                                 {"A": f"Date Range: {date_from or 'All'} to {date_to or 'All'}"},
                                 {"A": f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"}])
            meta.to_excel(w, index=False, header=False, sheet_name="Report", startrow=0)
            pd.DataFrame(rows).to_excel(w, index=False, sheet_name="Report", startrow=7)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 headers={"Content-Disposition": f"attachment; filename={report}.xlsx"})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=24, bottomMargin=24,
                            leftMargin=20, rightMargin=20)
    styles = getSampleStyleSheet()
    brand = ParagraphStyle("brand", parent=styles["Title"], fontSize=17, textColor=colors.HexColor("#065F46"))
    story = [Paragraph(APP_NAME, brand),
             Paragraph(f"<b>{APP_SUB}</b>", styles["Normal"]), Spacer(1, 8),
             Paragraph(f"<b>{title}</b>", styles["Heading2"]),
             Paragraph(f"Academic Year: {year.get('year','')} &nbsp;&nbsp; Date Range: {date_from or 'All'} to {date_to or 'All'}", styles["Normal"]),
             Paragraph(f"Filters: School={school_id or 'All'}, Block={block_id or 'All'}, Class={standard or 'All'}", styles["Normal"]),
             Spacer(1, 12)]
    cols = list(rows[0].keys())
    data = [cols] + [[str(r.get(c, "")) for c in cols] for r in rows[:600]]
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065F46")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={report}.pdf"})
