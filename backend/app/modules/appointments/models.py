import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    doctor_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("doctors.id"), index=True, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), index=True, nullable=False)
    visit_type: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'New', 'Follow-up', 'Walk-in'
    note: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    status: Mapped[str] = mapped_column(
        sa.String(30),
        default="Scheduled",
        index=True,
        nullable=False,
    )  # 'Scheduled', 'Checked-in', 'In progress', 'Completed', 'Cancelled', 'No-show'
    created_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)

    patient = relationship("Patient", lazy="joined")
    doctor = relationship("Doctor", lazy="joined")
