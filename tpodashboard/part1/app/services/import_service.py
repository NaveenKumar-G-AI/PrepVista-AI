"""
Student import workflow.

Design choice worth calling out: preview() parses the file ONCE and
stores the raw rows (as JSON) on the ImportBatch. validate() and
commit() both re-read that stored copy rather than re-parsing the
upload. This guarantees what the TPO previewed is exactly what gets
validated and committed -- no risk of the file changing on disk
between steps, and no risk of preview/commit drifting apart.
"""
import io
import re
import unicodedata
import uuid
from datetime import date, datetime, timezone
from difflib import SequenceMatcher

import pandas as pd
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.import_batch import ImportBatch, ImportStatus
from app.models.student import AcademicRecord, PlacementStatus, Student, StudentStatus
from app.services import activity_service, audit_service
from app.services.profile_completion import compute_profile_completion
from app.services.storage_service import get_storage_service

REQUIRED_FIELDS = ["register_number", "full_name"]

FIELD_ALIASES: dict[str, list[str]] = {
    "register_number": [
        "reg no", "register number", "regno", "registration number", "reg. no",
        "university reg no", "register_number", "university register number",
    ],
    "roll_number": ["roll", "roll no", "roll number", "student id", "rollno", "roll_number"],
    "full_name": ["name", "student name", "full name", "candidate name", "full_name"],
    "institutional_email": [
        "college email", "institutional email", "university email", "email (college)",
        "institutional_email", "institute email",
    ],
    "personal_email": ["personal email", "email", "e-mail", "personal_email", "email id"],
    "phone": ["phone", "mobile", "contact number", "mobile number", "phone number", "contact"],
    "gender": ["gender", "sex"],
    "date_of_birth": ["dob", "date of birth", "birth date", "date_of_birth"],
    "cumulative_cgpa": ["cgpa", "cumulative cgpa", "gpa", "aggregate cgpa", "current cgpa"],
    "backlog_count": ["backlogs", "backlog count", "no of backlogs", "arrears", "current backlogs"],
    "percentage": ["percentage", "aggregate percentage", "percent", "percentage marks"],
}

ALL_TARGET_FIELDS = list(FIELD_ALIASES.keys())


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def suggest_mapping(columns: list[str]) -> list[dict]:
    suggestions = []
    used_targets: set[str] = set()
    for col in columns:
        norm_col = _normalize(col)
        best_field, best_score = None, 0.0
        for field, aliases in FIELD_ALIASES.items():
            if field in used_targets:
                continue
            for alias in aliases:
                norm_alias = _normalize(alias)
                if norm_col == norm_alias:
                    score = 1.0
                else:
                    score = SequenceMatcher(None, norm_col, norm_alias).ratio()
                if score > best_score:
                    best_field, best_score = field, score
        mapped = best_field if best_score >= 0.72 else None
        if mapped:
            used_targets.add(mapped)
        suggestions.append({"source_column": col, "mapped_field": mapped, "confidence": round(best_score, 2)})
    return suggestions


