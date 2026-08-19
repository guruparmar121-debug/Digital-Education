from core import db, hash_password, verify_password, new_id, now_iso, create_access_token, \
    create_refresh_token, set_auth_cookies, get_current_user, audit
import os, logging
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

import masters, students as students_mod, attendance as attendance_mod, courses as courses_mod, \
    dashboards, reports

app = FastAPI(title="Digital Education Program API")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@api.get("/")
async def root():
    return {"app": "DIGITAL EDUCATION PROGRAM", "subtitle": "Student Attendance & Learning Management System"}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    email = payload.email.lower().strip()
    ident = f"{request.client.host if request.client else 'x'}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("count", 0) >= 5:
        last = datetime.fromisoformat(attempt["last_attempt"])
        if datetime.now(timezone.utc) - last < timedelta(minutes=15):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
        await db.login_attempts.delete_one({"identifier": ident})
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await db.login_attempts.update_one({"identifier": ident},
                                          {"$inc": {"count": 1}, "$set": {"last_attempt": now_iso()}},
                                          upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    access = create_access_token(user["id"], email)
    set_auth_cookies(response, access, create_refresh_token(user["id"]))
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {**user, "access_token": access}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


api.include_router(masters.router)
api.include_router(students_mod.router)
api.include_router(attendance_mod.router)
api.include_router(courses_mod.router)
api.include_router(dashboards.router)
api.include_router(reports.router)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.students.create_index("student_id", unique=True)
    await db.student_academic_years.create_index([("student_id", 1), ("academic_year_id", 1)], unique=True)
    await db.attendance.create_index([("student_id", 1), ("date", 1), ("academic_year_id", 1)], unique=True)
    await db.attendance.create_index([("academic_year_id", 1), ("school_id", 1)])
    await db.student_courses.create_index([("student_id", 1), ("course_id", 1), ("academic_year_id", 1)], unique=True)
    await db.academic_years.create_index("year", unique=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@dep.org")
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        await db.users.insert_one({"id": new_id(), "name": "System Admin", "email": admin_email,
                                   "role": "admin", "status": "active",
                                   "password_hash": hash_password(os.environ.get("ADMIN_PASSWORD", "admin123")),
                                   "created_at": now_iso()})


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()
