from pydantic import Field, field_validator

from app.core.schemas import CamelModel


class FeeSettingsResponse(CamelModel):
    skin: float
    orthopaedics: float
    currency: str = "INR"


class UpdateFeeRequest(CamelModel):
    amount: float = Field(..., ge=0)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Fee cannot be negative.")
        return round(v, 2)
