import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, TimestampMixin, UuidType, generate_uuid


class ChargeCatalogItem(Base, TimestampMixin):
    __tablename__ = "charge_catalog"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    display_id: Mapped[str] = mapped_column(sa.String(30), unique=True, index=True, nullable=False)  # 'CHG-101'
    name: Mapped[str] = mapped_column(sa.String(200), index=True, nullable=False)
    category: Mapped[str] = mapped_column(sa.String(50), index=True, nullable=False)  # 'Injection', 'Consumable', 'Procedure', 'Service', 'Other'
    price: Mapped[int] = mapped_column(sa.Integer, sa.CheckConstraint("price >= 0"), nullable=False)  # in paise
    unit: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    department: Mapped[str] = mapped_column(sa.String(30), default="all", index=True, nullable=False)  # 'skin', 'orthopaedics', 'all'
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, index=True, nullable=False)


class BodyRegionTemplate(Base, TimestampMixin):
    __tablename__ = "body_region_templates"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=generate_uuid)
    region: Mapped[str] = mapped_column(sa.String(100), unique=True, index=True, nullable=False)
    fields: Mapped[dict | list] = mapped_column(JsonType, nullable=False)
    medications: Mapped[dict | list] = mapped_column(JsonType, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UuidType, sa.ForeignKey("users.id"), nullable=True)
