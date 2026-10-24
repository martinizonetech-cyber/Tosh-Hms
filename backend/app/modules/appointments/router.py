import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppException, ConflictException, ForbiddenException, NotFoundException
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.appointments.models import Appointment
from app.modules.appointments.schemas import (
    AppointmentResponse,
    CreateAppointmentRequest,
    PaginatedAppointmentsResponse,
    UpdateAppointmentRequest,
)
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.checkin.service import CheckInService
from app.modules.patients.router import find_patient_by_id
from app.modules.queue.models import QueueEntry
from app.modules.users.models import Doctor, User

router = APIRouter(prefix="/appointments", tags=["Appointments"])

VALID_TRANSITIONS: dict[str, set[str]] = {
    "Scheduled": {"Checked-in", "Cancelled", "No-show"},
    "Checked-in": {"In progress", "Cancelled"},
    "In progress": {"Completed"},
    "Completed": set(),
    "Cancelled": set(),
    "No-show": set(),
}


def to_appointment_response(apt: Appointment, patient_display_id: str, doctor_name: str) -> AppointmentResponse:
    return AppointmentResponse(
        id=apt.display_id,
        patient_id=patient_display_id,
        department=apt.department,
        doctor=doctor_name,
        starts_at=apt.starts_at.isoformat(),
        visit_type=apt.visit_type,
        note=apt.note,
        status=apt.status,
    )


async def find_appointment_by_id(db: AsyncSession, identifier: str) -> Appointment | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(Appointment).where(or_(Appointment.id == val_uuid, Appointment.display_id == identifier))
    except ValueError:
        stmt = select(Appointment).where(Appointment.display_id == identifier)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


