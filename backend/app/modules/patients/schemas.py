from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel

GenderType = Literal["Female", "Male", "Other", "Prefer not to say"]
DepartmentType = Literal["skin", "orthopaedics"]


class CreatePatientRequest(CamelModel):
    full_name: str = Field(..., min_length=2, max_length=60)
    date_of_birth: str = Field(..., min_length=1)
    gender: GenderType
    phone: str = Field(..., min_length=7, max_length=13)
    email: str | None = Field(default=None, max_length=80)
    address: str = Field(..., min_length=4, max_length=150)
    emergency_contact: str | None = Field(default=None, max_length=60)
    department: DepartmentType

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned.isdigit():
            raise ValueError("Phone number must contain numbers only.")
        if len(cleaned) < 7 or len(cleaned) > 13:
            raise ValueError("Phone number must be between 7 and 13 digits.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v or v.strip() == "":
            return None
        cleaned = v.strip()
        if "@" not in cleaned or "." not in cleaned:
            raise ValueError("Enter a valid email address.")
        return cleaned

    @field_validator("full_name", "address")
    @classmethod
    def trim_strings(cls, v: str) -> str:
        return v.strip()


class PatientResponse(CamelModel):
    id: str  # display_id e.g. PT-1001
    full_name: str
    date_of_birth: str
    gender: str
    phone: str
    email: str | None = None
    address: str
    emergency_contact: str | None = None
    departments: list[str] = Field(default_factory=list)
    registered_at: str
    latest_visit_at: str | None = None


class PaginatedPatientsResponse(CamelModel):
    items: list[PatientResponse]
    page: int
    page_size: int
    total: int
