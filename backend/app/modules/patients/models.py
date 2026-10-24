import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(sa.String(100), index=True, nullable=False)
    date_of_birth: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    gender: Mapped[str] = mapped_column(sa.String(30), nullable=False)
    phone: Mapped[str] = mapped_column(sa.String(30), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    address: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    emergency_contact: Mapped[str | None] = mapped_column(sa.String(60), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    latest_visit_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
