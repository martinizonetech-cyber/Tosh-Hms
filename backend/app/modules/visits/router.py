import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    VisitLockedException,
)
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.appointments.models import Appointment
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.billing.models import Invoice, InvoiceCharge
from app.modules.consultations.models import Consultation, PrescriptionItem
from app.modules.consultations.schemas import (
    ChargeItemSchema,
    ConsultationResponse,
    PaginatedConsultationsResponse,
    PrescriptionImageSchema,
    PrescriptionItemSchema,
    SaveConsultationRequest,
    UpdateVitalsRequest,
)
from app.modules.documents.models import Document
from app.modules.documents.schemas import PatientDocumentResponse
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry
from app.modules.queue.schemas import VitalsSchema
from app.modules.users.models import Doctor, User
from app.modules.visits.models import Visit, VitalsRecord
from app.services.storage import get_storage_service

router = APIRouter(prefix="/visits", tags=["Visits"])


async def find_visit_by_id(db: AsyncSession, identifier: str) -> Visit | None:
    if not identifier:
        return None
    ident = identifier.strip()
    try:
        val_uuid = uuid.UUID(ident)
        stmt = select(Visit).where(or_(Visit.id == val_uuid, func.lower(Visit.display_id) == ident.lower()))
    except ValueError:
        stmt = select(Visit).where(func.lower(Visit.display_id) == ident.lower())
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def get_or_create_consultation(db: AsyncSession, visit: Visit) -> Consultation:
    c_stmt = select(Consultation).where(Consultation.visit_id == visit.id)
    c_res = await db.execute(c_stmt)
    consultation = c_res.scalar_one_or_none()
    if not consultation:
        consultation = Consultation(
            id=visit.id,
            visit_id=visit.id,
            patient_id=visit.patient_id,
            department=visit.department,
            status="Draft",
            version=1,
        )
        db.add(consultation)
        await db.flush()
    return consultation


async def build_consultation_response(
    db: AsyncSession,
    visit: Visit,
    consultation: Consultation,
) -> ConsultationResponse:
    # 0. Safely resolve patient display ID without triggering async lazy loading
    pat_stmt = select(Patient.display_id).where(Patient.id == visit.patient_id)
    pat_res = await db.execute(pat_stmt)
    patient_display_id = pat_res.scalar_one_or_none() or str(visit.patient_id)

    # 1. Vitals
    v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == visit.id).order_by(VitalsRecord.entered_at.desc())
    v_res = await db.execute(v_stmt)
    v_rec = v_res.scalar_one_or_none()
    vitals_data = VitalsSchema(
        blood_pressure=v_rec.blood_pressure if v_rec else "",
        pulse=v_rec.pulse if v_rec else "",
        temperature=v_rec.temperature if v_rec else "",
        height=v_rec.height if v_rec else "",
        weight=v_rec.weight if v_rec else "",
        oxygen_saturation=v_rec.oxygen_saturation if v_rec else "",
    )

    # 2. Prescriptions
    rx_stmt = select(PrescriptionItem).where(PrescriptionItem.consultation_id == consultation.id).order_by(PrescriptionItem.sort_order)
    rx_res = await db.execute(rx_stmt)
    rx_items = rx_res.scalars().all()
    prescription_list = [
        PrescriptionItemSchema(
            id=rx.display_id,
            medicine_name=rx.medicine_name,
            strength=rx.strength,
            dosage=rx.dosage,
            route=rx.route,
            frequency=rx.frequency,
            duration=rx.duration,
            instructions=rx.instructions,
        )
        for rx in rx_items
    ]

    # 3. Documents & Prescription Images
    storage_service = get_storage_service()
    doc_stmt = select(Document).where(Document.patient_id == visit.patient_id, Document.deleted_at.is_(None)).order_by(Document.uploaded_at.desc())
    doc_res = await db.execute(doc_stmt)
    docs = doc_res.scalars().all()

    documents_list: list[PatientDocumentResponse] = []
    prescription_images: list[PrescriptionImageSchema] = []

    for d in docs:
        signed_url = storage_service.get_signed_url(d.storage_key)
        cat_clean = (d.category or "").strip().lower()
        if cat_clean in ("prescription", "prescription image", "rx"):
            prescription_images.append(
                PrescriptionImageSchema(
                    id=d.display_id,
                    name=d.name,
                    mime_type=d.mime_type,
                    size=d.size,
                    uploaded_at=d.uploaded_at.isoformat(),
                    url=signed_url,
                )
            )
        documents_list.append(
            PatientDocumentResponse(
                id=d.display_id,
                patient_id=patient_display_id,
                name=d.name,
                mime_type=d.mime_type,
                size=d.size,
                category=d.category,
                uploaded_at=d.uploaded_at.isoformat(),
                url=signed_url,
            )
        )

    # 4. Procedures / Charges from invoice
    inv_stmt = select(Invoice).where(Invoice.visit_id == visit.id)
    inv_res = await db.execute(inv_stmt)
    invoice = inv_res.scalar_one_or_none()
    procedures_list: list[ChargeItemSchema] = []
    if invoice:
        chg_stmt = select(InvoiceCharge).where(InvoiceCharge.invoice_id == invoice.id).order_by(InvoiceCharge.created_at)
        chg_res = await db.execute(chg_stmt)
        charges = chg_res.scalars().all()
        for chg in charges:
            procedures_list.append(
                ChargeItemSchema(
                    id=chg.display_id,
                    description=chg.description,
                    amount=round(chg.amount / 100.0, 2),
                    department=visit.department,
                    added_by=chg.added_by,
                    date=chg.created_at.strftime("%Y-%m-%d"),
                )
            )

    return ConsultationResponse(
        id=visit.display_id,
        patient_id=patient_display_id,
        department=consultation.department,
        visited_at=visit.started_at.isoformat(),
        vitals=vitals_data,
        symptoms=consultation.symptoms or "",
        medical_history=consultation.medical_history or "",
        allergies=consultation.allergies or "",
        examination=consultation.examination or "",
        assessment=consultation.assessment or "",
        diagnosis=consultation.diagnosis or "",
        treatment_plan=consultation.treatment_plan or "",
        prescription=prescription_list,
        prescription_images=prescription_images,
        documents=documents_list,
        procedures=procedures_list,
        follow_up_date=consultation.follow_up_date,
        pain_location=consultation.pain_location,
        side=consultation.side if consultation.side in ("Left", "Right", "Bilateral", "Not applicable") else None,
        body_region_template=consultation.body_region_template,
        status="Finalized" if (consultation.status or "").lower() == "finalized" else "Draft",
        version=consultation.version or 1,
    )


