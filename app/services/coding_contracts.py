"""Bounded contracts for shared coding state; no client trust promotion."""
import hashlib
import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator, AwareDatetime

Short = Annotated[str, Field(min_length=1, max_length=160)]
Text = Annotated[str, Field(max_length=20000)]
Language = Literal['javascript', 'python', 'java', 'cpp']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PracticeAttempt(StrictModel):
    id: Short
    challengeId: Short
    at: AwareDatetime
    passed: int = Field(ge=0, le=30)
    total: int = Field(ge=1, le=30)
    assisted: bool
    languageIssue: bool = False
    code: Text

    @model_validator(mode='after')
    def valid_checks(self):
        if self.passed > self.total:
            raise ValueError('Passed checks cannot exceed total checks.')
        return self


class WorkspaceState(StrictModel):
    version: Literal[1] = 1
    drafts: dict[Short, Text] = Field(default_factory=dict, max_length=300)
    notes: dict[Short, Text] = Field(default_factory=dict, max_length=300)
    language: Language = 'javascript'
    role: Short = 'GENERAL_SWE'
    bookmarks: list[Short] = Field(default_factory=list, max_length=100)
    learned: list[Short] = Field(default_factory=list, max_length=300)
    hints: dict[Short, Annotated[int, Field(ge=0, le=10)]] = Field(default_factory=dict, max_length=300)
    assisted: list[Short] = Field(default_factory=list, max_length=100)
    attempts: list[PracticeAttempt] = Field(default_factory=list, max_length=100)
    projectSteps: list[Short] = Field(default_factory=list, max_length=30)
    incidentActions: list[Annotated[int, Field(ge=0, le=100)]] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def bounded(self):
        if len(self.model_dump_json().encode()) > 2_000_000:
            raise ValueError('Workspace exceeds the 2 MB limit. Export and reduce large notes.')
        if len({a.id for a in self.attempts}) != len(self.attempts):
            raise ValueError('Attempt IDs must be unique within a workspace.')
        return self


class WorkspaceWrite(StrictModel):
    expected_owner_id: UUID
    revision: int = Field(ge=0)
    state: WorkspaceState


class ImportPreview(StrictModel):
    expected_owner_id: UUID
    state: WorkspaceState


class ImportCommit(StrictModel):
    expected_owner_id: UUID
    ownership_confirmed: Literal[True]


class ArtifactWrite(StrictModel):
    expected_owner_id: UUID
    request_id: UUID
    mission_id: UUID | None = None
    parent_artifact_id: UUID | None = None
    challenge_id: Short
    challenge_version: int = Field(default=1, ge=1, le=10000)
    language: Language = 'javascript'
    code: str = Field(max_length=20000)
    explanation: str = Field(default='', max_length=6000)
    assistance: Literal['UNKNOWN', 'KNOWN_ASSISTED'] = 'UNKNOWN'
    passed: int | None = Field(default=None, ge=0, le=30)
    total: int | None = Field(default=None, ge=1, le=30)

    @model_validator(mode='after')
    def checks(self):
        if self.language != 'javascript' and self.passed is not None:
            raise ValueError('Practice execution results are supported only for JavaScript.')
        if (self.passed is None) != (self.total is None) or (self.passed is not None and self.passed > self.total):
            raise ValueError('Practice check counts must be supplied together and be consistent.')
        return self


class MentorRequest(StrictModel):
    expected_owner_id: UUID
    request_id: UUID
    mode: Literal['hint', 'reasoning', 'debug', 'review', 'concept', 'solution', 'interview', 'project']
    question: str = Field(min_length=1, max_length=6000)
    context: str = Field(default='', max_length=12000)
    code: Text = ''
    language: Literal['javascript', 'python', 'java', 'cpp', 'text'] = 'javascript'


def digest(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def merge_guest(current: WorkspaceState, guest: WorkspaceState) -> tuple[WorkspaceState, dict]:
    """Existing records win conflicts; preview describes every preserved/skipped item."""
    merged = current.model_dump(mode='json')
    incoming = guest.model_dump(mode='json')
    report = {'added': 0, 'conflicts': 0, 'duplicate_attempts': 0}
    for field in ('drafts', 'notes', 'hints'):
        for key, value in incoming[field].items():
            if key in merged[field]:
                report['conflicts'] += int(merged[field][key] != value)
            else:
                merged[field][key] = value
                report['added'] += 1
    for field in ('bookmarks', 'learned', 'assisted', 'projectSteps', 'incidentActions'):
        for value in incoming[field]:
            if value not in merged[field]:
                merged[field].append(value)
                report['added'] += 1
    existing = {a['id'] for a in merged['attempts']}
    for attempt in incoming['attempts']:
        if attempt['id'] in existing:
            report['duplicate_attempts'] += 1
        else:
            merged['attempts'].append(attempt)
            existing.add(attempt['id'])
            report['added'] += 1
    # Never truncate overflow silently. Students can import a smaller selection.
    return WorkspaceState.model_validate(merged), report
