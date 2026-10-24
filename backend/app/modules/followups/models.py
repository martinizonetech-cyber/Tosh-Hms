import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class FollowUp(Base, TimestampMixin):
    __tablename__ = "follow_ups"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    department: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)  # 'skin', 'orthopaedics'
    doctor_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("doctors.id"), index=True, nullable=False)
    date: Mapped[str] = mapped_column(sa.String(20), index=True, nullable=False)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(
        sa.String(30),
        default="Upcoming",
        index=True,
        nullable=False,
    )  # 'Upcoming', 'Completed', 'Overdue', 'Rescheduled', 'Cancelled'
    reminder_status: Mapped[str] = mapped_column(
        sa.String(30),
        default="Not sent",
        index=True,
        nullable=False,
    )  # 'Not sent', 'Queued', 'Sent'
    note: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    source_visit_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("visits.id"), nullable=True, index=True)

    patient = relationship("Patient", lazy="joined")
    doctor = relationship("Doctor", lazy="joined")
    reminder_logs = relationship("ReminderLog", back_populates="follow_up", cascade="all, delete-orphan", order_by="ReminderLog.created_at")


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    follow_up_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("follow_ups.id", ondelete="CASCADE"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'two-days-before', 'on-date', 'manual'
    channel: Mapped[str] = mapped_column(sa.String(30), default="whatsapp", nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    status: Mapped[str] = mapped_column(sa.String(30), default="Queued", nullable=False)  # 'Queued', 'Sent', 'Failed'
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    follow_up = relationship("FollowUp", back_populates="reminder_logs")
