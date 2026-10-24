from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel

AppointmentStatusType = Literal["Scheduled", "Checked-in", "In progress", "Completed", "Cancelled", "No-show"]
VisitTypeLiteral = Literal["New", "Follow-up", "Walk-in"]
DepartmentLiteral = Literal["skin", "orthopaedics"]


class CreateAppointmentRequest(CamelModel):
    patient_id: str = Field(..., min_length=1)
    department: DepartmentLiteral
    doctor: str = Field(..., min_length=1)
    starts_at: str = Field(..., min_length=1)
    visit_type: VisitTypeLiteral = "New"
    note: str | None = Field(default=None, max_length=240)

    @field_validator("note")
    @classmethod
    def validate_note(cls, v: str | None) -> str | None:
        if v and len(v.strip()) > 240:
            raise ValueError("Keep the visit note under 240 characters.")
        return v.strip() if v else None


class UpdateAppointmentRequest(CamelModel):
    status: AppointmentStatusType | None = None
    starts_at: str | None = None
    doctor: str | None = None
    note: str | None = None


class AppointmentResponse(CamelModel):
    id: str  # APT-1001
    patient_id: str  # PT-1001
    department: str
    doctor: str
    starts_at: str
    visit_type: str
    note: str | None = None
    status: str


class PaginatedAppointmentsResponse(CamelModel):
    items: list[AppointmentResponse]
    page: int
    page_size: int
    total: int
