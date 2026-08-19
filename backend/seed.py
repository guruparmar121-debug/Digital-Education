"""Seed demo data for Digital Education Program."""
import asyncio, os, random
from datetime import date, timedelta
from core import db, new_id, now_iso, hash_password

random.seed(7)

BLOCKS = [("BLK01", "Sanand", "Ahmedabad"), ("BLK02", "Dholka", "Ahmedabad"),
          ("BLK03", "Bavla", "Ahmedabad"), ("BLK04", "Mandal", "Ahmedabad")]
VILLAGES = ["Chekhla", "Kanbha", "Nani Devti", "Vasna", "Rethal", "Kesargadh", "Moraiya", "Sachana"]
SCHOOL_SUFFIX = ["Primary School", "Upper Primary School", "Kanya Shala"]
COURSE_DEFS = [("Digital Literacy Basics", "Computer", 12), ("Spoken English", "English", 20),
               ("Foundational Maths", "Mathematics", 18), ("Science Explorer", "Science", 15),
               ("Life Skills & Values", "Life Skills", 10)]
FIRST_M = ["Rahul", "Amit", "Kiran", "Jayesh", "Manoj", "Vikram", "Rohit", "Suresh", "Nilesh", "Harsh"]
FIRST_F = ["Priya", "Anita", "Meena", "Kajal", "Sneha", "Pooja", "Nisha", "Rekha", "Divya", "Bhavna"]
LAST = ["Patel", "Solanki", "Chauhan", "Rathod", "Desai", "Parmar", "Vaghela", "Makwana"]


async def wipe():
    for c in ["users", "academic_years", "blocks", "villages", "schools", "teachers", "students",
              "student_academic_years", "attendance", "courses", "student_courses",
              "student_promotions", "upload_history", "audit_logs"]:
        await db[c].delete_many({})


