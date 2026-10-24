from pydantic import Field

from app.core.schemas import CamelModel


class DailyReportEntry(CamelModel):
    date: str
    appointments: int
    completed_visits: int
    collections: float


class ReportSummaryResponse(CamelModel):
    from_: str = Field(..., serialization_alias="from", alias="from")
    to: str
    department: str | None = None
    registrations: int = 0
    appointments: int = 0
    completed_visits: int = 0
    walk_ins: int = 0
    collections: float = 0.0
    outstanding_balance: float = 0.0
    follow_up_completion: int = 0
    payment_methods: dict[str, float] = Field(default_factory=dict)
    daily: list[DailyReportEntry] = Field(default_factory=list)
    department_activity: dict[str, int] = Field(default_factory=dict)


class DashboardSummaryResponse(CamelModel):
    waiting_count: int = 0
    consulting_count: int = 0
    completed_count: int = 0
    appointments_count: int = 0
    collections: float = 0.0
    follow_ups_count: int = 0
