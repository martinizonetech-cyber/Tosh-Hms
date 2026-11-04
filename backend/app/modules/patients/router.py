import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictException, ForbiddenException, NotFoundException
from app.core.websocket import broadcast_event
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.patients.models import Patient
from app.modules.patients.schemas import (
    CreatePatientRequest,
    PaginatedPatientsResponse,
    PatientResponse,
    UpdatePatientRequest,
)
from app.modules.users.models import User
from app.modules.visits.models import Visit

router = APIRouter(prefix="/patients", tags=["Patients"])


def to_patient_response(patient: Patient, departments: list[str]) -> PatientResponse:
    return PatientResponse(
        id=patient.display_id,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        phone=patient.phone,
        email=patient.email,
        address=patient.address,
        emergency_contact=patient.emergency_contact,
        departments=departments,
        registered_at=patient.registered_at.isoformat(),
        latest_visit_at=patient.latest_visit_at.isoformat() if patient.latest_visit_at else None,
    )


async def find_patient_by_id(db: AsyncSession, identifier: str) -> Patient | None:
    """Find patient by display_id (e.g. PT-1001) or UUID."""
    if not identifier:
        return None
    ident = identifier.strip()
    try:
        val_uuid = uuid.UUID(ident)
        stmt = select(Patient).where(or_(Patient.id == val_uuid, func.lower(Patient.display_id) == ident.lower()))
    except ValueError:
        stmt = select(Patient).where(func.lower(Patient.display_id) == ident.lower())
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


