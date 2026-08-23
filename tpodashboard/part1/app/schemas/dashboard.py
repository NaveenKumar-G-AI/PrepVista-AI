
from pydantic import BaseModel


class DataQualityIssue(BaseModel):
    issue_type: str
    label: str
    count: int


class DataQualityResponse(BaseModel):
    total_students: int
    data_health_score: int  # 0-100
    issues: list[DataQualityIssue]


class StudentOverviewResponse(BaseModel):
    """
    Command Centre's real metrics. Part 1 deliberately excluded
    drives/applications/offers/placement % because no data existed for
    them. Part 2 adds those modules for real, so they're included here
    now -- computed from actual Drive/Application/Offer rows, never
    fabricated. If a future Part 3 module doesn't exist yet, the same
    discipline applies: omit the field rather than fake it.
    """

    total_students: int
    active_students: int
    seeking: int
    placed: int
    higher_studies: int
    not_seeking: int
    opted_out: int
    withdrawn: int
    avg_profile_completion_pct: float
    data_health_score: int
    students_with_readiness: int
    students_without_readiness: int
    active_drives: int
    total_applications: int
    total_offers: int
    placement_percentage: float | None  # null (not 0) when there's no seeking pool to divide by
    companies_engaged: int


class ReadinessOverviewResponse(BaseModel):
    cohort_average: float | None
    students_assessed: int
    students_total: int
    by_department: dict[str, float | None]