@router.get("", response_model=PaginatedAppointmentsResponse, summary="List appointments")
async def list_appointments(
    department: str | None = Query(None),
    date: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_id: str | None = Query(None, alias="patientId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedAppointmentsResponse:
    # Department guard
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians cannot access appointments from other departments.")
        department = current_user.role

    stmt = select(Appointment)

    if department:
        stmt = stmt.where(Appointment.department == department.lower())

    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)

    if date:
        # Match date string YYYY-MM-DD
        stmt = stmt.where(func.to_char(Appointment.starts_at, "YYYY-MM-DD") == date)

    if patient_id:
        patient = await find_patient_by_id(db, patient_id)
        if patient:
            stmt = stmt.where(Appointment.patient_id == patient.id)
        else:
            stmt = stmt.where(Appointment.patient_id == uuid.uuid4())

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    # Paginate
    stmt = stmt.order_by(Appointment.starts_at.asc()).offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    appointments = res.scalars().all()

    items: list[AppointmentResponse] = []
    for apt in appointments:
        pat_display_id = apt.patient.display_id if apt.patient else str(apt.patient_id)
        doc_name = apt.doctor.display_name if apt.doctor else "Unknown Doctor"
        items.append(to_appointment_response(apt, pat_display_id, doc_name))

    return PaginatedAppointmentsResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


require_reception = require_role("reception")
require_staff = require_role("reception", "skin", "orthopaedics")


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED, summary="Create appointment")
async def create_appointment(
    payload: CreateAppointmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> AppointmentResponse:
    dept = payload.department.lower()

    # Find patient
    patient = await find_patient_by_id(db, payload.patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {payload.patient_id} not found.")

    # Find doctor and validate department
    if payload.doctor:
        doc_stmt = select(Doctor).where(Doctor.display_name == payload.doctor)
        doc_res = await db.execute(doc_stmt)
        doctor = doc_res.scalar_one_or_none()
        if not doctor:
            raise NotFoundException(f"Doctor '{payload.doctor}' not found.")
        if doctor.department != dept:
            raise AppException(
                f"Doctor '{doctor.display_name}' belongs to department '{doctor.department}', not '{dept}'.",
                code="INVALID_DOCTOR_DEPARTMENT",
                status_code=422,
            )
    else:
        fallback_stmt = select(Doctor).where(Doctor.department == dept)
        doc_res = await db.execute(fallback_stmt)
        doctor = doc_res.scalar_one_or_none()
        if not doctor:
            raise NotFoundException(f"No doctor found for department {dept}.")

    # Parse and validate starts_at
    try:
        starts_dt = datetime.fromisoformat(payload.starts_at)
    except ValueError:
        raise AppException("Invalid ISO datetime format for startsAt.", code="VALIDATION_ERROR", status_code=422)

    now_utc = datetime.now(UTC)
    check_dt = starts_dt if starts_dt.tzinfo else starts_dt.replace(tzinfo=UTC)
    if check_dt < (now_utc - timedelta(seconds=60)):
        raise AppException(
            "Appointment cannot be scheduled in the past.",
            code="PAST_APPOINTMENT_TIME",
            status_code=422,
        )

    # Reject double-booking (same doctor + startsAt)
    dup_stmt = select(Appointment).where(
        Appointment.doctor_id == doctor.id,
        Appointment.starts_at == starts_dt,
        Appointment.status.not_in(["Cancelled", "No-show"]),
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise ConflictException(
            f"Doctor {doctor.display_name} already has an appointment scheduled at {payload.starts_at}.",
            code="CONFLICT",
        )

    display_id = await next_display_id(db, Appointment, "APT")
    appointment = Appointment(
        display_id=display_id,
        patient_id=patient.id,
        department=dept,
        doctor_id=doctor.id,
        starts_at=starts_dt,
        visit_type=payload.visit_type,
        note=payload.note,
        status="Scheduled",
        created_by=current_user.id,
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    return to_appointment_response(appointment, patient.display_id, doctor.display_name)


@router.patch("/{appointment_id}", response_model=AppointmentResponse, summary="Update appointment status or details")
async def update_appointment(
    appointment_id: str,
    payload: UpdateAppointmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> AppointmentResponse:
    appointment = await find_appointment_by_id(db, appointment_id)
    if not appointment:
        raise NotFoundException(f"Appointment with ID {appointment_id} not found.")

    if current_user.role in ("skin", "orthopaedics"):
        if appointment.department != current_user.role:
            raise ForbiddenException("Clinicians cannot modify appointments from other departments.")
        if payload.status and payload.status not in ("In progress", "Completed"):
            raise ForbiddenException("Doctors may only transition appointments to 'In progress' or 'Completed'.")
        if payload.starts_at or payload.doctor:
            raise ForbiddenException("Doctors cannot reschedule appointments or change assigned doctor.")

    # State Machine Check
    if payload.status and payload.status != appointment.status:
        current_status = appointment.status
        new_status = payload.status
        allowed = VALID_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            raise ConflictException(
                f"Cannot transition appointment from '{current_status}' to '{new_status}'.",
                code="INVALID_TRANSITION",
            )

        appointment.status = new_status

        # If Checked-in, trigger CheckInService
        if new_status == "Checked-in":
            # Check if queue entry exists for this appointment
            q_stmt = select(QueueEntry).join(QueueEntry.visit).where(QueueEntry.visit.has(appointment_id=appointment.id))
            q_res = await db.execute(q_stmt)
            existing_queue = q_res.scalar_one_or_none()
            if not existing_queue:
                checkin_service = CheckInService(db)
                await checkin_service.execute_checkin(
                    patient=appointment.patient,
                    department=appointment.department,
                    doctor=appointment.doctor,
                    visit_type=appointment.visit_type,
                    note=appointment.note,
                    appointment_id=appointment.id,
                    actor_id=current_user.id,
                )

        # Sync QueueEntry if status transitions to In progress or Completed
        elif new_status == "In progress":
            q_stmt = select(QueueEntry).join(QueueEntry.visit).where(QueueEntry.visit.has(appointment_id=appointment.id))
            q_res = await db.execute(q_stmt)
            q_entry = q_res.scalar_one_or_none()
            if q_entry and q_entry.status != "Consulting":
                q_entry.status = "Consulting"

        elif new_status == "Completed":
            q_stmt = select(QueueEntry).join(QueueEntry.visit).where(QueueEntry.visit.has(appointment_id=appointment.id))
            q_res = await db.execute(q_stmt)
            q_entry = q_res.scalar_one_or_none()
            if q_entry and q_entry.status != "Completed":
                q_entry.status = "Completed"

    # Details updates
    if payload.starts_at:
        try:
            appointment.starts_at = datetime.fromisoformat(payload.starts_at)
        except ValueError:
            raise ValueError("Invalid ISO datetime format for startsAt.")

    if payload.doctor:
        doc_stmt = select(Doctor).where(Doctor.department == appointment.department, Doctor.display_name == payload.doctor)
        doc_res = await db.execute(doc_stmt)
        doc = doc_res.scalar_one_or_none()
        if doc:
            appointment.doctor_id = doc.id

    if payload.note is not None:
        appointment.note = payload.note

    await db.commit()
    await db.refresh(appointment)

    pat_display_id = appointment.patient.display_id if appointment.patient else str(appointment.patient_id)
    doc_name = appointment.doctor.display_name if appointment.doctor else "Unknown Doctor"
    return to_appointment_response(appointment, pat_display_id, doc_name)
