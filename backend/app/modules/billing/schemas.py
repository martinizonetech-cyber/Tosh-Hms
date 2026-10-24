from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel

PaymentMethodLiteral = Literal["Cash", "UPI", "GPay", "PhonePe", "Card", "Other"]
InvoiceStatusLiteral = Literal["Paid", "Partial", "Due"]


class PaymentResponse(CamelModel):
    id: str  # PAY-1001
    amount: float  # In Rupees
    method: str
    transaction_reference: str | None = None
    paid_at: str
    recorded_by: str | None = None


class RefundResponse(CamelModel):
    id: str  # REF-1001
    amount: float  # In Rupees
    reason: str
    refunded_at: str
    recorded_by: str | None = None


class ChargeItemResponse(CamelModel):
    id: str  # CH-1
    description: str
    amount: float  # In Rupees
    department: str
    added_by: str
    date: str


class InvoiceResponse(CamelModel):
    id: str  # INV-1001
    patient_id: str  # PT-1001
    department: str
    visit_label: str
    consultation_fee: float  # In Rupees
    charges: list[ChargeItemResponse] = Field(default_factory=list)
    payments: list[PaymentResponse] = Field(default_factory=list)
    refunds: list[RefundResponse] = Field(default_factory=list)
    total: float
    paid: float
    balance: float
    status: InvoiceStatusLiteral
    created_at: str
    date: str = ""


class PaginatedInvoicesResponse(CamelModel):
    items: list[InvoiceResponse]
    page: int
    page_size: int
    total: int


class RecordPaymentRequest(CamelModel):
    amount: float = Field(..., gt=0)
    method: PaymentMethodLiteral
    transaction_reference: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Payment amount must be greater than zero.")
        return round(v, 2)


class RecordRefundRequest(CamelModel):
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=2, max_length=255)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Refund amount must be greater than zero.")
        return round(v, 2)


class CreateVisitChargeRequest(CamelModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: float = Field(..., gt=0)
    category: str | None = None
    catalog_item_id: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Charge amount must be greater than zero.")
        return round(v, 2)