@router.get("", response_model=PaginatedConsultationsResponse, summary="List visits and consultations")
async def list_visits(
    patient_id: str | None = Query(None, alias="patientId"),
    department: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedConsultationsResponse:
    dept = None
    if current_user.role in ("skin", "orthopaedics"):
        dept = current_user.role
    elif department and department.lower() in ("skin", "orthopaedics"):
        dept = department.lower()

    stmt = select(Visit)
    if dept:
        stmt = stmt.where(Visit.department == dept)

    if patient_id:
        from app.modules.patients.router import find_patient_by_id
        pat = await find_patient_by_id(db, patient_id)
        if pat:
            stmt = stmt.where(Visit.patient_id == pat.id)
        else:
            return PaginatedConsultationsResponse(items=[], page=page, page_size=page_size, total=0)

    if status and status.lower() != "all":
        stmt = stmt.join(Consultation, Consultation.visit_id == Visit.id).where(func.lower(Consultation.status) == status.lower())

    stmt = stmt.order_by(Visit.started_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)
    res = await db.execute(stmt)
    visits = res.scalars().all()

    items: list[ConsultationResponse] = []
    for v in visits:
        c = await get_or_create_consultation(db, v)
        c_resp = await build_consultation_response(db, v, c)
        items.append(c_resp)

    return PaginatedConsultationsResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{visit_id}", summary="Get visit details by ID")
async def get_visit(
    visit_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    visit = await find_visit_by_id(db, visit_id)
    if not visit:
        raise NotFoundException(f"Visit with ID {visit_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and visit.department != current_user.role:
        raise ForbiddenException("Clinicians cannot access visits from other departments.")

    pat_stmt = select(Patient.display_id).where(Patient.id == visit.patient_id)
    pat_res = await db.execute(pat_stmt)
    patient_display_id = pat_res.scalar_one_or_none() or str(visit.patient_id)

    doc_stmt = select(Doctor.display_name).where(Doctor.id == visit.doctor_id)
    doc_res = await db.execute(doc_stmt)
    doctor_display_name = doc_res.scalar_one_or_none() or "Doctor"

    v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == visit.id).order_by(VitalsRecord.entered_at.desc())
    v_res = await db.execute(v_stmt)
    vitals_rec = v_res.scalar_one_or_none()
    vitals_data = {}
    if vitals_rec:
        vitals_data = {
            "bloodPressure": vitals_rec.blood_pressure,
            "pulse": vitals_rec.pulse,
            "temperature": vitals_rec.temperature,
            "height": vitals_rec.height,
            "weight": vitals_rec.weight,
            "oxygenSaturation": vitals_rec.oxygen_saturation,
        }

    c_stmt = select(Consultation).where(Consultation.visit_id == visit.id)
    c_res = await db.execute(c_stmt)
    consultation = c_res.scalar_one_or_none()
    consultation_data = None
    if consultation:
        consultation_data = {
            "id": visit.display_id,
            "patientId": patient_display_id,
            "department": consultation.department,
            "status": consultation.status,
            "symptoms": consultation.symptoms,
            "diagnosis": consultation.diagnosis,
        }

    return {
        "id": visit.display_id,
        "patientId": patient_display_id,
        "department": visit.department,
        "doctor": doctor_display_name,
        "visitType": visit.visit_type,
        "startedAt": visit.started_at.isoformat(),
        "vitals": vitals_data,
        "consultation": consultation_data,
    }


@router.get("/{visit_id}/consultation", response_model=ConsultationResponse, summary="Get full consultation for visit")
async def get_consultation(
    visit_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConsultationResponse:
    visit = await find_visit_by_id(db, visit_id)
    if not visit:
        raise NotFoundException(f"Visit with ID {visit_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and visit.department != current_user.role:
        raise ForbiddenException("Clinicians cannot access consultations from other departments.")

    consultation = await get_or_create_consultation(db, visit)

    await log_audit_event(
        db=db,
        action="CONSULTATION_READ",
        entity_type="Consultation",
        entity_id=visit.display_id,
        actor_user_id=current_user.id,
        patient_id=visit.patient_id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return await build_consultation_response(db, visit, consultation)


require_staff = require_role("reception", "skin", "orthopaedics")


@router.put("/{visit_id}/consultation", response_model=ConsultationResponse, summary="Save or finalize consultation")
async def save_consultation(
    visit_id: str,
    payload: SaveConsultationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> ConsultationResponse:
    visit = await find_visit_by_id(db, visit_id)
    if not visit:
        raise NotFoundException(f"Visit with ID {visit_id} not found.")

    # Only doctor of that department may write
    if current_user.role != visit.department:
        raise ForbiddenException(f"Only the doctor of the '{visit.department}' department can write to this consultation.")

    consultation = await get_or_create_consultation(db, visit)

    # Optimistic concurrency check
    if payload.version is not None and payload.version != consultation.version:
        raise ConflictException(
            f"Consultation was modified by another session (expected version {consultation.version}, received {payload.version}). Please refresh.",
            code="CONFLICT",
        )

    # Finalized locking & reopening
    action = "CONSULTATION_SAVE"
    if consultation.status == "Finalized":
        if payload.status == "Draft":
            # Reopening consultation
            consultation.status = "Draft"
            action = "CONSULTATION_REOPEN"
        else:
            raise VisitLockedException(
                "Consultation is finalized and cannot be modified without reopening.",
                details={"visitId": visit.display_id, "status": consultation.status},
            )
    elif payload.status == "Finalized":
        consultation.status = "Finalized"
        consultation.finalized_at = datetime.now(UTC)
        consultation.finalized_by = current_user.id
        action = "CONSULTATION_FINALIZE"

        # Complete linked queue entry
        q_stmt = select(QueueEntry).where(QueueEntry.visit_id == visit.id)
        q_res = await db.execute(q_stmt)
        q_entry = q_res.scalar_one_or_none()
        if q_entry and q_entry.status != "Completed":
            q_entry.status = "Completed"

        # Complete linked appointment
        if visit.appointment_id:
            apt_stmt = select(Appointment).where(Appointment.id == visit.appointment_id)
            apt_res = await db.execute(apt_stmt)
            apt = apt_res.scalar_one_or_none()
            if apt and apt.status != "Completed":
                apt.status = "Completed"

    # Persist clinical text fields
    if payload.symptoms is not None:
        consultation.symptoms = payload.symptoms
    if payload.medical_history is not None:
        consultation.medical_history = payload.medical_history
    if payload.allergies is not None:
        consultation.allergies = payload.allergies
    if payload.examination is not None:
        consultation.examination = payload.examination
    if payload.assessment is not None:
        consultation.assessment = payload.assessment
    if payload.diagnosis is not None:
        consultation.diagnosis = payload.diagnosis
    if payload.treatment_plan is not None:
        consultation.treatment_plan = payload.treatment_plan
    if payload.follow_up_date is not None:
        consultation.follow_up_date = payload.follow_up_date
    if payload.pain_location is not None:
        consultation.pain_location = payload.pain_location
    if payload.side is not None:
        consultation.side = payload.side
    if payload.body_region_template is not None:
        consultation.body_region_template = payload.body_region_template

    # Replace prescriptions atomically
    if payload.prescription is not None:
        del_stmt = delete(PrescriptionItem).where(PrescriptionItem.consultation_id == consultation.id)
        await db.execute(del_stmt)

        for idx, item in enumerate(payload.prescription):
            if not item.medicine_name or not item.medicine_name.strip():
                continue
            disp_id = item.id if item.id and item.id.startswith("RX-") else f"RX-{idx + 1}"
            rx_obj = PrescriptionItem(
                consultation_id=consultation.id,
                display_id=disp_id,
                medicine_name=item.medicine_name,
                strength=item.strength,
                dosage=item.dosage,
                route=item.route,
                frequency=item.frequency,
                duration=item.duration,
                instructions=item.instructions,
                sort_order=idx,
            )
            db.add(rx_obj)

    # Increment version
    consultation.version += 1

    # Update patient latest_visit_at
    try:
        if visit.patient:
            visit.patient.latest_visit_at = visit.started_at
    except Exception:
        pass

    # Link any unlinked documents for this patient to this visit
    from app.modules.documents.models import Document
    from sqlalchemy import update
    await db.execute(
        update(Document)
        .where(
            Document.patient_id == visit.patient_id,
            Document.visit_id.is_(None),
            Document.deleted_at.is_(None),
        )
        .values(visit_id=visit.id)
    )

    await log_audit_event(
        db=db,
        action=action,
        entity_type="Consultation",
        entity_id=visit.display_id,
        actor_user_id=current_user.id,
        patient_id=visit.patient_id,
        after_state={"status": consultation.status, "version": consultation.version},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(consultation)

    return await build_consultation_response(db, visit, consultation)


@router.patch("/{visit_id}/vitals", response_model=VitalsSchema, summary="Update visit vitals")
async def update_vitals(
    visit_id: str,
    payload: UpdateVitalsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> VitalsSchema:
    visit = await find_visit_by_id(db, visit_id)
    if not visit:
        raise NotFoundException(f"Visit with ID {visit_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and visit.department != current_user.role:
        raise ForbiddenException("Clinicians cannot update vitals for other departments.")

    v_stmt = select(VitalsRecord).where(VitalsRecord.visit_id == visit.id).order_by(VitalsRecord.entered_at.desc())
    v_res = await db.execute(v_stmt)
    v_rec = v_res.scalar_one_or_none()

    if not v_rec:
        v_rec = VitalsRecord(
            visit_id=visit.id,
            entered_by=current_user.id,
            entered_at=datetime.now(UTC),
        )
        db.add(v_rec)

    if payload.blood_pressure is not None:
        v_rec.blood_pressure = payload.blood_pressure
    if payload.pulse is not None:
        v_rec.pulse = payload.pulse
    if payload.temperature is not None:
        v_rec.temperature = payload.temperature
    if payload.height is not None:
        v_rec.height = payload.height
    if payload.weight is not None:
        v_rec.weight = payload.weight
    if payload.oxygen_saturation is not None:
        v_rec.oxygen_saturation = payload.oxygen_saturation

    v_rec.entered_by = current_user.id
    v_rec.entered_at = datetime.now(UTC)

    await log_audit_event(
        db=db,
        action="VITALS_UPDATE",
        entity_type="Visit",
        entity_id=visit.display_id,
        actor_user_id=current_user.id,
        patient_id=visit.patient_id,
        after_state={
            "bloodPressure": v_rec.blood_pressure,
            "pulse": v_rec.pulse,
            "temperature": v_rec.temperature,
            "height": v_rec.height,
            "weight": v_rec.weight,
            "oxygenSaturation": v_rec.oxygen_saturation,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(v_rec)

    return VitalsSchema(
        blood_pressure=v_rec.blood_pressure,
        pulse=v_rec.pulse,
        temperature=v_rec.temperature,
        height=v_rec.height,
        weight=v_rec.weight,
        oxygen_saturation=v_rec.oxygen_saturation,
    )
