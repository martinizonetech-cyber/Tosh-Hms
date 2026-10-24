import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JsonType, TimestampMixin, UuidType, generate_uuid


class Consultation(Base, TimestampMixin):
    __tablename__ = "consultations"

    # Primary key equals visit_id as per domain model and contracts
    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True)
    visit_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    symptoms: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    medical_history: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    allergies: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    examination: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    assessment: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    diagnosis: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    treatment_plan: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    follow_up_date: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    pain_location: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    side: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)  # 'Left', 'Right', 'Bilateral', 'Not applicable'
    body_region_template: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
    status: Mapped[str] = mapped_column(sa.String(20), default="Draft", index=True, nullable=False)  # 'Draft', 'Finalized'
    finalized_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    finalized_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)
    version: Mapped[int] = mapped_column(sa.Integer, default=1, nullable=False)

    visit = relationship("Visit", lazy="joined")
    patient = relationship("Patient", lazy="joined")
    prescriptions = relationship("PrescriptionItem", back_populates="consultation", cascade="all, delete-orphan", order_by="PrescriptionItem.sort_order")


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'RX-1'
    consultation_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("consultations.id", ondelete="CASCADE"), index=True, nullable=False)
    medicine_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    strength: Mapped[str] = mapped_column(sa.String(100), default="", nullable=False)
    dosage: Mapped[str] = mapped_column(sa.String(100), default="", nullable=False)
    route: Mapped[str] = mapped_column(sa.String(50), default="", nullable=False)
    frequency: Mapped[str] = mapped_column(sa.String(100), default="", nullable=False)
    duration: Mapped[str] = mapped_column(sa.String(100), default="", nullable=False)
    instructions: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)

    consultation = relationship("Consultation", back_populates="prescriptions")
