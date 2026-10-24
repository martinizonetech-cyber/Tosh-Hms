import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class Visit(Base, TimestampMixin):
    __tablename__ = "visits"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    doctor_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("doctors.id"), index=True, nullable=False)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("appointments.id"), nullable=True, index=True)
    queue_entry_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, nullable=True, index=True)
    visit_type: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'New', 'Follow-up', 'Walk-in'
    started_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    patient = relationship("Patient", lazy="joined")
    doctor = relationship("Doctor", lazy="joined")
    vitals_records = relationship("VitalsRecord", back_populates="visit", order_by="desc(VitalsRecord.entered_at)", cascade="all, delete-orphan")


class VitalsRecord(Base):
    __tablename__ = "vitals"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    visit_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), index=True, nullable=False)
    blood_pressure: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    pulse: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    temperature: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    height: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    weight: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    oxygen_saturation: Mapped[str] = mapped_column(sa.String(30), default="", nullable=False)
    entered_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)
    entered_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    visit = relationship("Visit", back_populates="vitals_records")
