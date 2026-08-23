import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://prepvista:prepvista_dev_pw@localhost:5432/prepvista_test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models.institution import Batch, Department, Institution, PlacementSeason, Program
from app.models.user import User, UserRole
from app.security import create_access_token, hash_password

settings = get_settings()
engine = create_engine(settings.database_url, future=True)
TestSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture(autouse=True)
def _clean_tables():
    """
    Truncate every table before each test. Simple and fully reliable
    across FastAPI's own request-scoped sessions (a wrap-in-a-savepoint
    approach doesn't compose cleanly with TestClient's separate
    connection per request, so we use truncate-between-tests instead).
    """
    with engine.begin() as conn:
        table_names = [t.name for t in reversed(Base.metadata.sorted_tables)]
        if table_names:
            conn.exec_driver_sql(f"TRUNCATE TABLE {', '.join(table_names)} RESTART IDENTITY CASCADE;")
    yield


@pytest.fixture
def db() -> Session:
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session):
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def tenant(db: Session):
    """Creates a minimal institution + org structure for tests to build on."""
    inst = Institution(name="Test Institute", short_code=f"TEST-{uuid.uuid4().hex[:8]}")
    db.add(inst)
    db.flush()

    season = PlacementSeason(institution_id=inst.id, name="2026")
    dept = Department(institution_id=inst.id, code="CSE", name="Computer Science")
    db.add_all([season, dept])
    db.flush()

    program = Program(institution_id=inst.id, department_id=dept.id, code="BTECH-CSE", name="B.Tech CSE")
    db.add(program)
    db.flush()

    batch = Batch(institution_id=inst.id, program_id=program.id, name="B.Tech 2026", graduation_year=2026)
    db.add(batch)
    db.flush()
    db.commit()

    return {
        "institution": inst,
        "season": season,
        "department": dept,
        "program": program,
        "batch": batch,
    }


@pytest.fixture
def tpo_user(db: Session, tenant):
    user = User(
        institution_id=tenant["institution"].id,
        email="tpo@test.edu",
        full_name="Test TPO",
        role=UserRole.TPO_HEAD,
        hashed_password=hash_password("TestPass123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(tpo_user):
    token = create_access_token(subject=str(tpo_user.id), extra_claims={"role": tpo_user.role.value})
    return {"Authorization": f"Bearer {token}"}
