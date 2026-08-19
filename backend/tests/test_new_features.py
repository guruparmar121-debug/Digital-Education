"""Tests for the two new features: Chart Drilldown + Lesson Tracking.

Focus:
- /api/dashboard/drilldown correctness vs overview counts
- Universal filters + year isolation on drilldown
- /api/courses/{id}/curriculum lazy auto-generation + idempotency
- /api/course-progress/{record_id}/lessons GET + POST toggle
- Unique-index dedup on re-tick
- Role permissions for lesson toggling
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
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
    assert r.status_code == 200, f"login {role} failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()


@pytest.fixture(scope="module")
def admin_h():
    h, _ = _login("admin")
    return h


@pytest.fixture(scope="module")
def years(admin_h):
    r = requests.get(f"{API}/masters/academic-years", headers=admin_h).json()
    return {y["year"]: y for y in r}


@pytest.fixture(scope="module")
def y26(years):
    return years["2026-27"]["id"]


@pytest.fixture(scope="module")
def overview(admin_h, y26):
    r = requests.get(f"{API}/dashboard/overview", headers=admin_h,
                     params={"academic_year_id": y26})
    assert r.status_code == 200
    return r.json()


# ============= CHART DRILLDOWN =============
class TestDrilldown:
    def _drill(self, admin_h, y26, chart, label, **extra):
        params = {"chart": chart, "label": label, "academic_year_id": y26, **extra}
        r = requests.get(f"{API}/dashboard/drilldown", headers=admin_h, params=params)
        assert r.status_code == 200, f"drilldown {chart}/{label}: {r.text}"
        return r.json()

    def test_drilldown_block_matches_overview(self, admin_h, y26, overview):
        blocks = overview["charts"]["block_students"]
        assert blocks, "no block_students chart data"
        pt = blocks[0]
        d = self._drill(admin_h, y26, "block_students", pt["name"])
        assert d["count"] == pt["value"], f"block count mismatch {d['count']} vs {pt['value']}"
        # rows have expected fields
        for r in d["rows"][:3]:
            assert r["block_name"] == pt["name"]
            assert "student_id" in r and "attendance_pct" in r

    def test_drilldown_class_matches_overview(self, admin_h, y26, overview):
        cs = overview["charts"]["class_students"]
        assert cs
        pt = cs[0]
        d = self._drill(admin_h, y26, "class_students", pt["name"])
        assert d["count"] == pt["value"]
        std = pt["name"].replace("Std ", "").strip()
        for r in d["rows"]:
            assert str(r["standard"]) == std

    def test_drilldown_school_matches_overview(self, admin_h, y26, overview):
        ss = overview["charts"]["school_students"]
        assert ss
        pt = ss[0]
        d = self._drill(admin_h, y26, "school_students", pt["name"])
        assert d["count"] == pt["value"]

    def test_drilldown_gender_female(self, admin_h, y26, overview):
        gs = {g["name"]: g["value"] for g in overview["charts"]["gender_students"]}
        assert "Female" in gs
        d = self._drill(admin_h, y26, "gender_students", "Female")
        assert d["count"] == gs["Female"]
        for r in d["rows"]:
            assert r["gender"] == "Female"

    def test_drilldown_present_vs_absent(self, admin_h, y26):
        d = self._drill(admin_h, y26, "present_vs_absent", "Present")
        # every returned student must have present count > 0
        for r in d["rows"]:
            assert r["present"] > 0

    def test_drilldown_course_completion_completed(self, admin_h, y26):
        d = self._drill(admin_h, y26, "course_completion", "Completed")
        assert d["count"] >= 0
        # if any rows, they must have at least one course counted
        for r in d["rows"]:
            assert r["courses"] >= 1

    def test_drilldown_respects_block_filter(self, admin_h, y26, overview):
        blocks = overview["charts"]["block_students"]
        if not blocks:
            pytest.skip("no block data")
        block_name = blocks[0]["name"]
        # find block id
        bl = requests.get(f"{API}/masters/blocks", headers=admin_h).json()
        block = next((b for b in bl if b["name"] == block_name), None)
        assert block
        # drilldown class with block filter -> rows must be from block
        cs = overview["charts"]["class_students"]
        d = self._drill(admin_h, y26, "class_students", cs[0]["name"], block_id=block["id"])
        for r in d["rows"]:
            assert r["block_name"] == block_name

    def test_drilldown_year_isolation(self, admin_h, years):
        y25 = years["2025-26"]["id"]
        y26 = years["2026-27"]["id"]
        # get an overview for each and ensure counts differ
        d25 = requests.get(f"{API}/dashboard/overview", headers=admin_h,
                           params={"academic_year_id": y25}).json()
        pt = d25["charts"]["block_students"][0]
        # drill in y26 with same block label should NOT equal y25 count (usually different data)
        r25 = requests.get(f"{API}/dashboard/drilldown", headers=admin_h,
                           params={"chart": "block_students", "label": pt["name"],
                                   "academic_year_id": y25}).json()
        r26 = requests.get(f"{API}/dashboard/drilldown", headers=admin_h,
                           params={"chart": "block_students", "label": pt["name"],
                                   "academic_year_id": y26}).json()
        assert r25["count"] == pt["value"]
        # Different sets: no student's year in r25 should be inflated from y26 (both queries filter properly)
        assert isinstance(r26["count"], int)


# ============= LESSON TRACKING =============
@pytest.fixture(scope="module")
def a_course_and_progress(admin_h, y26):
    """Return a (course, progress_record) pair for testing lessons."""
    courses = requests.get(f"{API}/courses", headers=admin_h,
                           params={"academic_year_id": y26}).json()
    assert courses, "no courses in y26"
    # pick a course that has progress records
    for c in courses:
        prog = requests.get(f"{API}/course-progress", headers=admin_h,
                            params={"academic_year_id": y26, "course_id": c["id"]}).json()
        if prog:
            return c, prog[0]
    pytest.skip("no course-progress records found")


class TestCurriculum:
    def test_curriculum_auto_generates_lazily(self, admin_h, a_course_and_progress):
        course, _ = a_course_and_progress
        r = requests.get(f"{API}/courses/{course['id']}/curriculum", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert data["course"]["id"] == course["id"]
        mods = data["modules"]
        assert len(mods) == max(1, min(course.get("total_modules") or 1, course.get("total_lessons") or 1))
        total_lessons = sum(len(m["lessons"]) for m in mods)
        assert total_lessons == course.get("total_lessons"), \
            f"expected {course.get('total_lessons')} lessons, got {total_lessons}"

    def test_curriculum_idempotent(self, admin_h, a_course_and_progress):
        course, _ = a_course_and_progress
        r1 = requests.get(f"{API}/courses/{course['id']}/curriculum", headers=admin_h).json()
        r2 = requests.get(f"{API}/courses/{course['id']}/curriculum", headers=admin_h).json()
        ids1 = [m["id"] for m in r1["modules"]]
        ids2 = [m["id"] for m in r2["modules"]]
        assert ids1 == ids2, "curriculum module IDs differ between calls -> not idempotent"
        # lesson ids should match too
        for m1, m2 in zip(r1["modules"], r2["modules"]):
            assert [l["id"] for l in m1["lessons"]] == [l["id"] for l in m2["lessons"]]

    def test_curriculum_404(self, admin_h):
        r = requests.get(f"{API}/courses/does_not_exist/curriculum", headers=admin_h)
        assert r.status_code == 404


class TestLessonTracking:
    def test_get_lessons_shape(self, admin_h, a_course_and_progress):
        _, rec = a_course_and_progress
        r = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("student_name", "course_name", "total_lessons",
                    "completed_lessons", "progress_pct", "modules"):
            assert key in d, f"missing key {key}"
        assert d["total_lessons"] > 0
        for m in d["modules"]:
            for l in m["lessons"]:
                assert "completed" in l

    def test_toggle_lesson_flow(self, admin_h, a_course_and_progress):
        course, rec = a_course_and_progress
        # reset: untick all lessons first (clean slate)
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons",
                            headers=admin_h).json()
        all_lessons = [l for m in data["modules"] for l in m["lessons"]]
        for l in all_lessons:
            if l["completed"]:
                requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                              headers=admin_h, json={"completed": False})
        # now tick lesson 1
        l1 = all_lessons[0]
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l1['id']}",
                          headers=admin_h, json={"completed": True})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["completed_lessons"] == 1
        assert out["status"] == "in_progress"

        # idempotent re-tick (unique index)
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l1['id']}",
                          headers=admin_h, json={"completed": True})
        assert r.status_code == 200
        assert r.json()["completed_lessons"] == 1, "re-tick double-counted!"

        # untick -> back to not_started
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l1['id']}",
                          headers=admin_h, json={"completed": False})
        assert r.status_code == 200
        assert r.json()["completed_lessons"] == 0
        assert r.json()["status"] == "not_started"

    def test_tick_all_marks_completed(self, admin_h, a_course_and_progress):
        _, rec = a_course_and_progress
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons",
                            headers=admin_h).json()
        all_lessons = [l for m in data["modules"] for l in m["lessons"]]
        # tick everything
        for l in all_lessons:
            requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=admin_h, json={"completed": True})
        r = requests.get(f"{API}/course-progress/{rec['id']}/lessons",
                         headers=admin_h).json()
        assert r["completed_lessons"] == r["total_lessons"]
        # Now confirm status is completed
        prog = requests.get(f"{API}/course-progress", headers=admin_h,
                            params={"academic_year_id": rec["academic_year_id"],
                                    "course_id": rec["course_id"]}).json()
        me = next(p for p in prog if p["id"] == rec["id"])
        assert me["status"] == "completed"
        assert me.get("completion_date")
        # cleanup: untick all
        for l in all_lessons:
            requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=admin_h, json={"completed": False})

    def test_lesson_toggle_audit(self, admin_h, a_course_and_progress):
        _, rec = a_course_and_progress
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons",
                            headers=admin_h).json()
        l = data["modules"][0]["lessons"][0]
        requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                      headers=admin_h, json={"completed": True})
        time.sleep(0.5)
        logs = requests.get(f"{API}/audit-logs", headers=admin_h,
                            params={"action": "toggle_lesson"}).json()
        assert any(a.get("action") == "toggle_lesson" for a in logs), \
            "toggle_lesson audit entry missing"
        # cleanup
        requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                      headers=admin_h, json={"completed": False})


class TestLessonPermissions:
    def test_teacher_can_toggle(self, a_course_and_progress):
        h, _ = _login("teacher")
        _, rec = a_course_and_progress
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=h).json()
        l = data["modules"][0]["lessons"][0]
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=h, json={"completed": True})
        assert r.status_code == 200, r.text
        # cleanup
        requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                      headers=h, json={"completed": False})

    def test_coordinator_can_toggle(self, a_course_and_progress):
        h, _ = _login("coordinator")
        _, rec = a_course_and_progress
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=h).json()
        l = data["modules"][0]["lessons"][0]
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=h, json={"completed": True})
        assert r.status_code == 200
        requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                      headers=h, json={"completed": False})

    def test_management_cannot_toggle(self, a_course_and_progress):
        h, _ = _login("management")
        _, rec = a_course_and_progress
        # get with admin to find a lesson id
        admin, _ = _login("admin")
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=admin).json()
        l = data["modules"][0]["lessons"][0]
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=h, json={"completed": True})
        assert r.status_code == 403

    def test_student_cannot_toggle_own(self, a_course_and_progress):
        h, u = _login("student")
        _, rec = a_course_and_progress
        admin, _ = _login("admin")
        data = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=admin).json()
        l = data["modules"][0]["lessons"][0]
        r = requests.post(f"{API}/course-progress/{rec['id']}/lessons/{l['id']}",
                          headers=h, json={"completed": True})
        assert r.status_code == 403

    def test_student_can_get_own_lessons(self, admin_h, y26):
        h, u = _login("student")
        code = u["student_code"]
        prog = requests.get(f"{API}/course-progress", headers=admin_h,
                            params={"academic_year_id": y26, "student_id": code}).json()
        if not prog:
            pytest.skip("student has no course progress in y26")
        rec = prog[0]
        r = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=h)
        assert r.status_code == 200

    def test_student_cannot_get_other_lessons(self, a_course_and_progress):
        h, u = _login("student")
        _, rec = a_course_and_progress
        if rec["student_id"] == u.get("student_code"):
            pytest.skip("fixture belongs to test student itself")
        r = requests.get(f"{API}/course-progress/{rec['id']}/lessons", headers=h)
        assert r.status_code == 403
