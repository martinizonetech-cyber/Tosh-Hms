import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictException, ForbiddenException, NotFoundException
from app.db.session import get_db
from app.modules.appointments.models import Appointment
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.billing.models import Invoice
from app.modules.checkin.service import CheckInService
from app.modules.patients.router import find_patient_by_id
from app.modules.queue.models import QueueEntry
from app.modules.queue.schemas import (
    CreateQueueRequest,
    PaginatedQueueResponse,
    QueueEntryResponse,
    UpdateQueueRequest,
    VitalsSchema,
)
from app.modules.users.models import Doctor, User
from app.modules.visits.models import VitalsRecord

router = APIRouter(prefix="/queue", tags=["Queue"])

VALID_QUEUE_TRANSITIONS: dict[str, set[str]] = {
    "Waiting": {"Consulting"},
    "Consulting": {"Completed", "Waiting"},
    "Completed": set(),
}


async def find_queue_entry_by_id(db: AsyncSession, identifier: str) -> QueueEntry | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(QueueEntry).where(or_(QueueEntry.id == val_uuid, QueueEntry.display_id == identifier))
    except ValueError:
        stmt = select(QueueEntry).where(QueueEntry.display_id == identifier)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def compute_payment_status(db: AsyncSession, visit_id: uuid.UUID | None) -> str:
    if not visit_id:
        return "Due"
    from app.modules.billing.models import InvoiceCharge, Payment

    inv_stmt = select(Invoice.id, Invoice.consultation_fee).where(Invoice.visit_id == visit_id)
    inv_res = await db.execute(inv_stmt)
    inv_row = inv_res.first()
    if not inv_row:
        return "Due"
    invoice_id, fee = inv_row

    chg_stmt = select(func.coalesce(func.sum(InvoiceCharge.amount), 0)).where(InvoiceCharge.invoice_id == invoice_id)
    chg_res = await db.execute(chg_stmt)
    charges_sum = int(chg_res.scalar_one())

    pay_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == invoice_id)
    pay_res = await db.execute(pay_stmt)
    payments_sum = int(pay_res.scalar_one())

    total = fee + charges_sum
    if payments_sum >= total > 0:
        return "Paid"
    if payments_sum > 0:
        return "Partial"
    return "Due"


def to_queue_entry_response(
    q: QueueEntry,
    payment_status: str,
    vitals_rec: VitalsRecord | None = None,
) -> QueueEntryResponse:
    vitals_data = None
    if vitals_rec:
        vitals_data = VitalsSchema(
            blood_pressure=vitals_rec.blood_pressure,
            pulse=vitals_rec.pulse,
            temperature=vitals_rec.temperature,
            height=vitals_rec.height,
            weight=vitals_rec.weight,
            oxygen_saturation=vitals_rec.oxygen_saturation,
        )

    pat_display = q.patient.display_id if q.patient else str(q.patient_id)
    doc_name = q.doctor.display_name if q.doctor else "Doctor"
    vis_display = q.visit.display_id if q.visit else (str(q.visit_id) if q.visit_id else None)

    return QueueEntryResponse(
        id=q.display_id,
        token=q.token,
        patient_id=pat_display,
        visit_id=vis_display,
        department=q.department,
        doctor=doc_name,
        arrival_at=q.arrival_at.isoformat(),
        status=q.status,
        payment_status=payment_status,
        visit_type=q.visit_type,
        note=q.note,
        vitals=vitals_data,
    )


@router.get("", response_model=PaginatedQueueResponse, summary="List queue entries")
async def list_queue(
    department: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    date: str | None = Query(None),
    patient_id: str | None = Query(None, alias="patientId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedQueueResponse:
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians cannot access queue entries from other departments.")
        department = current_user.role

    stmt = select(QueueEntry)
    if department:
        stmt = stmt.where(QueueEntry.department == department.lower())

    if status_filter:
        stmt = stmt.where(QueueEntry.status == status_filter)

    if date:
        stmt = stmt.where(func.to_char(QueueEntry.arrival_at, "YYYY-MM-DD") == date)

    if patient_id:
        patient = await find_patient_by_id(db, patient_id)
        if patient:
            stmt = stmt.where(QueueEntry.patient_id == patient.id)
        else:
            stmt = stmt.where(QueueEntry.patient_id == uuid.uuid4())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    stmt = stmt.order_by(QueueEntry.arrival_at.asc()).offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    queue_entries = res.scalars().all()

    items: list[QueueEntryResponse] = []
    for q in queue_entries:
        pay_stat = await compute_payment_status(db, q.visit_id)
        # Load vitals if available
        v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == q.visit_id).order_by(VitalsRecord.entered_at.desc())
        v_res = await db.execute(v_stmt)
        vitals_rec = v_res.scalar_one_or_none()
        items.append(to_queue_entry_response(q, pay_stat, vitals_rec))

    return PaginatedQueueResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


require_reception = require_role("reception")
require_staff = require_role("reception", "skin", "orthopaedics")


@router.post("", response_model=QueueEntryResponse, status_code=status.HTTP_201_CREATED, summary="Check-in patient to queue")
async def create_queue(
    payload: CreateQueueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> QueueEntryResponse:
    dept = payload.department.lower()

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

    checkin_service = CheckInService(db)
    queue_entry = await checkin_service.execute_checkin(
        patient=patient,
        department=dept,
        doctor=doctor,
        visit_type=payload.visit_type,
        note=payload.note,
        vitals=payload.vitals.model_dump() if payload.vitals else None,
        actor_id=current_user.id,
    )
    await db.commit()
    await db.refresh(queue_entry)

    # Fetch vitals record
    v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == queue_entry.visit_id)
    v_res = await db.execute(v_stmt)
    v_rec = v_res.scalar_one_or_none()

    return to_queue_entry_response(queue_entry, "Due", v_rec)


@router.patch("/{queue_id}", response_model=QueueEntryResponse, summary="Update queue entry status")
async def update_queue(
    queue_id: str,
    payload: UpdateQueueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> QueueEntryResponse:
    queue_entry = await find_queue_entry_by_id(db, queue_id)
    if not queue_entry:
        raise NotFoundException(f"Queue entry with ID {queue_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and queue_entry.department != current_user.role:
        raise ForbiddenException("Clinicians cannot update queue entries from other departments.")

    current_status = queue_entry.status
    new_status = payload.status

    allowed = VALID_QUEUE_TRANSITIONS.get(current_status, set())
    if new_status not in allowed and new_status != current_status:
        raise ConflictException(
            f"Cannot transition queue status from '{current_status}' to '{new_status}'.",
            code="INVALID_TRANSITION",
        )

    queue_entry.status = new_status

    # Sync linked appointment status
    if queue_entry.visit and queue_entry.visit.appointment_id:
        apt_stmt = select(Appointment).where(Appointment.id == queue_entry.visit.appointment_id)
        apt_res = await db.execute(apt_stmt)
        apt = apt_res.scalar_one_or_none()
        if apt:
            if new_status == "Consulting" and apt.status != "Completed":
                apt.status = "In progress"
            elif new_status == "Completed":
                apt.status = "Completed"

    await db.commit()
    await db.refresh(queue_entry)

    pay_stat = await compute_payment_status(db, queue_entry.visit_id)
    v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == queue_entry.visit_id).order_by(VitalsRecord.entered_at.desc())
    v_res = await db.execute(v_stmt)
    vitals_rec = v_res.scalar_one_or_none()

    return to_queue_entry_response(queue_entry, pay_stat, vitals_rec)
