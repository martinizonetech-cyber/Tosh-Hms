from pydantic import Field, field_validator

from app.core.schemas import CamelModel


class CatalogItemResponse(CamelModel):
    id: str  # CHG-101
    name: str
    category: str
    price: float  # In Rupees
    unit: str | None = None
    department: str = "all"
    is_active: bool = True


class CreateCatalogItemRequest(CamelModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=50)
    price: float = Field(..., ge=0)
    unit: str | None = Field(default=None, max_length=100)
    department: str = Field(default="all", max_length=30)

    @field_validator("price")
    @classmethod
    def validate_price(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Price cannot be negative.")
        return round(v, 2)


class UpdateCatalogItemRequest(CamelModel):
    name: str | None = None
    category: str | None = None
    price: float | None = None
    unit: str | None = None
    department: str | None = None
    is_active: bool | None = None

    @field_validator("price")
    @classmethod
    def validate_price(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative.")
        return round(v, 2) if v is not None else None
