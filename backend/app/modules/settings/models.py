import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class FeeSetting(Base, TimestampMixin):
    __tablename__ = "fee_settings"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    department: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)  # 'skin', 'orthopaedics'
    amount: Mapped[int] = mapped_column(sa.Integer, nullable=False)  # in paise
    currency: Mapped[str] = mapped_column(sa.String(3), default="INR", nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)