async def seed():
    await wipe()
    years = [
        {"id": new_id(), "year": "2024-25", "start_date": "2024-06-01", "end_date": "2025-04-30", "status": "inactive", "is_current": False},
        {"id": new_id(), "year": "2025-26", "start_date": "2025-06-01", "end_date": "2026-04-30", "status": "active", "is_current": False},
        {"id": new_id(), "year": "2026-27", "start_date": "2026-06-01", "end_date": "2027-04-30", "status": "active", "is_current": True},
        {"id": new_id(), "year": "2027-28", "start_date": "2027-06-01", "end_date": "2028-04-30", "status": "inactive", "is_current": False},
    ]
    await db.academic_years.insert_many([dict(y, created_at=now_iso()) for y in years])
    y_prev, y_cur = years[1], years[2]

    blocks = [{"id": new_id(), "block_code": c, "name": n, "district": d, "status": "active", "created_at": now_iso()}
              for c, n, d in BLOCKS]
    await db.blocks.insert_many([dict(b) for b in blocks])

    villages = []
    for i, name in enumerate(VILLAGES):
        b = blocks[i % len(blocks)]
        villages.append({"id": new_id(), "village_code": f"VIL{i+1:02d}", "name": name,
                         "block_id": b["id"], "district": b["district"], "status": "active", "created_at": now_iso()})
    await db.villages.insert_many([dict(v) for v in villages])

    schools = []
    for i, v in enumerate(villages):
        for j in range(2 if i < 4 else 1):
            schools.append({"id": new_id(), "school_code": f"SCH{len(schools)+1:03d}",
                            "name": f"{v['name']} {SCHOOL_SUFFIX[j % len(SCHOOL_SUFFIX)]}",
                            "block_id": v["block_id"], "village_id": v["id"],
                            "address": f"{v['name']}, {v['district']}",
                            "principal_name": f"{random.choice(FIRST_M)} {random.choice(LAST)}",
                            "contact": f"98{random.randint(10000000, 99999999)}",
                            "status": "active", "academic_year_id": y_cur["id"], "created_at": now_iso()})
    await db.schools.insert_many([dict(s) for s in schools])

    teachers = []
    for i, s in enumerate(schools):
        for k in range(2):
            nm = f"{random.choice(FIRST_M + FIRST_F)} {random.choice(LAST)}"
            teachers.append({"id": new_id(), "staff_code": f"STF{len(teachers)+1:03d}", "name": nm,
                             "mobile": f"97{random.randint(10000000, 99999999)}",
                             "email": f"teacher{len(teachers)+1}@dep.org", "role": "teacher",
                             "school_id": s["id"], "block_id": s["block_id"], "village_id": s["village_id"],
                             "standards": [str(5 + k), str(7 + k)], "status": "active", "created_at": now_iso()})
    await db.teachers.insert_many([dict(t) for t in teachers])

    students, says = [], []
    code = 1000
    for s in schools:
        for std in ["5", "6", "7", "8"]:
            for _ in range(random.randint(4, 7)):
                code += 1
                gender = random.choice(["Male", "Female"])
                name = f"{random.choice(FIRST_M if gender == 'Male' else FIRST_F)} {random.choice(LAST)}"
                sid = str(code)
                students.append({"id": new_id(), "student_id": sid, "name": name, "gender": gender,
                                 "dob": f"{2026 - (5 + int(std))}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                                 "parent_name": f"{random.choice(FIRST_M)} {name.split()[1]}",
                                 "parent_mobile": f"9{random.randint(100000000, 999999999)}",
                                 "admission_date": "2024-06-10", "status": "active", "created_at": now_iso()})
                prev_std = str(max(int(std) - 1, 1))
                for yr, st in ((y_prev, prev_std), (y_cur, std)):
                    says.append({"id": new_id(), "student_id": sid, "academic_year_id": yr["id"],
                                 "standard": st, "division": random.choice(["A", "B"]),
                                 "school_id": s["id"], "village_id": s["village_id"],
                                 "block_id": s["block_id"], "status": "active", "created_at": now_iso()})
    await db.students.insert_many(students)
    await db.student_academic_years.insert_many(says)

    courses = []
    for yr in (y_prev, y_cur):
        for i, (nm, subj, lessons) in enumerate(COURSE_DEFS):
            courses.append({"id": new_id(), "course_code": f"C{i+1:02d}-{yr['year']}", "name": nm,
                            "subject": subj, "description": f"{nm} module for rural students",
                            "academic_year_id": yr["id"], "standard": "", "school_id": "", "block_id": "",
                            "total_modules": max(lessons // 4, 1), "total_lessons": lessons,
                            "duration": f"{lessons * 2} hours", "start_date": yr["start_date"],
                            "end_date": yr["end_date"], "status": "active", "created_at": now_iso()})
    await db.courses.insert_many([dict(c) for c in courses])

    # attendance + progress
    att_docs, sc_docs = [], []
    say_by_year = {}
    for r in says:
        say_by_year.setdefault(r["academic_year_id"], []).append(r)
    for yr in (y_prev, y_cur):
        start = date.fromisoformat(yr["start_date"])
        days = [start + timedelta(days=d) for d in range(0, 150, 3)]
        days = [d for d in days if d.weekday() < 6][:30]
        year_courses = [c for c in courses if c["academic_year_id"] == yr["id"]]
        for r in say_by_year[yr["id"]]:
            bias = random.uniform(0.6, 0.99)
            for d in days:
                att_docs.append({"id": new_id(), "student_id": r["student_id"],
                                 "academic_year_id": yr["id"], "date": d.isoformat(),
                                 "status": "present" if random.random() < bias else "absent",
                                 "school_id": r["school_id"], "standard": r["standard"],
                                 "division": r["division"], "village_id": r["village_id"],
                                 "block_id": r["block_id"], "marked_by": "Seed", "created_at": now_iso()})
            for c in random.sample(year_courses, 3):
                total = c["total_lessons"]
                done = random.choice([0, random.randint(1, total - 1), total])
                status = "not_started" if done == 0 else ("completed" if done >= total else "in_progress")
                sc_docs.append({"id": new_id(), "student_id": r["student_id"], "course_id": c["id"],
                                "academic_year_id": yr["id"], "total_lessons": total,
                                "completed_lessons": done,
                                "start_date": yr["start_date"] if done else "",
                                "last_activity": (start + timedelta(days=random.randint(10, 140))).isoformat(),
                                "completion_date": (start + timedelta(days=120)).isoformat() if status == "completed" else "",
                                "status": status, "created_at": now_iso()})
    for i in range(0, len(att_docs), 5000):
        await db.attendance.insert_many(att_docs[i:i + 5000])
    for i in range(0, len(sc_docs), 5000):
        await db.student_courses.insert_many(sc_docs[i:i + 5000])

    demo_student = students[0]
    users = [
        {"name": "System Admin", "email": os.environ.get("ADMIN_EMAIL", "admin@dep.org"),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123"), "role": "admin"},
        {"name": "Management User", "email": "management@dep.org", "password": "manage123", "role": "management"},
        {"name": "Block Coordinator", "email": "coordinator@dep.org", "password": "coord123",
         "role": "coordinator", "block_ids": [blocks[0]["id"], blocks[1]["id"]]},
        {"name": teachers[0]["name"], "email": "teacher@dep.org", "password": "teach123",
         "role": "teacher", "school_id": schools[0]["id"]},
        {"name": demo_student["name"], "email": "student@dep.org", "password": "stud123",
         "role": "student", "student_code": demo_student["student_id"]},
    ]
    await db.users.insert_many([{**{k: v for k, v in u.items() if k != "password"},
                                 "id": new_id(), "status": "active",
                                 "password_hash": hash_password(u["password"]),
                                 "created_at": now_iso()} for u in users])
    print(f"Seeded: {len(students)} students, {len(schools)} schools, {len(att_docs)} attendance, {len(sc_docs)} progress")
    print(f"Demo student code: {demo_student['student_id']}")


if __name__ == "__main__":
    asyncio.run(seed())
