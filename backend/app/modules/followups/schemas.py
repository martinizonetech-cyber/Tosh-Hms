from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

FollowUpStatusLiteral = Literal["Upcoming", "Completed", "Overdue", "Rescheduled", "Cancelled"]
ReminderStatusLiteral = Literal["Not sent", "Queued", "Sent"]
DepartmentLiteral = Literal["skin", "orthopaedics"]


class FollowUpResponse(CamelModel):
    id: str  # FU-1001
    patient_id: str  # PT-1001
    department: str
    doctor: str
    date: str  # YYYY-MM-DD
    status: FollowUpStatusLiteral
    reminder_status: ReminderStatusLiteral
    note: str | None = None


class PaginatedFollowUpsResponse(CamelModel):
    items: list[FollowUpResponse]
    page: int
    page_size: int
    total: int


class CreateFollowUpRequest(CamelModel):
    patient_id: str = Field(..., min_length=1)
    department: DepartmentLiteral
    doctor: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)
    note: str | None = None


class UpdateFollowUpRequest(CamelModel):
    status: FollowUpStatusLiteral | None = None
    date: str | None = None
    note: str | None = None
    reminder_action: Literal["queue", "send"] | None = None