def _read_table(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
    else:
        df = pd.read_excel(io.BytesIO(content), dtype=str, engine="openpyxl")
        df = df.fillna("")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def create_preview(
    db: Session,
    *,
    institution_id: uuid.UUID,
    uploaded_by_user_id: uuid.UUID,
    filename: str,
    content: bytes,
    max_rows: int,
) -> dict:
    if not any(filename.lower().endswith(ext) for ext in (".xlsx", ".xls", ".csv")):
        raise ValidationAppError("Unsupported file type. Upload .xlsx, .xls, or .csv.")

    try:
        df = _read_table(content, filename)
    except Exception as exc:  # pandas/openpyxl raise many different error types
        raise ValidationAppError(f"Could not parse the file: {exc}") from exc

    if len(df) == 0:
        raise ValidationAppError("The file has no data rows.")
    if len(df) > max_rows:
        raise ValidationAppError(f"File has {len(df)} rows, which exceeds the {max_rows}-row limit for a single import.")

    storage = get_storage_service()
    storage_key, checksum = storage.save(institution_id=institution_id, filename=filename, content=content)

    columns = list(df.columns)
    suggestions = suggest_mapping(columns)
    mapped_fields = {s["mapped_field"] for s in suggestions if s["mapped_field"]}
    unmapped_required = [f for f in REQUIRED_FIELDS if f not in mapped_fields]

    for s in suggestions:
        col = s["source_column"]
        sample = [v for v in df[col].astype(str).head(5).tolist() if v.strip()][:3]
        s["sample_values"] = sample

    batch = ImportBatch(
        institution_id=institution_id,
        uploaded_by_user_id=uploaded_by_user_id,
        original_filename=filename,
        storage_key=storage_key,
        status=ImportStatus.PREVIEWED,
        total_rows=len(df),
        report={"rows": df.to_dict(orient="records"), "columns": columns},
    )
    db.add(batch)
    db.flush()

    audit_service.record(
        db,
        institution_id=institution_id,
        actor_user_id=uploaded_by_user_id,
        entity_type="import_batch",
        entity_id=batch.id,
        action="UPLOAD",
        metadata={"filename": filename, "rows": len(df), "checksum": checksum},
    )

    return {
        "import_batch_id": batch.id,
        "total_rows": len(df),
        "detected_columns": columns,
        "suggested_mapping": suggestions,
        "required_fields": REQUIRED_FIELDS,
        "unmapped_required_fields": unmapped_required,
    }


def _coerce_row(raw: dict, mapping: dict[str, str]) -> dict:
    """mapping is source_column -> target_field. Returns target_field -> value."""
    out: dict = {}
    for source_col, target_field in mapping.items():
        if not target_field:
            continue
        out[target_field] = str(raw.get(source_col, "")).strip()
    return out


def _validate_row(row: dict, row_number: int) -> list[dict]:
    issues = []
    if not row.get("register_number", "").strip():
        issues.append({"row_number": row_number, "field": "register_number", "issue": "Missing register number", "value": None})
    if not row.get("full_name", "").strip():
        issues.append({"row_number": row_number, "field": "full_name", "issue": "Missing name", "value": None})

    for email_field in ("institutional_email", "personal_email"):
        val = row.get(email_field, "").strip()
        if val and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", val):
            issues.append({"row_number": row_number, "field": email_field, "issue": "Malformed email", "value": val})

    cgpa = row.get("cumulative_cgpa", "").strip()
    if cgpa:
        try:
            cgpa_val = float(cgpa)
            if not (0 <= cgpa_val <= 10):
                issues.append({"row_number": row_number, "field": "cumulative_cgpa", "issue": "CGPA out of expected 0-10 range", "value": cgpa})
        except ValueError:
            issues.append({"row_number": row_number, "field": "cumulative_cgpa", "issue": "CGPA is not numeric", "value": cgpa})

    backlogs = row.get("backlog_count", "").strip()
    if backlogs:
        try:
            b = int(float(backlogs))
            if b < 0:
                issues.append({"row_number": row_number, "field": "backlog_count", "issue": "Backlog count cannot be negative", "value": backlogs})
        except ValueError:
            issues.append({"row_number": row_number, "field": "backlog_count", "issue": "Backlog count is not a whole number", "value": backlogs})

    dob = row.get("date_of_birth", "").strip()
    if dob:
        parsed = _try_parse_date(dob)
        if not parsed:
            issues.append({"row_number": row_number, "field": "date_of_birth", "issue": "Unrecognized date format", "value": dob})

    return issues


def _try_parse_date(value: str) -> date | None:
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def validate_import(
    db: Session,
    *,
    institution_id: uuid.UUID,
    import_batch_id: uuid.UUID,
    column_mapping: dict[str, str],
    batch_id: uuid.UUID,
    department_id: uuid.UUID,
    program_id: uuid.UUID,
) -> dict:
    batch = db.get(ImportBatch, import_batch_id)
    if not batch or batch.institution_id != institution_id:
        raise NotFoundError("Import batch not found.")

    rows = batch.report["rows"]
    seen_register_numbers: dict[str, int] = {}
    all_issues: list[dict] = []
    duplicates: list[dict] = []
    valid_count = 0
    invalid_row_numbers: set[int] = set()
    duplicate_row_numbers: set[int] = set()

    existing_by_register = {
        s.register_number: s.id
        for s in db.execute(
            select(Student.id, Student.register_number).where(Student.institution_id == institution_id)
        ).all()
    }
    existing_by_email = {
        s.institutional_email: s.id
        for s in db.execute(
            select(Student.id, Student.institutional_email).where(
                Student.institution_id == institution_id, Student.institutional_email.isnot(None)
            )
        ).all()
    }
    existing_by_phone = {
        s.phone: s.id
        for s in db.execute(
            select(Student.id, Student.phone).where(
                Student.institution_id == institution_id, Student.phone.isnot(None)
            )
        ).all()
    }

    for i, raw in enumerate(rows):
        row_number = i + 1
        row = _coerce_row(raw, column_mapping)
        row_issues = _validate_row(row, row_number)
        if row_issues:
            all_issues.extend(row_issues)
            invalid_row_numbers.add(row_number)
            continue

        reg = row["register_number"].strip()
        if reg in seen_register_numbers:
            duplicates.append(
                {
                    "row_number": row_number,
                    "register_number": reg,
                    "full_name": row.get("full_name", ""),
                    "matched_student_id": None,
                    "match_type": "EXACT_DUPLICATE",
                    "matched_on": ["register_number (duplicate within this file)"],
                }
            )
            duplicate_row_numbers.add(row_number)
            continue
        seen_register_numbers[reg] = row_number

        if reg in existing_by_register:
            # Not a "duplicate to ignore" -- this is an update candidate, valid.
            valid_count += 1
            continue

        email = row.get("institutional_email", "").strip()
        phone = row.get("phone", "").strip()
        matched_on = []
        matched_id = None
        if email and email in existing_by_email:
            matched_on.append("institutional_email")
            matched_id = existing_by_email[email]
        if phone and phone in existing_by_phone:
            matched_on.append("phone")
            matched_id = matched_id or existing_by_phone[phone]
        if matched_on:
            duplicates.append(
                {
                    "row_number": row_number,
                    "register_number": reg,
                    "full_name": row.get("full_name", ""),
                    "matched_student_id": str(matched_id),
                    "match_type": "POSSIBLE_DUPLICATE",
                    "matched_on": matched_on,
                }
            )
            duplicate_row_numbers.add(row_number)
            continue

        valid_count += 1

    invalid_count = len(invalid_row_numbers)
    duplicate_count = len(duplicate_row_numbers)

    batch.column_mapping = {
        "mapping": column_mapping,
        "batch_id": str(batch_id),
        "department_id": str(department_id),
        "program_id": str(program_id),
    }
    batch.valid_rows = valid_count
    batch.invalid_rows = invalid_count
    batch.duplicate_rows = duplicate_count
    batch.status = ImportStatus.VALIDATED
    db.flush()

    return {
        "import_batch_id": batch.id,
        "total_rows": len(rows),
        "valid_rows": valid_count,
        "invalid_rows": invalid_count,
        "duplicate_rows": duplicate_count,
        "issues": all_issues[:500],  # cap payload size; full report stays on the batch
        "duplicates": [d for d in duplicates if d["match_type"] == "POSSIBLE_DUPLICATE"][:500],
        "ready_to_commit": valid_count > 0,
    }


def commit_import(
    db: Session,
    *,
    institution_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    import_batch_id: uuid.UUID,
    skip_duplicates: bool = True,
) -> dict:
    batch = db.get(ImportBatch, import_batch_id)
    if not batch or batch.institution_id != institution_id:
        raise NotFoundError("Import batch not found.")
    if batch.status != ImportStatus.VALIDATED:
        raise ConflictError("Import batch must be validated before it can be committed.")
    if not batch.column_mapping:
        raise ConflictError("No column mapping found on this import batch.")

    mapping = batch.column_mapping["mapping"]
    target_batch_id = uuid.UUID(batch.column_mapping["batch_id"])
    department_id = uuid.UUID(batch.column_mapping["department_id"])
    program_id = uuid.UUID(batch.column_mapping["program_id"])
    rows = batch.report["rows"]

    existing_by_register = {
        s.register_number: s
        for s in db.execute(
            select(Student).where(Student.institution_id == institution_id)
        ).scalars()
    }

    imported = updated = ignored = attention = 0
    seen_register_numbers: set[str] = set()

    # Single transaction: everything below is flushed together, and if
    # anything raises, the whole commit rolls back (see router: db.commit()
    # only happens after this function returns without error).
    for i, raw in enumerate(rows):
        row_number = i + 1
        row = _coerce_row(raw, mapping)
        row_issues = _validate_row(row, row_number)
        if row_issues:
            attention += 1
            continue

        reg = row["register_number"].strip()
        if reg in seen_register_numbers:
            ignored += 1
            continue
        seen_register_numbers.add(reg)

        existing = existing_by_register.get(reg)
        if existing:
            _apply_row_to_student(existing, row)
            existing.profile_completion_pct = compute_profile_completion(existing)
            db.flush()
            activity_service.emit(
                db,
                institution_id=institution_id,
                entity_type="student",
                entity_id=existing.id,
                event_type="student.updated",
                actor_user_id=actor_user_id,
                metadata={"source": "import", "import_batch_id": str(batch.id)},
            )
            updated += 1
            continue

        email = row.get("institutional_email", "").strip() or None
        phone = row.get("phone", "").strip() or None
        if email or phone:
            clauses = []
            if email:
                clauses.append(Student.institutional_email == email)
            if phone:
                clauses.append(Student.phone == phone)
            possible = db.execute(
                select(Student.id).where(Student.institution_id == institution_id, or_(*clauses))
            ).first()
            if possible and skip_duplicates:
                attention += 1
                continue

        student = Student(
            institution_id=institution_id,
            batch_id=target_batch_id,
            department_id=department_id,
            program_id=program_id,
            register_number=reg,
            roll_number=row.get("roll_number") or None,
            full_name=row["full_name"].strip(),
            institutional_email=email,
            personal_email=row.get("personal_email") or None,
            phone=phone,
            status=StudentStatus.ACTIVE,
            placement_status=PlacementStatus.SEEKING,
            source="import",
            import_batch_id=batch.id,
        )
        db.add(student)
        db.flush()

        if row.get("cumulative_cgpa") or row.get("backlog_count") or row.get("percentage"):
            academic = AcademicRecord(
                institution_id=institution_id,
                student_id=student.id,
                semester=0,
                cumulative_cgpa=_to_float(row.get("cumulative_cgpa")),
                percentage=_to_float(row.get("percentage")),
                backlog_count=_to_int(row.get("backlog_count")) or 0,
                source="import",
            )
            db.add(academic)
            db.flush()

        student.profile_completion_pct = compute_profile_completion(student)
        activity_service.emit(
            db,
            institution_id=institution_id,
            entity_type="student",
            entity_id=student.id,
            event_type="student.created",
            actor_user_id=actor_user_id,
            metadata={"source": "import", "import_batch_id": str(batch.id)},
        )
        imported += 1

    batch.status = ImportStatus.COMMITTED
    batch.imported_count = imported
    batch.updated_count = updated
    batch.ignored_count = ignored
    batch.attention_count = attention
    batch.committed_at = datetime.now(timezone.utc)
    db.flush()

    audit_service.record(
        db,
        institution_id=institution_id,
        actor_user_id=actor_user_id,
        entity_type="import_batch",
        entity_id=batch.id,
        action="IMPORT_COMMIT",
        metadata={"imported": imported, "updated": updated, "ignored": ignored, "attention": attention},
    )

    return {
        "import_batch_id": batch.id,
        "imported_count": imported,
        "updated_count": updated,
        "ignored_count": ignored,
        "attention_count": attention,
        "total_rows": len(rows),
    }


def _apply_row_to_student(student: Student, row: dict) -> None:
    if row.get("full_name"):
        student.full_name = row["full_name"].strip()
    if row.get("roll_number"):
        student.roll_number = row["roll_number"].strip()
    if row.get("institutional_email"):
        student.institutional_email = row["institutional_email"].strip()
    if row.get("personal_email"):
        student.personal_email = row["personal_email"].strip()
    if row.get("phone"):
        student.phone = row["phone"].strip()


def _to_float(v: str | None) -> float | None:
    if not v or not str(v).strip():
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _to_int(v: str | None) -> int | None:
    if not v or not str(v).strip():
        return None
    try:
        return int(float(v))
    except ValueError:
        return None
