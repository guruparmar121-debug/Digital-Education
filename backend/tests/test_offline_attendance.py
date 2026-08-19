"""Tests for offline attendance sync endpoint POST /api/attendance/sync.

Focus:
- Endpoint accepts SyncIn payload and returns batches_synced/records_saved/results
- Idempotency: repeat sync must not create duplicate rows
- RBAC: admin/coordinator/teacher can sync; management/student get 403
- Academic-year isolation
- Audit log entry created
- Multi-batch queue (multiple classes / dates) sync together
"""
import os
import time
import uuid
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
    assert r.status_code == 200, f"login {role}: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin")


@pytest.fixture(scope="module")
def years(admin_h):
    r = requests.get(f"{API}/masters/academic-years", headers=admin_h).json()
    return {y["year"]: y for y in r}


@pytest.fixture(scope="module")
def y26(years):
    return years["2026-27"]["id"]


@pytest.fixture(scope="module")
def sample_sheet(admin_h, y26):
    """Find a school+standard with at least 2 active students in y26."""
    schools = requests.get(f"{API}/masters/schools", headers=admin_h).json()
    for school in schools:
        for std in ["1", "2", "3", "4", "5", "6", "7", "8"]:
            r = requests.get(f"{API}/attendance/sheet", headers=admin_h,
                             params={"academic_year_id": y26, "date": "2026-09-01",
                                     "school_id": school["id"], "standard": std})
            if r.status_code == 200 and len(r.json().get("students", [])) >= 2:
                return {"school_id": school["id"], "standard": std,
                        "students": r.json()["students"]}
    pytest.skip("no school/std combo with >=2 students found")


def _unique_date():
    """Use unique dates per test run so cleanup is simple and idempotency measurable."""
    # future-ish dates not otherwise seeded
    return time.strftime("2026-12-%d", time.gmtime(1735603200 + int(uuid.uuid4().int % 200000)))


class TestSyncEndpoint:
    def test_sync_accepts_batch_and_returns_shape(self, admin_h, y26, sample_sheet):
        date = _unique_date()
        payload = {"batches": [{
            "academic_year_id": y26, "date": date,
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": s["student_id"], "status": "present"}
                        for s in sample_sheet["students"][:2]],
        }]}
        r = requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["batches_synced"] == 1
        assert data["records_saved"] == 2
        assert isinstance(data["results"], list) and len(data["results"]) == 1
        assert data["results"][0]["saved"] == 2

    def test_sync_idempotent(self, admin_h, y26, sample_sheet):
        date = _unique_date()
        payload = {"batches": [{
            "academic_year_id": y26, "date": date,
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": s["student_id"], "status": "present"}
                        for s in sample_sheet["students"][:2]],
        }]}
        # first sync
        r1 = requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload)
        assert r1.status_code == 200
        # count via history
        h1 = requests.get(f"{API}/attendance/history", headers=admin_h,
                         params={"academic_year_id": y26,
                                 "school_id": sample_sheet["school_id"],
                                 "standard": sample_sheet["standard"],
                                 "date_from": date, "date_to": date}).json()
        c1 = len(h1)
        # repeat same payload
        r2 = requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload)
        assert r2.status_code == 200
        h2 = requests.get(f"{API}/attendance/history", headers=admin_h,
                         params={"academic_year_id": y26,
                                 "school_id": sample_sheet["school_id"],
                                 "standard": sample_sheet["standard"],
                                 "date_from": date, "date_to": date}).json()
        c2 = len(h2)
        assert c1 == c2, f"idempotency broken: {c1} -> {c2}"
        assert c1 == 2

    def test_sync_multi_batch(self, admin_h, y26, sample_sheet):
        d1, d2 = _unique_date(), _unique_date()
        while d1 == d2:
            d2 = _unique_date()
        payload = {"batches": [
            {"academic_year_id": y26, "date": d1,
             "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
             "division": "",
             "records": [{"student_id": sample_sheet["students"][0]["student_id"], "status": "present"}]},
            {"academic_year_id": y26, "date": d2,
             "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
             "division": "",
             "records": [{"student_id": sample_sheet["students"][0]["student_id"], "status": "absent"}]},
        ]}
        r = requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["batches_synced"] == 2
        assert d["records_saved"] == 2

    def test_sync_year_isolation(self, admin_h, years, sample_sheet):
        y25 = years["2025-26"]["id"]
        y26 = years["2026-27"]["id"]
        date = _unique_date()
        payload_26 = {"batches": [{
            "academic_year_id": y26, "date": date,
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": sample_sheet["students"][0]["student_id"], "status": "present"}],
        }]}
        r = requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload_26)
        assert r.status_code == 200
        # y25 must not see this record
        h25 = requests.get(f"{API}/attendance/history", headers=admin_h,
                          params={"academic_year_id": y25,
                                  "date_from": date, "date_to": date}).json()
        for rec in h25:
            assert rec["academic_year_id"] == y25

    def test_sync_audit_log(self, admin_h, y26, sample_sheet):
        payload = {"batches": [{
            "academic_year_id": y26, "date": _unique_date(),
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": sample_sheet["students"][0]["student_id"], "status": "present"}],
        }]}
        requests.post(f"{API}/attendance/sync", headers=admin_h, json=payload)
        time.sleep(0.4)
        logs = requests.get(f"{API}/audit-logs", headers=admin_h,
                            params={"action": "sync_offline_attendance"}).json()
        assert any(a.get("action") == "sync_offline_attendance" for a in logs)


