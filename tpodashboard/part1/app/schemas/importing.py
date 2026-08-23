import uuid

from pydantic import BaseModel


class ColumnMappingSuggestion(BaseModel):
    source_column: str
    mapped_field: str | None  # None if unmapped/ignored
    confidence: float  # 0-1
    sample_values: list[str]


class ImportPreviewResponse(BaseModel):
    import_batch_id: uuid.UUID
    total_rows: int
    detected_columns: list[str]
    suggested_mapping: list[ColumnMappingSuggestion]
    required_fields: list[str]
    unmapped_required_fields: list[str]


class ImportValidateRequest(BaseModel):
    import_batch_id: uuid.UUID
    column_mapping: dict[str, str]  # source_column -> target_field
    batch_id: uuid.UUID
    department_id: uuid.UUID
    program_id: uuid.UUID


class RowIssue(BaseModel):
    row_number: int
    field: str | None
    issue: str
    value: str | None


class DuplicateCandidate(BaseModel):
    row_number: int
    register_number: str | None
    full_name: str
    matched_student_id: uuid.UUID
    match_type: str  # EXACT_DUPLICATE | POSSIBLE_DUPLICATE
    matched_on: list[str]


class ImportValidateResponse(BaseModel):
    import_batch_id: uuid.UUID
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    issues: list[RowIssue]
    duplicates: list[DuplicateCandidate]
    ready_to_commit: bool


class ImportCommitRequest(BaseModel):
    import_batch_id: uuid.UUID
    skip_duplicates: bool = True


class ImportCommitResponse(BaseModel):
    import_batch_id: uuid.UUID
    imported_count: int
    updated_count: int
    ignored_count: int
    attention_count: int
    total_rows: int
