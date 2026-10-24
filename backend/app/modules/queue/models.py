import uuid
from datetime import UTC, date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class QueueEntry(Base, TimestampMixin):
    __tablename__ = "queue_entries"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    token: Mapped[str] = mapped_column(sa.String(20), index=True, nullable=False)  # 'S-001' or 'O-001'
    visit_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    doctor_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("doctors.id"), index=True, nullable=False)
    arrival_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        sa.String(30),
        default="Waiting",
        index=True,
        nullable=False,
    )  # 'Waiting', 'Consulting', 'Completed'
    visit_type: Mapped[str] = mapped_column(sa.String(30), default="New", nullable=False)
    note: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    patient = relationship("Patient", lazy="joined")
    doctor = relationship("Doctor", lazy="joined")
    visit = relationship("Visit", lazy="joined")


class DailyTokenCounter(Base):
    __tablename__ = "daily_token_counters"

    department: Mapped[str] = mapped_column(sa.String(30), primary_key=True)
    date: Mapped[date] = mapped_column(sa.Date, primary_key=True)
    current_number: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
