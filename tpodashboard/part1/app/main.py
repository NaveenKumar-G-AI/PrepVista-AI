from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.exceptions import register_exception_handlers
from app.routers import (
    academic,
    activity,
    applications,
    auth,
    companies,
    data_quality,
    dashboard,
    drives,
    imports,
    institutions,
    interviews,
    offers,
    profile,
    skills,
    students,
)

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth.router)
app.include_router(institutions.router)
app.include_router(students.router)
app.include_router(academic.router)
app.include_router(profile.router)
app.include_router(skills.router)
app.include_router(activity.router)
app.include_router(imports.router)
app.include_router(data_quality.router)
app.include_router(companies.router)
app.include_router(drives.router)
app.include_router(applications.router)
app.include_router(interviews.router)
app.include_router(offers.router)
app.include_router(dashboard.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "environment": settings.environment}
