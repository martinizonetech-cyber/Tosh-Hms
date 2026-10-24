import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenException, NotFoundException
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.followups.models import FollowUp, ReminderLog
from app.modules.followups.schemas import (
    CreateFollowUpRequest,
    FollowUpResponse,
    PaginatedFollowUpsResponse,
    UpdateFollowUpRequest,
)
from app.modules.patients.router import find_patient_by_id
from app.modules.users.models import Doctor, User
from app.services.notification import get_notification_provider
from app.services.scheduler import get_today_ist

router = APIRouter(prefix="/follow-ups", tags=["Follow-ups"])

require_staff = require_role("reception", "skin", "orthopaedics")


async def find_followup_by_id(db: AsyncSession, identifier: str) -> FollowUp | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(FollowUp).where(or_(FollowUp.id == val_uuid, FollowUp.display_id == identifier))
    except ValueError:
        stmt = select(FollowUp).where(FollowUp.display_id == identifier)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


def compute_followup_status(fu: FollowUp) -> str:
    today_ist = get_today_ist()
    if fu.status == "Upcoming" and fu.date < today_ist:
        return "Overdue"
    return fu.status


def to_followup_response(fu: FollowUp) -> FollowUpResponse:
    effective_status = compute_followup_status(fu)
    pat_id = fu.patient.display_id if fu.patient else str(fu.patient_id)
    doc_name = fu.doctor.display_name if fu.doctor else "Doctor"
    return FollowUpResponse(
        id=fu.display_id,
        patient_id=pat_id,
        department=fu.department,
        doctor=doc_name,
        date=fu.date,
        status=effective_status,  # type: ignore[arg-type]
        reminder_status=fu.reminder_status,  # type: ignore[arg-type]
        note=fu.note,
    )


@router.get("", response_model=PaginatedFollowUpsResponse, summary="List follow-ups")
async def list_follow_ups(
    department: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_id: str | None = Query(None, alias="patientId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedFollowUpsResponse:
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians cannot access follow-ups from other departments.")
        department = current_user.role

    stmt = select(FollowUp)
    if department:
        stmt = stmt.where(FollowUp.department == department.lower())

    if patient_id:
        patient = await find_patient_by_id(db, patient_id)
        if patient:
            stmt = stmt.where(FollowUp.patient_id == patient.id)
        else:
            stmt = stmt.where(FollowUp.patient_id == uuid.uuid4())

    stmt = stmt.order_by(FollowUp.date.asc())
    res = await db.execute(stmt)
    follow_ups = res.scalars().all()

    matched: list[FollowUpResponse] = []
    for fu in follow_ups:
        resp = to_followup_response(fu)
        if status_filter:
            if resp.status.lower() == status_filter.lower():
                matched.append(resp)
        else:
            matched.append(resp)

    total = len(matched)
    start_idx = (page - 1) * page_size
    paged_items = matched[start_idx : start_idx + page_size]

    return PaginatedFollowUpsResponse(
        items=paged_items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED, summary="Create follow-up")
async def create_follow_up(
    payload: CreateFollowUpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> FollowUpResponse:
    dept = payload.department.lower()
    if current_user.role in ("skin", "orthopaedics") and dept != current_user.role:
        raise ForbiddenException("Clinicians cannot schedule follow-ups for other departments.")

    patient = await find_patient_by_id(db, payload.patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {payload.patient_id} not found.")

    doc_stmt = select(Doctor).where(Doctor.department == dept)
    if payload.doctor:
        doc_stmt = doc_stmt.where(Doctor.display_name == payload.doctor)
    doc_res = await db.execute(doc_stmt)
    doctor = doc_res.scalar_one_or_none()
    if not doctor:
        fallback_stmt = select(Doctor).where(Doctor.department == dept)
        doc_res = await db.execute(fallback_stmt)
        doctor = doc_res.scalar_one_or_none()
        if not doctor:
            raise NotFoundException(f"No doctor found for department {dept}.")

    display_id = await next_display_id(db, FollowUp, "FU")
    fu = FollowUp(
        display_id=display_id,
        patient_id=patient.id,
        department=dept,
        doctor_id=doctor.id,
        date=payload.date,
        status="Upcoming",
        reminder_status="Not sent",
        note=payload.note,
    )
    db.add(fu)

    await log_audit_event(
        db=db,
        action="FOLLOWUP_CREATE",
        entity_type="FollowUp",
        entity_id=display_id,
        actor_user_id=current_user.id,
        patient_id=patient.id,
        after_state={"date": fu.date, "department": fu.department},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(fu)
    return to_followup_response(fu)


@router.patch("/{followup_id}", response_model=FollowUpResponse, summary="Update follow-up or trigger reminder")
async def update_follow_up(
    followup_id: str,
    payload: UpdateFollowUpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> FollowUpResponse:
    fu = await find_followup_by_id(db, followup_id)
    if not fu:
        raise NotFoundException(f"Follow-up with ID {followup_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and fu.department != current_user.role:
        raise ForbiddenException("Clinicians cannot update follow-ups for other departments.")

    if payload.status is not None:
        fu.status = payload.status
    if payload.date is not None:
        fu.date = payload.date
    if payload.note is not None:
        fu.note = payload.note

    # Reminder Actions
    if payload.reminder_action == "queue":
        fu.reminder_status = "Queued"
        log_entry = ReminderLog(
            follow_up_id=fu.id,
            kind="manual",
            channel="whatsapp",
            status="Queued",
        )
        db.add(log_entry)

    elif payload.reminder_action == "send":
        fu.reminder_status = "Queued"
        provider = get_notification_provider()
        phone = fu.patient.phone if fu.patient else ""
        msg = f"Reminder: Your follow-up is on {fu.date} with {fu.doctor.display_name if fu.doctor else 'the doctor'}."
        success, msg_id = await provider.send_reminder(phone=phone, message=msg, kind="manual")

        log_entry = ReminderLog(
            follow_up_id=fu.id,
            kind="manual",
            channel="whatsapp",
            status="Sent" if success else "Queued",
            provider_message_id=msg_id,
        )
        db.add(log_entry)

        if success:
            fu.reminder_status = "Sent"

    await log_audit_event(
        db=db,
        action="FOLLOWUP_UPDATE",
        entity_type="FollowUp",
        entity_id=fu.display_id,
        actor_user_id=current_user.id,
        patient_id=fu.patient_id,
        after_state={"status": fu.status, "date": fu.date, "reminderStatus": fu.reminder_status},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(fu)
    return to_followup_response(fu)
