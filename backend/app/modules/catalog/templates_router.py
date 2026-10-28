from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenException
from app.core.schemas import CamelModel
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import require_role
from app.modules.catalog.models import BodyRegionTemplate
from app.modules.users.models import User

router = APIRouter(prefix="/templates/body-regions", tags=["Templates"])

require_ortho_or_staff = require_role("orthopaedics", "reception")


class BodyRegionMedicationSchema(CamelModel):
    id: str = ""
    medicine_name: str = ""
    strength: str = ""
    dosage: str = ""
    route: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class BodyRegionDefinitionSchema(CamelModel):
    region: str
    fields: list[str] = []
    medications: list[BodyRegionMedicationSchema] = []


@router.get("", response_model=list[BodyRegionDefinitionSchema], summary="Get body region clinical templates")
async def get_body_region_templates(
    db: AsyncSession = Depends(get_db),
) -> list[BodyRegionDefinitionSchema]:
    stmt = select(BodyRegionTemplate).order_by(BodyRegionTemplate.region.asc())
    res = await db.execute(stmt)
    templates = res.scalars().all()

    output = []
    for tmpl in templates:
        output.append(
            BodyRegionDefinitionSchema(
                region=tmpl.region,
                fields=list(tmpl.fields or []),
                medications=[
                    BodyRegionMedicationSchema(
                        id=m.get("id", ""),
                        medicine_name=m.get("medicineName") or m.get("medicine_name", ""),
                        strength=m.get("strength", ""),
                        dosage=m.get("dosage", ""),
                        route=m.get("route", ""),
                        frequency=m.get("frequency", ""),
                        duration=m.get("duration", ""),
                        instructions=m.get("instructions", ""),
                    )
                    for m in (tmpl.medications or [])
                ],
            )
        )
    return output


@router.put("", response_model=list[BodyRegionDefinitionSchema], summary="Update body region clinical templates")
async def update_body_region_templates(
    payload: list[BodyRegionDefinitionSchema],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_ortho_or_staff),
) -> list[BodyRegionDefinitionSchema]:
    if current_user.role == "skin":
        raise ForbiddenException("Skin clinicians cannot modify orthopaedic body region templates.")

    # Remove any templates not in payload
    active_regions = {item.region for item in payload}
    existing_all = (await db.execute(select(BodyRegionTemplate))).scalars().all()
    for ex in existing_all:
        if ex.region not in active_regions:
            await db.delete(ex)

    for item in payload:
        stmt = select(BodyRegionTemplate).where(BodyRegionTemplate.region == item.region)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        meds_dict = [m.model_dump(by_alias=True) for m in item.medications]
        if existing:
            existing.fields = item.fields
            existing.medications = meds_dict
            existing.updated_by = current_user.id
        else:
            new_obj = BodyRegionTemplate(
                region=item.region,
                fields=item.fields,
                medications=meds_dict,
                updated_by=current_user.id,
            )
            db.add(new_obj)

    await log_audit_event(
        db=db,
        action="BODY_REGION_TEMPLATES_UPDATE",
        entity_type="BodyRegionTemplate",
        entity_id="all",
        actor_user_id=current_user.id,
        after_state={"count": len(payload)},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    return await get_body_region_templates(db)
