import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundException
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.catalog.models import ChargeCatalogItem
from app.modules.catalog.schemas import (
    CatalogItemResponse,
    CreateCatalogItemRequest,
    UpdateCatalogItemRequest,
)
from app.modules.users.models import User

router = APIRouter(prefix="/catalog/charges", tags=["Catalog"])

require_staff = require_role("reception", "skin", "orthopaedics")


async def find_catalog_item_by_id(db: AsyncSession, identifier: str) -> ChargeCatalogItem | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(ChargeCatalogItem).where(or_(ChargeCatalogItem.id == val_uuid, ChargeCatalogItem.display_id == identifier))
    except ValueError:
        stmt = select(ChargeCatalogItem).where(ChargeCatalogItem.display_id == identifier)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


def to_catalog_response(item: ChargeCatalogItem) -> CatalogItemResponse:
    return CatalogItemResponse(
        id=item.display_id,
        name=item.name,
        category=item.category,
        price=round(item.price / 100.0, 2),
        unit=item.unit,
        department=item.department,
        is_active=item.is_active,
    )


@router.get("", response_model=list[CatalogItemResponse], summary="List catalog charge items")
async def list_catalog_charges(
    department: str | None = Query(None),
    category: str | None = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogItemResponse]:
    stmt = select(ChargeCatalogItem)
    if not include_inactive:
        stmt = stmt.where(ChargeCatalogItem.is_active.is_(True))

    if department:
        stmt = stmt.where(or_(ChargeCatalogItem.department == department.lower(), ChargeCatalogItem.department == "all"))

    if category:
        stmt = stmt.where(ChargeCatalogItem.category == category)

    stmt = stmt.order_by(ChargeCatalogItem.category.asc(), ChargeCatalogItem.name.asc())
    res = await db.execute(stmt)
    items = res.scalars().all()
    return [to_catalog_response(item) for item in items]


@router.post("", response_model=CatalogItemResponse, status_code=status.HTTP_201_CREATED, summary="Create catalog charge item")
async def create_catalog_charge(
    payload: CreateCatalogItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> CatalogItemResponse:
    display_id = await next_display_id(db, ChargeCatalogItem, "CHG")
    price_paise = round(payload.price * 100)
    item = ChargeCatalogItem(
        display_id=display_id,
        name=payload.name,
        category=payload.category,
        price=price_paise,
        unit=payload.unit,
        department=payload.department.lower(),
        is_active=True,
    )
    db.add(item)

    await log_audit_event(
        db=db,
        action="CATALOG_CHARGE_CREATE",
        entity_type="ChargeCatalogItem",
        entity_id=display_id,
        actor_user_id=current_user.id,
        after_state={"name": item.name, "category": item.category, "price": payload.price},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(item)
    return to_catalog_response(item)


@router.put("/{item_id}", response_model=CatalogItemResponse, summary="Update catalog charge item")
async def update_catalog_charge(
    item_id: str,
    payload: UpdateCatalogItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> CatalogItemResponse:
    item = await find_catalog_item_by_id(db, item_id)
    if not item:
        raise NotFoundException(f"Catalog charge item with ID {item_id} not found.")

    before_state = {"name": item.name, "category": item.category, "price": round(item.price / 100.0, 2), "is_active": item.is_active}

    if payload.name is not None:
        item.name = payload.name
    if payload.category is not None:
        item.category = payload.category
    if payload.price is not None:
        item.price = round(payload.price * 100)
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.department is not None:
        item.department = payload.department.lower()
    if payload.is_active is not None:
        item.is_active = payload.is_active

    await log_audit_event(
        db=db,
        action="CATALOG_CHARGE_UPDATE",
        entity_type="ChargeCatalogItem",
        entity_id=item.display_id,
        actor_user_id=current_user.id,
        before_state=before_state,
        after_state={"name": item.name, "category": item.category, "price": round(item.price / 100.0, 2), "is_active": item.is_active},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(item)
    return to_catalog_response(item)


@router.delete("/{item_id}", summary="Deactivate catalog charge item")
async def delete_catalog_charge(
    item_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> dict:
    item = await find_catalog_item_by_id(db, item_id)
    if not item:
        raise NotFoundException(f"Catalog charge item with ID {item_id} not found.")

    item.is_active = False

    await log_audit_event(
        db=db,
        action="CATALOG_CHARGE_DEACTIVATE",
        entity_type="ChargeCatalogItem",
        entity_id=item.display_id,
        actor_user_id=current_user.id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    return {"message": "Catalog charge item deactivated successfully."}
