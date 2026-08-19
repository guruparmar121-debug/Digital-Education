# PRD — DIGITAL EDUCATION PROGRAM
Student Attendance & Learning Management System

## Original problem statement
Production-ready web app to manage students, schools, teachers, blocks, villages, attendance, courses, course progress, academic years and management reports. Requirements: real database, JWT auth, CRUD, role-based permissions (Admin / Management / Coordinator / Teacher / Student), dashboards with KPI cards + interactive charts, universal filters, global academic year switcher with strict year-wise data separation, bulk Excel student upload + bulk update with validation/error Excel/preview/import, upload history, student promotion, year comparison, 16 reports with Excel/PDF export + print, audit logs, mobile responsive.

## Architecture
- Backend: FastAPI, MongoDB (motor), modular routers — `core.py` (db/JWT/bcrypt/RBAC/audit), `masters.py`, `students.py`, `attendance.py`, `courses.py`, `dashboards.py`, `reports.py`, `seed.py`. All routes under `/api`.
- Auth: JWT in httpOnly cookies + Bearer fallback, bcrypt hashing, brute-force lockout (5 attempts / 15 min).
- Data: uuid string ids. Collections: users, academic_years, blocks, villages, schools, teachers, students, student_academic_years, attendance, courses, student_courses, student_promotions, upload_history, audit_logs, login_attempts. Unique indexes on users.email, students.student_id, (student_id, academic_year_id), (student_id, date, academic_year_id), (student_id, course_id, academic_year_id).
- Frontend: React + Tailwind + shadcn/ui + recharts + sonner. `AuthContext`, `YearContext` (global academic year), `Layout` (sidebar + header + mobile bottom nav), reusable `Ui.jsx` (KPI/Chart/Table/Progress/Panel) and `Filters.jsx` (universal filter).
- Exports: openpyxl/pandas for Excel, reportlab for branded PDFs.

## User personas
- Admin — full CRUD across all modules, bulk upload, promotion, users, audit logs.
- Management — read-only dashboards, analytics, reports, year comparison.
- Coordinator — scoped to assigned blocks (schools/teachers/students, attendance).
- Teacher/Staff — scoped to assigned school: attendance and course progress.
- Student — own attendance, courses and progress only.

## Core requirements (static)
Year-wise separation on every year-specific record; Student ID unique and re-used across years via `student_academic_years`; validation before any import; previous-year data never deleted.

## Implemented (2026-06)
- JWT auth + 5 seeded role accounts, role guards on routes and APIs.
- Academic Year management (add/edit/activate/set current) + global switcher everywhere.
- Overall/Management dashboard: 13 KPIs, 12 charts, universal filters.
- Student Master: CRUD, search/filters, detail dashboard, Excel/PDF export.
- Bulk Excel upload: template download, 13 validation rules, summary + preview + error Excel, import of valid rows only, bulk update mode with audit trail, upload history.
- Daily attendance: sheet by date/school/class, mark all present/absent, save/edit, history, low-attendance with editable threshold, attendance dashboard.
- Masters: Blocks, Villages, Schools, Teachers CRUD + search.
- Courses: CRUD, assign to school/standard/students; Course Progress with progress bars, KPIs, 6 charts, low-progress threshold.
- Student Promotion (bulk, class/division/school change) + history.
- Year Comparison with automatic change %.
- 16 reports with screen view + Excel + PDF + print, branded headers.
- Audit logs, users management, mobile bottom nav + responsive layouts.
- Seed data: 4 blocks, 8 villages, 12 schools, 24 teachers, 261 students, 2 years of attendance (15.6k records) and course progress.

## Backlog
- P1: chart drill-down to detail records; course modules/lessons detail entities; persist bulk-validation session in DB (currently in-memory).
- P2: Settings page for global thresholds; SMS/email alerts for low attendance; coordinator/teacher granular student assignment UI.

## Next tasks
Chart click-through drill-downs, module/lesson-level course tracking, saved report schedules.
