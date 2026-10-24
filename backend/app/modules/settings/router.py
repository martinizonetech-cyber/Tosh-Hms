from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppException
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.settings.models import FeeSetting
from app.modules.settings.schemas import FeeSettingsResponse, UpdateFeeRequest
from app.modules.users.models import User

router = APIRouter(prefix="/settings", tags=["Settings"])

require_reception = require_role("reception")


@router.get("/fees", response_model=FeeSettingsResponse, summary="Get clinic consultation fees")
async def get_fee_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeeSettingsResponse:
    stmt = select(FeeSetting)
    res = await db.execute(stmt)
    settings = res.scalars().all()

    fees = {"skin": 700.0, "orthopaedics": 900.0}
    for s in settings:
        dept = s.department.lower()
        if dept in fees:
            fees[dept] = round(s.amount / 100.0, 2)

    return FeeSettingsResponse(
        skin=fees["skin"],
        orthopaedics=fees["orthopaedics"],
        currency="INR",
    )


@router.put("/fees/{department}", response_model=FeeSettingsResponse, summary="Update consultation fee for department")
async def update_department_fee(
    department: str,
    payload: UpdateFeeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> FeeSettingsResponse:
    dept = department.lower()
    if dept not in ("skin", "orthopaedics"):
        raise AppException(f"Invalid department '{department}'. Must be 'skin' or 'orthopaedics'.", code="INVALID_DEPARTMENT", status_code=422)

    stmt = select(FeeSetting).where(FeeSetting.department == dept)
    res = await db.execute(stmt)
    fee_setting = res.scalar_one_or_none()

    amount_paise = round(payload.amount * 100)
    before_amount = fee_setting.amount if fee_setting else None

    if not fee_setting:
        fee_setting = FeeSetting(department=dept, amount=amount_paise, currency="INR", updated_by=current_user.id)
        db.add(fee_setting)
    else:
        fee_setting.amount = amount_paise
        fee_setting.updated_by = current_user.id

    await log_audit_event(
        db=db,
        action="FEE_SETTING_UPDATE",
        entity_type="FeeSetting",
        entity_id=dept,
        actor_user_id=current_user.id,
        before_state={"amount": before_amount},
        after_state={"amount": amount_paise},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(fee_setting)

    # Return full fee configuration
    return await get_fee_settings(db, current_user)
