import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UuidType, generate_uuid


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    visit_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("visits.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    size: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    category: Mapped[str] = mapped_column(sa.String(100), default="General", nullable=False)
    storage_key: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    checksum: Mapped[str] = mapped_column(sa.String(64), nullable=False)  # SHA-256
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
        index=True,
    )  # Soft delete

    patient = relationship("Patient", lazy="joined")
    visit = relationship("Visit", lazy="joined")
