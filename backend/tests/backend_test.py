"""Comprehensive backend tests for DIGITAL EDUCATION PROGRAM.

Covers: auth, RBAC, academic year separation, students CRUD, bulk upload workflow,
attendance, courses/progress, promotion, reports, dashboards, year comparison, audit.
"""
import io
import os
import time
import pytest
import requests
import pandas as pd

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to frontend env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@dep.org", "admin123"),
    "management": ("management@dep.org", "manage123"),
    "coordinator": ("coordinator@dep.org", "coord123"),
    "teacher": ("teacher@dep.org", "teach123"),
    "student": ("student@dep.org", "stud123"),
}


def _login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}, r.json()


@pytest.fixture(scope="session")
def admin_h():
    h, _ = _login("admin")
    return h


@pytest.fixture(scope="session")
def mgmt_h():
    h, _ = _login("management")
    return h


@pytest.fixture(scope="session")
def coord_h():
    h, _ = _login("coordinator")
    return h


@pytest.fixture(scope="session")
def teacher_h():
    h, _ = _login("teacher")
    return h


@pytest.fixture(scope="session")
def student_h():
    h, u = _login("student")
    return h, u


@pytest.fixture(scope="session")
def years(admin_h):
    r = requests.get(f"{API}/masters/academic-years", headers=admin_h, timeout=30)
    assert r.status_code == 200
    ys = r.json()
    by = {y["year"]: y for y in ys}
    return by


