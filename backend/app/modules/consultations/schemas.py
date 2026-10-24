from typing import Any, Literal

from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.schemas import CamelModel
from app.modules.documents.schemas import PatientDocumentResponse
from app.modules.queue.schemas import VitalsSchema

SideType = Literal["Left", "Right", "Bilateral", "Not applicable"]
ConsultationStatusType = Literal["Draft", "Finalized"]


class PrescriptionItemSchema(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="ignore",
    )
    id: str | None = None
    medicine_name: str = ""
    strength: str = ""
    dosage: str = ""
    route: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str | None = None


class PrescriptionImageSchema(CamelModel):
    id: str
    name: str
    mime_type: str
    size: int
    uploaded_at: str
    data_url: str | None = None
    url: str | None = None


class ChargeItemSchema(CamelModel):
    id: str  # CHG-1001
    description: str
    amount: float
    department: str
    added_by: str
    date: str


class BodyRegionTemplateData(CamelModel):
    region: str
    side: SideType
    examination_fields: dict[str, str] = Field(default_factory=dict)
    findings: str = ""
    treatment_advice: str = ""
    prescription: str = ""
    follow_up_instructions: str = ""


class ConsultationResponse(CamelModel):
    id: str  # visit display ID e.g. VIS-1001
    patient_id: str  # PT-1001
    department: str
    visited_at: str
    vitals: VitalsSchema
    symptoms: str = ""
    medical_history: str = ""
    allergies: str = ""
    examination: str = ""
    assessment: str = ""
    diagnosis: str = ""
    treatment_plan: str = ""
    prescription: list[PrescriptionItemSchema] = Field(default_factory=list)
    prescription_images: list[PrescriptionImageSchema] = Field(default_factory=list)
    documents: list[PatientDocumentResponse] = Field(default_factory=list)
    procedures: list[ChargeItemSchema] = Field(default_factory=list)
    follow_up_date: str | None = None
    pain_location: str | None = None
    side: str | None = None
    body_region_template: dict[str, Any] | None = None
    status: str = "Draft"
    version: int = 1


class PaginatedConsultationsResponse(CamelModel):
    items: list[ConsultationResponse]
    page: int
    page_size: int
    total: int


class SaveConsultationRequest(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="ignore",
    )
    visit_id: str | None = None
    patient_id: str | None = None
    department: str | None = None
    version: int | None = None
    symptoms: str | None = None
    medical_history: str | None = None
    allergies: str | None = None
    examination: str | None = None
    assessment: str | None = None
    diagnosis: str | None = None
    treatment_plan: str | None = None
    prescription: list[PrescriptionItemSchema] | None = None
    follow_up_date: str | None = None
    pain_location: str | None = None
    side: SideType | None = None
    body_region_template: dict[str, Any] | None = None
    status: ConsultationStatusType | None = None


class UpdateVitalsRequest(CamelModel):
    blood_pressure: str | None = None
    pulse: str | None = None
    temperature: str | None = None
    height: str | None = None
    weight: str | None = None
    oxygen_saturation: str | None = None