@router.get("", response_model=PaginatedPatientsResponse, summary="List or search patients")
async def list_patients(
    query: str | None = Query(None),
    department: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedPatientsResponse:
    # Role & Department guards
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians cannot access patient data from other departments.")
        department = current_user.role

    stmt = select(Patient)

    if query:
        q_str = query.strip()
        q_clean = f"%{q_str.lower()}%"
        q_digits = "".join(c for c in q_str if c.isdigit())
        conditions = [
            func.lower(Patient.full_name).like(q_clean),
            func.lower(Patient.display_id).like(q_clean),
            Patient.phone.like(f"%{q_str}%"),
        ]
        if len(q_digits) >= 3:
            cleaned_phone = func.replace(func.replace(func.replace(Patient.phone, " ", ""), "-", ""), "+", "")
            conditions.append(cleaned_phone.like(f"%{q_digits}%"))

        stmt = stmt.where(or_(*conditions))

    if department:
        # Filter patients who have visited this department
        dept_clean = department.lower()
        subquery = select(Visit.patient_id).where(Visit.department == dept_clean)
        stmt = stmt.where(Patient.id.in_(subquery))

    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    # Paginate
    stmt = stmt.order_by(Patient.registered_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    patients = result.scalars().all()

    # Load departments for each patient
    items: list[PatientResponse] = []
    for pat in patients:
        vis_stmt = select(Visit.department).where(Visit.patient_id == pat.id).distinct()
        vis_res = await db.execute(vis_stmt)
        depts = list(vis_res.scalars().all())
        items.append(to_patient_response(pat, depts))

    return PaginatedPatientsResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


require_reception = require_role("reception")
require_staff = require_role("reception", "skin", "orthopaedics")


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED, summary="Register patient")
async def create_patient(
    payload: CreatePatientRequest,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> PatientResponse:

    # Duplicate check (same phone + full_name)
    if not force:
        clean_phone = payload.phone.strip()
        clean_name = payload.full_name.strip().lower()
        dup_stmt = select(Patient).where(
            Patient.phone == clean_phone,
            func.lower(Patient.full_name) == clean_name,
        )
        dup_res = await db.execute(dup_stmt)
        existing_pat = dup_res.scalar_one_or_none()
        if existing_pat:
            raise ConflictException(
                f"Possible duplicate: A patient with name '{existing_pat.full_name}' and phone '{existing_pat.phone}' already exists ({existing_pat.display_id}).",
                code="POSSIBLE_DUPLICATE",
                details={
                    "existingPatientId": existing_pat.display_id,
                    "fullName": existing_pat.full_name,
                    "phone": existing_pat.phone,
                },
            )

    display_id = await next_display_id(db, Patient, "PT")
    patient = Patient(
        display_id=display_id,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
        emergency_contact=payload.emergency_contact,
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)

    await broadcast_event("PATIENT_UPDATE", {
        "action": "create",
        "id": patient.display_id,
        "name": patient.full_name,
    })

    return to_patient_response(patient, [payload.department.lower()])


@router.get("/{patient_id}", response_model=PatientResponse, summary="Get patient by ID")
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PatientResponse:
    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    # Load patient departments
    vis_stmt = select(Visit.department).where(Visit.patient_id == patient.id).distinct()
    vis_res = await db.execute(vis_stmt)
    depts = list(vis_res.scalars().all())

    # Department guard: clinician can only access if patient has visited their department
    if current_user.role in ("skin", "orthopaedics") and depts and current_user.role not in depts:
        raise ForbiddenException("Clinicians cannot access patient records from other departments.")

    return to_patient_response(patient, depts)


@router.patch("/{patient_id}", response_model=PatientResponse, summary="Update patient details")
async def update_patient(
    patient_id: str,
    payload: UpdatePatientRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> PatientResponse:
    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    # Check for duplicate phone if phone is being changed
    if payload.phone and payload.phone != patient.phone:
        existing = await db.execute(
            select(Patient).where(Patient.phone == payload.phone, Patient.id != patient.id)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"A patient with phone number {payload.phone} already exists.")

    if payload.full_name is not None:
        patient.full_name = payload.full_name
    if payload.date_of_birth is not None:
        patient.date_of_birth = payload.date_of_birth
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.phone is not None:
        patient.phone = payload.phone
    if payload.email is not None:
        patient.email = payload.email
    if payload.address is not None:
        patient.address = payload.address
    if payload.emergency_contact is not None:
        patient.emergency_contact = payload.emergency_contact

    # Load patient departments from visits
    vis_stmt = select(Visit.department).where(Visit.patient_id == patient.id).distinct()
    vis_res = await db.execute(vis_stmt)
    depts = set(vis_res.scalars().all())
    if payload.departments:
        for d in payload.departments:
            depts.add(d.lower())

    await log_audit_event(
        db=db,
        action="PATIENT_UPDATE",
        entity_type="Patient",
        entity_id=patient.display_id,
        actor_user_id=current_user.id,
        patient_id=patient.id,
        after_state={
            "fullName": patient.full_name,
            "phone": patient.phone,
            "gender": patient.gender,
            "address": patient.address,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(patient)

    await broadcast_event("PATIENT_UPDATE", {
        "action": "update",
        "id": patient.display_id,
        "name": patient.full_name,
        "phone": patient.phone,
    })

    return to_patient_response(patient, list(depts))


@router.get("/{patient_id}/visits", summary="Get patient visits")
async def get_patient_visits(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    stmt = select(Visit).where(Visit.patient_id == patient.id)
    if current_user.role in ("skin", "orthopaedics"):
        stmt = stmt.where(Visit.department == current_user.role)

    stmt = stmt.order_by(Visit.started_at.desc())
    res = await db.execute(stmt)
    visits = res.scalars().all()

    return [
        {
            "id": v.display_id,
            "patientId": patient.display_id,
            "department": v.department,
            "visitType": v.visit_type,
            "startedAt": v.started_at.isoformat(),
        }
        for v in visits
    ]


@router.get("/{patient_id}/appointments", summary="Get patient appointments")
async def get_patient_appointments(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.modules.appointments.models import Appointment
    from app.modules.appointments.router import to_appointment_response
    from app.modules.appointments.schemas import PaginatedAppointmentsResponse

    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    stmt = select(Appointment).where(Appointment.patient_id == patient.id)
    if current_user.role in ("skin", "orthopaedics"):
        stmt = stmt.where(Appointment.department == current_user.role)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    stmt = stmt.order_by(Appointment.starts_at.desc()).offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    appointments = res.scalars().all()

    items = []
    for apt in appointments:
        doc_name = apt.doctor.display_name if apt.doctor else "Unknown Doctor"
        items.append(to_appointment_response(apt, patient.display_id, doc_name))

    return PaginatedAppointmentsResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{patient_id}/invoices", summary="Get patient invoices")
async def get_patient_invoices(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.modules.billing.models import Invoice
    from app.modules.billing.router import to_invoice_response
    from app.modules.billing.schemas import PaginatedInvoicesResponse

    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    stmt = select(Invoice).where(Invoice.patient_id == patient.id)
    if current_user.role in ("skin", "orthopaedics"):
        stmt = stmt.where(Invoice.department == current_user.role)

    stmt = stmt.order_by(Invoice.created_at.desc())
    res = await db.execute(stmt)
    invoices = res.scalars().all()

    items = [to_invoice_response(inv) for inv in invoices]
    total = len(items)
    start_idx = (page - 1) * page_size
    paged_items = items[start_idx : start_idx + page_size]

    return PaginatedInvoicesResponse(
        items=paged_items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{patient_id}/follow-ups", summary="Get patient follow-ups")
async def get_patient_follow_ups(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.modules.followups.models import FollowUp
    from app.modules.followups.router import to_followup_response
    from app.modules.followups.schemas import PaginatedFollowUpsResponse

    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    stmt = select(FollowUp).where(FollowUp.patient_id == patient.id)
    if current_user.role in ("skin", "orthopaedics"):
        stmt = stmt.where(FollowUp.department == current_user.role)

    stmt = stmt.order_by(FollowUp.date.asc())
    res = await db.execute(stmt)
    follow_ups = res.scalars().all()

    items = [to_followup_response(fu) for fu in follow_ups]
    total = len(items)
    start_idx = (page - 1) * page_size
    paged_items = items[start_idx : start_idx + page_size]

    return PaginatedFollowUpsResponse(
        items=paged_items,
        page=page,
        page_size=page_size,
        total=total,
    )



