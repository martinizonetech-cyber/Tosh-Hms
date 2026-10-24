import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    visit_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    visit_label: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    consultation_fee: Mapped[int] = mapped_column(sa.Integer, nullable=False)  # in paise

    patient = relationship("Patient", lazy="joined")
    visit = relationship("Visit", lazy="joined")
    charges = relationship("InvoiceCharge", back_populates="invoice", lazy="selectin", cascade="all, delete-orphan", order_by="InvoiceCharge.created_at")
    payments = relationship("Payment", back_populates="invoice", lazy="selectin", cascade="all, delete-orphan", order_by="Payment.paid_at")
    refunds = relationship("Refund", back_populates="invoice", lazy="selectin", cascade="all, delete-orphan", order_by="Refund.refunded_at")


class InvoiceCharge(Base):
    __tablename__ = "invoice_charges"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'CH-1'
    invoice_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    description: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    amount: Mapped[int] = mapped_column(sa.Integer, sa.CheckConstraint("amount > 0"), nullable=False)  # in paise
    added_by: Mapped[str] = mapped_column(sa.String(100), nullable=False)  # display name or user ID
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    invoice = relationship("Invoice", back_populates="charges")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'PAY-1'
    invoice_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[int] = mapped_column(sa.Integer, sa.CheckConstraint("amount > 0"), nullable=False)  # in paise
    method: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'Cash', 'UPI', 'GPay', 'PhonePe', 'Card', 'Other'
    transaction_reference: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)

    invoice = relationship("Invoice", back_populates="payments")


class Refund(Base):
    __tablename__ = "refunds"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'REF-1'
    invoice_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[int] = mapped_column(sa.Integer, sa.CheckConstraint("amount > 0"), nullable=False)  # in paise
    reason: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    refunded_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)

    invoice = relationship("Invoice", back_populates="refunds")