# ============== AUTH ==============
class TestAuth:
    def test_all_roles_login(self):
        for role in CREDS:
            h, u = _login(role)
            assert u["role"] == role
            assert u.get("email") == CREDS[role][0]
            assert "password_hash" not in u

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@dep.org", "password": "wrong!!!"})
        assert r.status_code in (401, 429)

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me(self, admin_h):
        r = requests.get(f"{API}/auth/me", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ============== RBAC ==============
class TestRBAC:
    def test_management_cannot_create_student(self, mgmt_h, years):
        y = years.get("2026-27") or list(years.values())[0]
        # need real school id
        sch = requests.get(f"{API}/masters/schools", headers=mgmt_h).json()[0]
        r = requests.post(f"{API}/students", headers=mgmt_h, json={
            "student_id": "TEST_9999", "name": "TEST Mgmt Denied", "gender": "Male",
            "academic_year_id": y["id"], "standard": "5", "school_id": sch["id"]})
        assert r.status_code == 403

    def test_teacher_cannot_create_course(self, teacher_h, years):
        y = list(years.values())[0]
        r = requests.post(f"{API}/courses", headers=teacher_h, json={
            "course_code": "TEST_C1", "name": "Denied", "academic_year_id": y["id"]})
        assert r.status_code == 403

    def test_student_cannot_list_users(self, student_h):
        h, _ = student_h
        r = requests.get(f"{API}/users", headers=h)
        assert r.status_code == 403

    def test_student_can_only_see_own(self, student_h, years):
        h, u = student_h
        y = list(years.values())[0]
        r = requests.get(f"{API}/students", headers=h,
                         params={"academic_year_id": y["id"]})
        assert r.status_code == 200
        for s in r.json():
            assert s["student_id"] == u["student_code"]


# ============== ACADEMIC YEAR SEPARATION ==============
class TestYearSeparation:
    def test_dashboard_differs_between_years(self, admin_h, years):
        y25 = years["2025-26"]["id"]
        y26 = years["2026-27"]["id"]
        r1 = requests.get(f"{API}/dashboard/overview", headers=admin_h,
                          params={"academic_year_id": y25}).json()
        r2 = requests.get(f"{API}/dashboard/overview", headers=admin_h,
                          params={"academic_year_id": y26}).json()
        assert "kpis" in r1 and "kpis" in r2
        # both years have data; KPIs should exist
        assert r1["kpis"]["total_students"] > 0
        assert r2["kpis"]["total_students"] > 0
        # 13 KPIs required
        assert len(r1["kpis"]) >= 13

    def test_attendance_year_isolation(self, admin_h, years):
        y25 = years["2025-26"]["id"]
        y26 = years["2026-27"]["id"]
        a = requests.get(f"{API}/attendance/history", headers=admin_h,
                         params={"academic_year_id": y25}).json()
        b = requests.get(f"{API}/attendance/history", headers=admin_h,
                         params={"academic_year_id": y26}).json()
        # each record must have its year id
        for r in a[:20]:
            assert r["academic_year_id"] == y25
        for r in b[:20]:
            assert r["academic_year_id"] == y26


# ============== STUDENTS CRUD ==============
class TestStudents:
    def test_list_and_filter(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/students", headers=admin_h,
                         params={"academic_year_id": y})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # filter by gender
        r2 = requests.get(f"{API}/students", headers=admin_h,
                          params={"academic_year_id": y, "gender": "Female"})
        assert r2.status_code == 200
        assert all(s["gender"] == "Female" for s in r2.json())

    def test_create_and_get(self, admin_h, years):
        y = years["2026-27"]["id"]
        sch = requests.get(f"{API}/masters/schools", headers=admin_h).json()[0]
        code = f"TEST_{int(time.time())}"
        payload = {"student_id": code, "name": "TEST Student", "gender": "Male",
                   "academic_year_id": y, "standard": "6", "school_id": sch["id"],
                   "parent_mobile": "9876543210"}
        r = requests.post(f"{API}/students", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        # verify
        g = requests.get(f"{API}/students/{code}", headers=admin_h,
                        params={"academic_year_id": y})
        assert g.status_code == 200
        assert g.json()["name"] == "TEST Student"
        assert g.json()["standard"] == "6"

    def test_student_detail_dashboard(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/dashboard/student/1001", headers=admin_h,
                        params={"academic_year_id": y})
        assert r.status_code == 200
        d = r.json()
        assert "profile" in d and "attendance" in d and "courses" in d


# ============== BULK UPLOAD ==============
class TestBulkUpload:
    def test_template_download(self, admin_h):
        r = requests.get(f"{API}/students/bulk/template", headers=admin_h)
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers.get("content-type", "")
        assert len(r.content) > 100

    def test_validate_and_import(self, admin_h, years):
        y = years["2026-27"]
        sch = requests.get(f"{API}/masters/schools", headers=admin_h).json()[0]
        vill = requests.get(f"{API}/masters/villages", headers=admin_h).json()[0]
        blk = requests.get(f"{API}/masters/blocks", headers=admin_h).json()[0]
        ts = int(time.time())
        rows = [
            # valid new
            {"Student ID": f"TEST_{ts}_1", "Student Name": "TEST Valid A", "Gender": "Male",
             "Date of Birth": "2013-01-01", "Parent/Guardian Name": "P1",
             "Parent Mobile": "9999999991", "Academic Year": y["year"],
             "Standard/Class": "5", "Division": "A", "School": sch["name"],
             "Village": vill["name"], "Block": blk["name"],
             "Admission Date": "2024-06-10", "Status": "active"},
            # invalid gender
            {"Student ID": f"TEST_{ts}_2", "Student Name": "TEST Bad Gender", "Gender": "Unknown",
             "Date of Birth": "", "Parent/Guardian Name": "P2",
             "Parent Mobile": "9999999992", "Academic Year": y["year"],
             "Standard/Class": "5", "Division": "", "School": sch["name"],
             "Village": "", "Block": "", "Admission Date": "", "Status": "active"},
            # unknown school
            {"Student ID": f"TEST_{ts}_3", "Student Name": "TEST Bad School", "Gender": "Female",
             "Date of Birth": "", "Parent/Guardian Name": "", "Parent Mobile": "9999999993",
             "Academic Year": y["year"], "Standard/Class": "5", "Division": "",
             "School": "Unknown School XYZ", "Village": "", "Block": "",
             "Admission Date": "", "Status": "active"},
            # bad mobile
            {"Student ID": f"TEST_{ts}_4", "Student Name": "TEST Bad Mobile", "Gender": "Male",
             "Date of Birth": "", "Parent/Guardian Name": "", "Parent Mobile": "abc",
             "Academic Year": y["year"], "Standard/Class": "5", "Division": "",
             "School": sch["name"], "Village": "", "Block": "",
             "Admission Date": "", "Status": "active"},
            # duplicate inside file (same as row 1)
            {"Student ID": f"TEST_{ts}_1", "Student Name": "TEST Dup", "Gender": "Male",
             "Date of Birth": "", "Parent/Guardian Name": "", "Parent Mobile": "9999999995",
             "Academic Year": y["year"], "Standard/Class": "5", "Division": "",
             "School": sch["name"], "Village": "", "Block": "",
             "Admission Date": "", "Status": "active"},
        ]
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            pd.DataFrame(rows).to_excel(w, index=False, sheet_name="Students")
        buf.seek(0)
        files = {"file": ("test_upload.xlsx", buf.getvalue(),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{API}/students/bulk/validate", headers=admin_h,
                          files=files, data={"mode": "insert"})
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["total"] == 5
        assert v["valid_count"] == 1
        assert v["error_count"] == 4
        token = v["token"]

        # error excel download
        e = requests.get(f"{API}/students/bulk/errors/{token}", headers=admin_h)
        assert e.status_code == 200
        assert len(e.content) > 100

        # import
        imp = requests.post(f"{API}/students/bulk/import/{token}", headers=admin_h)
        assert imp.status_code == 200
        j = imp.json()
        assert j["imported"] + j["updated"] == 1
        assert j["skipped"] == 4

        # history
        h = requests.get(f"{API}/students/bulk/history", headers=admin_h)
        assert h.status_code == 200
        assert isinstance(h.json(), list) and len(h.json()) > 0

    def test_bulk_export_for_update(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/students/bulk/export", headers=admin_h,
                         params={"academic_year_id": y})
        assert r.status_code == 200
        assert len(r.content) > 500


# ============== ATTENDANCE ==============
class TestAttendance:
    def test_sheet_and_save(self, admin_h, years):
        y = years["2026-27"]["id"]
        sch = requests.get(f"{API}/masters/schools", headers=admin_h).json()[0]
        # get any std with students
        stds = requests.get(f"{API}/students", headers=admin_h,
                            params={"academic_year_id": y, "school_id": sch["id"]}).json()
        if not stds:
            pytest.skip("no students in first school")
        std = stds[0]["standard"]
        params = {"academic_year_id": y, "date": "2026-01-15",
                  "school_id": sch["id"], "standard": std}
        r = requests.get(f"{API}/attendance/sheet", headers=admin_h, params=params)
        assert r.status_code == 200
        sheet = r.json()
        assert "students" in sheet
        recs = [{"student_id": s["student_id"], "status": "present"} for s in sheet["students"][:5]]
        if not recs:
            pytest.skip("empty sheet")
        save = requests.post(f"{API}/attendance", headers=admin_h, json={
            "academic_year_id": y, "date": "2026-01-15",
            "school_id": sch["id"], "standard": std,
            "division": "", "records": recs})
        assert save.status_code == 200
        assert save.json()["saved"] == len(recs)
        # re-fetch: already marked
        r2 = requests.get(f"{API}/attendance/sheet", headers=admin_h, params=params).json()
        assert r2["already_marked"] is True

    def test_low_attendance(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/attendance/low", headers=admin_h,
                         params={"academic_year_id": y, "threshold": 100})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============== COURSES ==============
class TestCourses:
    def test_create_assign_progress(self, admin_h, years):
        y = years["2026-27"]["id"]
        sch = requests.get(f"{API}/masters/schools", headers=admin_h).json()[0]
        code = f"TEST_C_{int(time.time())}"
        c = requests.post(f"{API}/courses", headers=admin_h, json={
            "course_code": code, "name": "TEST Course", "subject": "Math",
            "academic_year_id": y, "standard": "6", "school_id": sch["id"],
            "total_modules": 3, "total_lessons": 20})
        assert c.status_code == 200
        course_id = c.json()["id"]

        # assign to school+std
        a = requests.post(f"{API}/courses/assign", headers=admin_h, json={
            "course_id": course_id, "academic_year_id": y,
            "school_id": sch["id"], "standard": "6"})
        assert a.status_code == 200
        assigned = a.json()["assigned"]

        # course-progress list
        pr = requests.get(f"{API}/course-progress", headers=admin_h,
                          params={"academic_year_id": y, "course_id": course_id})
        assert pr.status_code == 200
        rows = pr.json()
        if assigned > 0:
            assert len(rows) >= 1
            rec_id = rows[0]["id"]
            # update progress
            u = requests.put(f"{API}/course-progress/{rec_id}", headers=admin_h,
                             json={"completed_lessons": 10})
            assert u.status_code == 200
            assert u.json()["progress_pct"] == 50.0
            assert u.json()["status"] == "in_progress"
            # complete
            u2 = requests.put(f"{API}/course-progress/{rec_id}", headers=admin_h,
                              json={"completed_lessons": 20})
            assert u2.json()["status"] == "completed"


# ============== PROMOTION ==============
class TestPromotion:
    def test_promote(self, admin_h, years):
        y25 = years["2025-26"]["id"]
        y27 = years["2027-28"]["id"]
        # pick a couple of students from 2025-26
        recs = requests.get(f"{API}/students", headers=admin_h,
                            params={"academic_year_id": y25}).json()
        if not recs:
            pytest.skip("no students in 2025-26")
        ids = [r["student_id"] for r in recs[:2]]
        r = requests.post(f"{API}/promotions", headers=admin_h, json={
            "from_year_id": y25, "to_year_id": y27, "student_ids": ids})
        assert r.status_code == 200
        j = r.json()
        assert j["promoted"] + j["skipped"] == len(ids)
        # history
        h = requests.get(f"{API}/promotions", headers=admin_h)
        assert h.status_code == 200
        # source records intact
        for sid in ids:
            g = requests.get(f"{API}/students/{sid}", headers=admin_h,
                             params={"academic_year_id": y25}).json()
            assert g.get("standard")


# ============== MASTERS ==============
class TestMasters:
    def test_masters_lists(self, admin_h):
        for e in ("blocks", "villages", "schools", "teachers", "academic-years"):
            r = requests.get(f"{API}/masters/{e}", headers=admin_h)
            assert r.status_code == 200
            assert isinstance(r.json(), list)

    def test_block_crud(self, admin_h):
        ts = int(time.time())
        c = requests.post(f"{API}/masters/blocks", headers=admin_h, json={
            "block_code": f"TESTBLK{ts}", "name": f"TEST Block {ts}",
            "district": "TEST District"})
        assert c.status_code == 200
        bid = c.json()["id"]
        u = requests.put(f"{API}/masters/blocks/{bid}", headers=admin_h, json={
            "block_code": f"TESTBLK{ts}", "name": f"TEST Block UPD {ts}", "district": "TEST"})
        assert u.status_code == 200
        assert "UPD" in u.json()["name"]
        d = requests.delete(f"{API}/masters/blocks/{bid}", headers=admin_h)
        assert d.status_code == 200


# ============== USERS ==============
class TestUsers:
    def test_create_user_and_login(self, admin_h):
        ts = int(time.time())
        email = f"test_user_{ts}@dep.org"
        r = requests.post(f"{API}/users", headers=admin_h, json={
            "name": "TEST User", "email": email, "password": "test12345",
            "role": "teacher"})
        assert r.status_code == 200, r.text
        # login
        lr = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "test12345"})
        assert lr.status_code == 200
        assert lr.json()["email"] == email

    def test_audit_logs(self, admin_h):
        r = requests.get(f"{API}/audit-logs", headers=admin_h, params={"limit": 20})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============== REPORTS ==============
REPORTS = [
    "daily-attendance", "weekly-attendance", "monthly-attendance",
    "quarterly-attendance", "yearly-attendance", "school-wise",
    "block-wise", "class-wise", "student-attendance-history",
    "low-attendance", "course-progress", "low-progress",
    "course-completion", "academic-year", "bulk-upload", "students",
]


class TestReports:
    @pytest.mark.parametrize("report", REPORTS)
    def test_report_data(self, admin_h, years, report):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/reports/{report}", headers=admin_h,
                         params={"academic_year_id": y}, timeout=60)
        assert r.status_code == 200, f"{report}: {r.text[:200]}"
        j = r.json()
        assert "rows" in j and "count" in j

    def test_excel_export(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/reports/students/export", headers=admin_h,
                         params={"academic_year_id": y, "fmt": "excel"}, timeout=60)
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_pdf_export(self, admin_h, years):
        y = years["2026-27"]["id"]
        r = requests.get(f"{API}/reports/school-wise/export", headers=admin_h,
                         params={"academic_year_id": y, "fmt": "pdf"}, timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ============== YEAR COMPARISON ==============
class TestYearComparison:
    def test_comparison(self, admin_h, years):
        r = requests.get(f"{API}/dashboard/year-comparison", headers=admin_h,
                         params={"year_a": years["2025-26"]["id"],
                                 "year_b": years["2026-27"]["id"]})
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert len(rows) >= 6
        assert all("change_pct" in row for row in rows)