class TestSyncRBAC:
    def _payload(self, y26, sample_sheet):
        return {"batches": [{
            "academic_year_id": y26, "date": _unique_date(),
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": sample_sheet["students"][0]["student_id"], "status": "present"}],
        }]}

    def test_admin_can_sync(self, y26, sample_sheet):
        h = _login("admin")
        r = requests.post(f"{API}/attendance/sync", headers=h, json=self._payload(y26, sample_sheet))
        assert r.status_code == 200

    def test_coordinator_can_sync(self, y26, sample_sheet):
        h = _login("coordinator")
        r = requests.post(f"{API}/attendance/sync", headers=h, json=self._payload(y26, sample_sheet))
        assert r.status_code == 200

    def test_teacher_can_sync(self, y26, sample_sheet):
        h = _login("teacher")
        r = requests.post(f"{API}/attendance/sync", headers=h, json=self._payload(y26, sample_sheet))
        assert r.status_code == 200

    def test_management_cannot_sync(self, y26, sample_sheet):
        h = _login("management")
        r = requests.post(f"{API}/attendance/sync", headers=h, json=self._payload(y26, sample_sheet))
        assert r.status_code == 403

    def test_student_cannot_sync(self, y26, sample_sheet):
        h = _login("student")
        r = requests.post(f"{API}/attendance/sync", headers=h, json=self._payload(y26, sample_sheet))
        assert r.status_code == 403


class TestSyncEditAlreadyMarked:
    def test_sync_updates_existing(self, admin_h, y26, sample_sheet):
        """Marking a student present online then syncing an absent offline batch should UPDATE, not duplicate."""
        date = _unique_date()
        sid = sample_sheet["students"][0]["student_id"]
        # online mark: present
        p1 = requests.post(f"{API}/attendance", headers=admin_h, json={
            "academic_year_id": y26, "date": date,
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": sid, "status": "present"}],
        })
        assert p1.status_code == 200
        # offline sync: absent
        p2 = requests.post(f"{API}/attendance/sync", headers=admin_h, json={"batches": [{
            "academic_year_id": y26, "date": date,
            "school_id": sample_sheet["school_id"], "standard": sample_sheet["standard"],
            "division": "",
            "records": [{"student_id": sid, "status": "absent"}],
        }]})
        assert p2.status_code == 200
        # history: exactly 1 record, status=absent
        h = requests.get(f"{API}/attendance/history", headers=admin_h,
                        params={"academic_year_id": y26, "school_id": sample_sheet["school_id"],
                                "standard": sample_sheet["standard"],
                                "date_from": date, "date_to": date}).json()
        my = [r for r in h if r["student_id"] == sid]
        assert len(my) == 1
        assert my[0]["status"] == "absent"
