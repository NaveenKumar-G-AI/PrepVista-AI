"""
Development-only seed data.

Run explicitly: python scripts/seed.py
Refuses to run when ENVIRONMENT=production, by design (see main()).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import date

from app.config import get_settings
from app.database import SessionLocal
from app.models.company import Company, PipelineStage
from app.models.drive import Drive, DriveStatus, InterviewRound
from app.models.institution import Batch, Department, Institution, PlacementSeason, Program
from app.models.student import AcademicRecord, PlacementStatus, Skill, Student, StudentStatus
from app.models.user import User, UserRole
from app.security import hash_password

DEMO_STUDENTS = [
    ("2026CSE001", "Aarav Sharma", "CSE"),
    ("2026CSE002", "Diya Patel", "CSE"),
    ("2026ECE001", "Vihaan Reddy", "ECE"),
    ("2026ECE002", "Ananya Iyer", "ECE"),
    ("2026MECH001", "Karthik Menon", "MECH"),
    ("2026CIVIL001", "Priya Nair", "CIVIL"),
]  # DEMO DATA -- clearly marked, not representative of any real institution


def main() -> None:
    settings = get_settings()
    if settings.environment == "production":
        print("Refusing to seed: ENVIRONMENT=production. Seed data is development-only.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(Institution).filter(Institution.short_code == "DEMO-LIT").first()
        if existing:
            print(f"Demo institution already exists (id={existing.id}). Nothing to do.")
            return

        inst = Institution(name="Demo Institute of Technology", short_code="DEMO-LIT")
        db.add(inst)
        db.flush()

        season = PlacementSeason(
            institution_id=inst.id, name="2026", start_date=date(2026, 6, 1), end_date=date(2027, 5, 31)
        )
        db.add(season)

        dept_map: dict[str, Department] = {}
        for code, name in [("CSE", "Computer Science"), ("ECE", "Electronics & Comm"), ("MECH", "Mechanical"), ("CIVIL", "Civil")]:
            dept = Department(institution_id=inst.id, code=code, name=name)
            db.add(dept)
            db.flush()
            dept_map[code] = dept

        program_map: dict[str, Program] = {}
        for code, dept in dept_map.items():
            program = Program(
                institution_id=inst.id, department_id=dept.id, code=f"BTECH-{code}",
                name=f"B.Tech {dept.name}", degree_level="UG", duration_years=4,
            )
            db.add(program)
            db.flush()
            program_map[code] = program

        batch_map: dict[str, Batch] = {}
        for code, program in program_map.items():
            batch = Batch(institution_id=inst.id, program_id=program.id, name="B.Tech 2026", graduation_year=2026)
            db.add(batch)
            db.flush()
            batch_map[code] = batch

        users = [
            ("tpo.head@demo-lit.edu", "TPO Head Demo", UserRole.TPO_HEAD, None),
            ("placement.officer@demo-lit.edu", "Placement Officer Demo", UserRole.PLACEMENT_OFFICER, None),
            ("faculty.cse@demo-lit.edu", "Faculty Demo (CSE)", UserRole.FACULTY, dept_map["CSE"].id),
        ]
        for email, name, role, dept_id in users:
            db.add(User(
                institution_id=inst.id, email=email, full_name=name, role=role,
                department_id=dept_id, hashed_password=hash_password("DemoPass123!"),
            ))

        for skill_name, category in [
            ("Technical Depth", "Technical"), ("Communication", "Behavioral"),
            ("Problem Solving", "Technical"), ("System Design", "Technical"),
        ]:
            db.add(Skill(institution_id=inst.id, name=skill_name, category=category))

        seeded_students = []
        for reg_no, name, dept_code in DEMO_STUDENTS:
            student = Student(
                institution_id=inst.id, season_id=season.id, batch_id=batch_map[dept_code].id,
                department_id=dept_map[dept_code].id, program_id=program_map[dept_code].id,
                register_number=reg_no, full_name=name, status=StudentStatus.ACTIVE,
                placement_status=PlacementStatus.SEEKING, source="seed",
            )
            db.add(student)
            db.flush()
            seeded_students.append(student)

        # Give each demo student an academic record so the eligibility
        # engine and import-adjacent features have real data to run on.
        demo_cgpas = [8.7, 7.9, 8.2, 7.4, 7.1, 6.8]
        for student, cgpa in zip(seeded_students, demo_cgpas):
            db.add(AcademicRecord(
                institution_id=inst.id, student_id=student.id, semester=0,
                cumulative_cgpa=cgpa, backlog_count=0, source="seed",
            ))

        # A small amount of Part 2 demo data: one recruiter and one
        # active drive, so the eligibility engine / funnel have something
        # real to show immediately after seeding.
        company = Company(
            institution_id=inst.id, name="Demo Robotics Pvt Ltd", industry="Manufacturing",
            city="Coimbatore", pipeline_stage=PipelineStage.DRIVE_SCHEDULED,
        )
        db.add(company)
        db.flush()

        drive = Drive(
            institution_id=inst.id, season_id=season.id, company_id=company.id,
            role="Graduate Engineer Trainee", job_type="FULL_TIME", ctc_lpa=6.5,
            location="Coimbatore", status=DriveStatus.ACTIVE,
            min_cgpa=7.0, max_backlogs=0,
            eligible_department_ids=[dept_map["CSE"].id, dept_map["ECE"].id],
        )
        db.add(drive)
        db.flush()
        for i, round_name in enumerate(["Aptitude", "Technical Interview", "HR"]):
            db.add(InterviewRound(institution_id=inst.id, drive_id=drive.id, name=round_name, sequence_order=i))

        db.commit()
        print(f"Seeded demo institution '{inst.short_code}' (id={inst.id})")
        print(f"  {len(dept_map)} departments, {len(program_map)} programs, {len(batch_map)} batches")
        print(f"  {len(users)} users (password for all: DemoPass123!)")
        print(f"  {len(DEMO_STUDENTS)} demo students, each with an academic record")
        print(f"  1 company ('{company.name}'), 1 active drive with 3 interview rounds")
    finally:
        db.close()


if __name__ == "__main__":
    main()
