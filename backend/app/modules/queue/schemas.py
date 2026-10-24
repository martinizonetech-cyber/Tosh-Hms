from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

QueueStatusLiteral = Literal["Waiting", "Consulting", "Completed"]
PaymentStatusLiteral = Literal["Paid", "Partial", "Due"]
VisitTypeLiteral = Literal["New", "Follow-up", "Walk-in"]
DepartmentLiteral = Literal["skin", "orthopaedics"]


class VitalsSchema(CamelModel):
    blood_pressure: str = ""
    pulse: str = ""
    temperature: str = ""
    height: str = ""
    weight: str = ""
    oxygen_saturation: str = ""


class CreateQueueRequest(CamelModel):
    patient_id: str = Field(..., min_length=1)
    department: DepartmentLiteral
    doctor: str = Field(..., min_length=1)
    visit_type: VisitTypeLiteral = "New"
    note: str | None = Field(default=None, max_length=240)
    vitals: VitalsSchema | None = None


class UpdateQueueRequest(CamelModel):
    status: QueueStatusLiteral


class QueueEntryResponse(CamelModel):
    id: str  # Q-1001
    token: str  # S-001 or O-001
    patient_id: str  # PT-1001
    visit_id: str | None = None  # VIS-1001
    department: str
    doctor: str
    arrival_at: str
    status: str
    payment_status: str = "Due"
    visit_type: str = "New"
    note: str | None = None
    vitals: VitalsSchema | None = None


class PaginatedQueueResponse(CamelModel):
    items: list[QueueEntryResponse]
    page: int
    page_size: int
    total: int
