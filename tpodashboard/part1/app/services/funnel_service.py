"""
The eligibility engine and application funnel logic.

compute_eligibility() runs a single indexed query against real student
rows -- this is the backend equivalent of the frontend prototype's
live eligibility calculator, now backed by real CGPA/backlog/department
data instead of generated numbers.
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import ConflictError, NotFoundError
from app.models.application import Application, ApplicationStage
from app.models.drive import Drive, DriveStatus
from app.models.offer import Offer, OfferStatus
from app.models.student import AcademicRecord, PlacementStatus, Student
from app.services import activity_service, audit_service


def compute_eligibility(db: Session, *, institution_id: uuid.UUID, min_cgpa: float, max_backlogs: int, department_ids: list[uuid.UUID] | None) -> dict:
    total = db.execute(select(func.count()).where(Student.institution_id == institution_id)).scalar_one()

    latest_cgpa = (
        select(AcademicRecord.student_id, AcademicRecord.cumulative_cgpa, AcademicRecord.backlog_count)
        .where(AcademicRecord.institution_id == institution_id)
        .order_by(AcademicRecord.student_id, AcademicRecord.semester.desc())
        .distinct(AcademicRecord.student_id)
        .subquery()
    )

    base = select(Student.id, Student.department_id, latest_cgpa.c.cumulative_cgpa, latest_cgpa.c.backlog_count).join(
        latest_cgpa, latest_cgpa.c.student_id == Student.id, isouter=True
    ).where(Student.institution_id == institution_id)

    rows = db.execute(base).all()

    eligible = 0
    cgpa_fail = 0
    backlog_fail = 0
    dept_fail = 0
    dept_set = set(department_ids) if department_ids else None

    for student_id, dept_id, cgpa, backlogs in rows:
        dept_ok = dept_set is None or dept_id in dept_set
        cgpa_ok = cgpa is not None and float(cgpa) >= min_cgpa
        backlog_ok = backlogs is not None and backlogs <= max_backlogs
        if dept_ok and cgpa_ok and backlog_ok:
            eligible += 1
        else:
            if not dept_ok:
                dept_fail += 1
            if not cgpa_ok:
                cgpa_fail += 1
            if not backlog_ok:
                backlog_fail += 1

    return {
        "total": total,
        "eligible": eligible,
        "not_eligible": total - eligible,
        "cgpa_fail": cgpa_fail,
        "backlog_fail": backlog_fail,
        "dept_fail": dept_fail,
    }


def get_eligible_student_ids(db: Session, *, institution_id: uuid.UUID, drive: Drive) -> list[uuid.UUID]:
    latest_cgpa = (
        select(AcademicRecord.student_id, AcademicRecord.cumulative_cgpa, AcademicRecord.backlog_count)
        .where(AcademicRecord.institution_id == institution_id)
        .order_by(AcademicRecord.student_id, AcademicRecord.semester.desc())
        .distinct(AcademicRecord.student_id)
        .subquery()
    )
    stmt = select(Student.id).join(latest_cgpa, latest_cgpa.c.student_id == Student.id, isouter=True).where(
        Student.institution_id == institution_id,
        latest_cgpa.c.cumulative_cgpa.isnot(None),
        latest_cgpa.c.cumulative_cgpa >= float(drive.min_cgpa),
        latest_cgpa.c.backlog_count <= drive.max_backlogs,
    )
    if drive.eligible_department_ids:
        stmt = stmt.where(Student.department_id.in_(drive.eligible_department_ids))
    return list(db.execute(stmt).scalars().all())


def apply_to_drive(db: Session, *, institution_id: uuid.UUID, actor_user_id: uuid.UUID, drive_id: uuid.UUID, student_id: uuid.UUID) -> Application:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != institution_id:
        raise NotFoundError("Drive not found.")
    student = db.get(Student, student_id)
    if not student or student.institution_id != institution_id:
        raise NotFoundError("Student not found.")
    if drive.status not in (DriveStatus.ACTIVE, DriveStatus.UPCOMING):
        raise ConflictError("This drive is not open for applications.")

    existing = db.execute(
        select(Application).where(Application.drive_id == drive_id, Application.student_id == student_id)
    ).scalar_one_or_none()
    if existing:
        raise ConflictError("This student has already applied to this drive.")

    application = Application(
        institution_id=institution_id, drive_id=drive_id, student_id=student_id,
        stage=ApplicationStage.APPLIED, applied_at=datetime.now(timezone.utc),
    )
    db.add(application)
    db.flush()

    activity_service.emit(
        db, institution_id=institution_id, entity_type="application", entity_id=application.id,
        event_type="application.created", actor_user_id=actor_user_id,
        metadata={"drive_id": str(drive_id), "student_id": str(student_id)},
    )
    audit_service.record(
        db, institution_id=institution_id, actor_user_id=actor_user_id, entity_type="application",
        entity_id=application.id, action="CREATE",
    )
    return application


_VALID_TRANSITIONS: dict[ApplicationStage, set[ApplicationStage]] = {
    ApplicationStage.APPLIED: {ApplicationStage.SHORTLISTED, ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN},
    ApplicationStage.SHORTLISTED: {ApplicationStage.INTERVIEWING, ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN},
    ApplicationStage.INTERVIEWING: {ApplicationStage.SELECTED, ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN},
    ApplicationStage.SELECTED: {ApplicationStage.REJECTED},  # SELECTED moves forward via Offer, not stage transition
    ApplicationStage.REJECTED: set(),
    ApplicationStage.WITHDRAWN: set(),
}


def transition_application_stage(
    db: Session, *, institution_id: uuid.UUID, actor_user_id: uuid.UUID, application_id: uuid.UUID, new_stage: ApplicationStage
) -> Application:
    application = db.get(Application, application_id)
    if not application or application.institution_id != institution_id:
        raise NotFoundError("Application not found.")

    allowed = _VALID_TRANSITIONS.get(application.stage, set())
    if new_stage not in allowed:
        raise ConflictError(f"Cannot move an application from {application.stage.value} to {new_stage.value}.")

    old_stage = application.stage
    application.stage = new_stage
    db.flush()

    # Reaching SELECTED materializes an Offer -- this is the one place
    # an Application's progress creates a row in another table.
    if new_stage == ApplicationStage.SELECTED and not application.offer:
        offer = Offer(
            institution_id=institution_id, application_id=application.id, student_id=application.student_id,
            company_id=application.drive.company_id, ctc_lpa=application.drive.ctc_lpa,
            status=OfferStatus.EXTENDED, extended_at=datetime.now(timezone.utc),
        )
        db.add(offer)
        db.flush()
        activity_service.emit(
            db, institution_id=institution_id, entity_type="offer", entity_id=offer.id,
            event_type="offer.created", actor_user_id=actor_user_id,
            metadata={"application_id": str(application.id)},
        )

    activity_service.emit(
        db, institution_id=institution_id, entity_type="application", entity_id=application.id,
        event_type="application.stage_changed", actor_user_id=actor_user_id,
        metadata={"from": old_stage.value, "to": new_stage.value},
    )
    audit_service.record(
        db, institution_id=institution_id, actor_user_id=actor_user_id, entity_type="application",
        entity_id=application.id, action="STAGE_CHANGE", metadata={"from": old_stage.value, "to": new_stage.value},
    )
    return application


def update_offer_status(
    db: Session, *, institution_id: uuid.UUID, actor_user_id: uuid.UUID, offer_id: uuid.UUID,
    new_status: OfferStatus | None = None, joining_confirmed: bool | None = None, joining_date: date | None = None,
) -> Offer:
    offer = db.get(Offer, offer_id)
    if not offer or offer.institution_id != institution_id:
        raise NotFoundError("Offer not found.")

    if new_status:
        if new_status == OfferStatus.ACCEPTED and offer.status != OfferStatus.EXTENDED:
            raise ConflictError("Only an extended offer can be accepted.")
        offer.status = new_status
        if new_status == OfferStatus.ACCEPTED:
            offer.accepted_at = datetime.now(timezone.utc)

    if joining_confirmed is not None:
        offer.joining_confirmed = joining_confirmed
    if joining_date is not None:
        offer.joining_date = joining_date

    # JOINED is the one event that reaches back and updates the
    # student's permanent placement_status -- everything else about the
    # funnel stays on Application/Offer, never on Student itself.
    if new_status == OfferStatus.JOINED or (offer.status == OfferStatus.ACCEPTED and joining_confirmed):
        offer.status = OfferStatus.JOINED
        offer.joining_confirmed = True
        student = db.get(Student, offer.student_id)
        if student and student.placement_status != PlacementStatus.PLACED:
            student.placement_status = PlacementStatus.PLACED
            activity_service.emit(
                db, institution_id=institution_id, entity_type="student", entity_id=student.id,
                event_type="student.placed", actor_user_id=actor_user_id,
                metadata={"offer_id": str(offer.id), "company_id": str(offer.company_id)},
            )

    db.flush()
    activity_service.emit(
        db, institution_id=institution_id, entity_type="offer", entity_id=offer.id,
        event_type="offer.updated", actor_user_id=actor_user_id,
        metadata={"status": offer.status.value, "joining_confirmed": offer.joining_confirmed},
    )
    audit_service.record(
        db, institution_id=institution_id, actor_user_id=actor_user_id, entity_type="offer",
        entity_id=offer.id, action="UPDATE",
    )
    return offer
