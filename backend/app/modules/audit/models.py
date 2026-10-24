import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, UuidType, generate_uuid


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(sa.String(100), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(sa.String(100), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(sa.String(100), index=True, nullable=False)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UuidType, nullable=True, index=True)
    before_state: Mapped[dict | list | None] = mapped_column(JsonType, nullable=True)
    after_state: Mapped[dict | list | None] = mapped_column(JsonType, nullable=True)
    ip: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
        nullable=False,
    )
