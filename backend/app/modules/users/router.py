from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.users.models import Doctor
from app.modules.users.schemas import DoctorPublic

router = APIRouter(prefix="/doctors", tags=["Doctors"])


@router.get("", response_model=list[DoctorPublic], summary="List clinic doctors")
async def list_doctors(
    department: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[DoctorPublic]:
    stmt = select(Doctor).options(selectinload(Doctor.user))
    if department:
        stmt = stmt.where(Doctor.department == department)
    result = await db.execute(stmt)
    doctors = result.scalars().all()
    return [
        DoctorPublic(
            id=doc.id,
            display_name=doc.display_name,
            department=doc.department,
            email=doc.user.email if doc.user else None,
        )
        for doc in doctors
    ]
