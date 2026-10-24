import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidType, generate_uuid


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(sa.String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'reception', 'skin', 'orthopaedics'
    display_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    department: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)  # 'skin', 'orthopaedics'
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    doctor = relationship("Doctor", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UuidType, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    display_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)  # e.g. "Dr. Sangamitra"
    department: Mapped[str] = mapped_column(sa.String(30), nullable=False)  # 'skin', 'orthopaedics'

    user = relationship("User", back_populates="doctor")
