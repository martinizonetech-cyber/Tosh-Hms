import hashlib
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppException, ForbiddenException, NotFoundException, UnauthenticatedException
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.documents.models import Document
from app.modules.documents.schemas import PaginatedDocumentsResponse, PatientDocumentResponse
from app.modules.patients.router import find_patient_by_id
from app.modules.users.models import User
from app.modules.visits.models import Visit
from app.modules.visits.router import find_visit_by_id
from app.services.storage import LocalStorageService, get_storage_service, validate_file_magic_bytes

router = APIRouter(prefix="", tags=["Documents"])

require_staff = require_role("reception", "skin", "orthopaedics")


class RenameDocumentRequest(BaseModel):
    name: str | None = None
    doc_name: str | None = Field(None, alias="docName")
    new_name: str | None = Field(None, alias="newName")


async def find_document_by_id(db: AsyncSession, identifier: str) -> Document | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(Document).where(
            or_(Document.id == val_uuid, Document.display_id == identifier),
            Document.deleted_at.is_(None),
        )
    except ValueError:
        stmt = select(Document).where(Document.display_id == identifier, Document.deleted_at.is_(None))
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


def to_document_response(
    doc: Document,
    signed_url: str | None = None,
    patient_display_id: str | None = None,
) -> PatientDocumentResponse:
    pat_id = patient_display_id
    if not pat_id:
        try:
            from sqlalchemy.orm import inspect
            ins = inspect(doc)
            if ins and not ins.unloaded and "patient" in ins.dict and doc.patient:
                pat_id = doc.patient.display_id
            else:
                pat_id = str(doc.patient_id)
        except Exception:
            pat_id = str(doc.patient_id)

    return PatientDocumentResponse(
        id=doc.display_id,
        patient_id=pat_id,
        name=doc.name,
        mime_type=doc.mime_type,
        size=doc.size,
        category=doc.category,
        uploaded_at=doc.uploaded_at.isoformat(),
        url=signed_url,
    )


@router.post("/documents", response_model=PatientDocumentResponse, status_code=status.HTTP_201_CREATED, summary="Upload patient document")
async def upload_document(
    request: Request,
    patient_id: str | None = Form(None, alias="patientId"),
    patient_id_alt: str | None = Form(None, alias="patient_id"),
    category: str = Form("General"),
    visit_id: str | None = Form(None, alias="visitId"),
    visit_id_alt: str | None = Form(None, alias="visit_id"),
    name: str | None = Form(None),
    doc_name_alt: str | None = Form(None, alias="docName"),
    file: UploadFile = File(...),  # noqa: B008
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> PatientDocumentResponse:
    effective_patient_id = (patient_id or patient_id_alt or "").strip()
    if not effective_patient_id:
        raise AppException("patientId is required.", code="VALIDATION_ERROR", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    patient = await find_patient_by_id(db, effective_patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {effective_patient_id} not found.")

    v_raw = visit_id or visit_id_alt
    v_clean = v_raw.strip() if v_raw and v_raw.strip() not in ("", "undefined", "null") else None

    # Department guard: If clinician, check patient access
    if current_user.role in ("skin", "orthopaedics"):
        allowed = False
        if v_clean:
            v_check = await find_visit_by_id(db, v_clean)
            if v_check and v_check.department == current_user.role:
                allowed = True

        if not allowed:
            vis_stmt = select(Visit.department).where(Visit.patient_id == patient.id).distinct()
            vis_res = await db.execute(vis_stmt)
            depts = list(vis_res.scalars().all())
            if not depts or current_user.role in depts:
                allowed = True

        if not allowed:
            from app.modules.queue.models import QueueEntry
            q_stmt = select(QueueEntry).where(QueueEntry.patient_id == patient.id, QueueEntry.department == current_user.role)
            q_res = await db.execute(q_stmt)
            if q_res.first():
                allowed = True

        if not allowed:
            from app.modules.appointments.models import Appointment
            apt_stmt = select(Appointment).where(Appointment.patient_id == patient.id, Appointment.department == current_user.role)
            apt_res = await db.execute(apt_stmt)
            if apt_res.first():
                allowed = True

        if not allowed:
            raise ForbiddenException("Clinicians cannot upload documents for patients of other departments.")

    content = await file.read()
    mime_type, ext = validate_file_magic_bytes(content, file.filename or "upload")

    # Generate random storage key and checksum
    storage_key = f"{uuid.uuid4().hex}{ext}"
    checksum = hashlib.sha256(content).hexdigest()

    storage_service = get_storage_service()
    await storage_service.put_object(storage_key, content, mime_type)

    resolved_visit_id = None
    if v_clean:
        v = await find_visit_by_id(db, v_clean)
        if v:
            resolved_visit_id = v.id

    display_id = await next_display_id(db, Document, "DOC")

    raw_name = name or doc_name_alt
    clean_name = raw_name.strip() if raw_name and raw_name.strip() else None
    if clean_name:
        if ext and not clean_name.lower().endswith(ext.lower()):
            doc_name = f"{clean_name}{ext}"
        else:
            doc_name = clean_name
    else:
        doc_name = file.filename or f"Document{ext}"

    doc = Document(
        display_id=display_id,
        patient_id=patient.id,
        visit_id=resolved_visit_id,
        name=doc_name,
        mime_type=mime_type,
        size=len(content),
        category=category,
        storage_key=storage_key,
        checksum=checksum,
        uploaded_by=current_user.id,
    )
    db.add(doc)

    await log_audit_event(
        db=db,
        action="DOCUMENT_UPLOAD",
        entity_type="Document",
        entity_id=display_id,
        actor_user_id=current_user.id,
        patient_id=patient.id,
        after_state={"name": doc.name, "category": doc.category, "size": doc.size},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(doc)

    signed_url = storage_service.get_signed_url(doc.storage_key)
    return to_document_response(doc, signed_url, patient_display_id=patient.display_id)


@router.get("/patients/{patient_id}/documents", response_model=PaginatedDocumentsResponse, summary="List patient documents")
async def list_patient_documents(
    patient_id: str,
    request: Request,
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedDocumentsResponse:
    patient = await find_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundException(f"Patient with ID {patient_id} not found.")

    # Department guard
    if current_user.role in ("skin", "orthopaedics"):
        vis_stmt = select(Visit.department).where(Visit.patient_id == patient.id).distinct()
        vis_res = await db.execute(vis_stmt)
        depts = list(vis_res.scalars().all())
        if depts and current_user.role not in depts:
            raise ForbiddenException("Clinicians cannot view documents for patients of other departments.")

    stmt = select(Document).where(Document.patient_id == patient.id, Document.deleted_at.is_(None))
    if category:
        stmt = stmt.where(Document.category == category)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    stmt = stmt.order_by(Document.uploaded_at.desc()).offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    docs = res.scalars().all()

    storage_service = get_storage_service()
    items = []
    for d in docs:
        s_url = storage_service.get_signed_url(d.storage_key)
        items.append(to_document_response(d, s_url, patient_display_id=patient.display_id))

    await log_audit_event(
        db=db,
        action="DOCUMENT_LIST_READ",
        entity_type="Patient",
        entity_id=patient.display_id,
        actor_user_id=current_user.id,
        patient_id=patient.id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return PaginatedDocumentsResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_200_OK, summary="Delete patient document (soft delete)")
async def delete_document(
    document_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> dict:
    doc = await find_document_by_id(db, document_id)
    if not doc:
        return {"message": "Document deleted successfully."}

    # Department guard (uploader can always delete their own document)
    if current_user.role in ("skin", "orthopaedics") and doc.uploaded_by != current_user.id:
        vis_stmt = select(Visit.department).where(Visit.patient_id == doc.patient_id).distinct()
        vis_res = await db.execute(vis_stmt)
        depts = list(vis_res.scalars().all())
        if depts and current_user.role not in depts:
            raise ForbiddenException("Clinicians cannot delete documents for other departments.")

    doc.deleted_at = datetime.now(UTC)

    await log_audit_event(
        db=db,
        action="DOCUMENT_DELETE",
        entity_type="Document",
        entity_id=doc.display_id,
        actor_user_id=current_user.id,
        patient_id=doc.patient_id,
        before_state={"name": doc.name, "category": doc.category},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"message": "Document deleted successfully."}


@router.patch("/documents/{document_id}", response_model=PatientDocumentResponse, summary="Rename patient document")
async def rename_document(
    document_id: str,
    payload: RenameDocumentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> PatientDocumentResponse:
    doc = await find_document_by_id(db, document_id)
    if not doc:
        raise NotFoundException(f"Document with ID {document_id} not found.")

    # Department guard
    if current_user.role in ("skin", "orthopaedics"):
        vis_stmt = select(Visit.department).where(Visit.patient_id == doc.patient_id).distinct()
        vis_res = await db.execute(vis_stmt)
        depts = list(vis_res.scalars().all())
        if depts and current_user.role not in depts:
            raise ForbiddenException("Clinicians cannot rename documents for other departments.")

    target_name = (payload.name or payload.doc_name or payload.new_name or "").strip()
    if not target_name:
        raise AppException("Document name cannot be empty.", code="VALIDATION_ERROR", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    orig_ext = Path(doc.name).suffix
    if orig_ext and not target_name.lower().endswith(orig_ext.lower()):
        new_name = f"{target_name}{orig_ext}"
    else:
        new_name = target_name

    before_name = doc.name
    doc.name = new_name

    await log_audit_event(
        db=db,
        action="DOCUMENT_RENAME",
        entity_type="Document",
        entity_id=doc.display_id,
        actor_user_id=current_user.id,
        patient_id=doc.patient_id,
        before_state={"name": before_name},
        after_state={"name": doc.name},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    await db.refresh(doc)

    storage_service = get_storage_service()
    signed_url = storage_service.get_signed_url(doc.storage_key)
    return to_document_response(doc, signed_url)


@router.get("/documents/files/{key}/view", summary="Inline view document file via signed URL")
@router.get("/documents/view/{key}", summary="Inline view document file via signed URL")
@router.get("/documents/files/{key}", summary="Download document file via signed URL")
async def get_document_file(
    key: str,
    expires: int = Query(...),
    sig: str = Query(...),
    download: bool = Query(default=False),
) -> Response:
    storage = get_storage_service()
    if isinstance(storage, LocalStorageService):
        if not storage.verify_signed_url(key, expires, sig):
            raise UnauthenticatedException("Signed URL has expired or has an invalid signature.")
        try:
            data, content_type = await storage.get_object(key)
        except FileNotFoundError:
            raise NotFoundException(f"Document file {key} not found on server.")
    else:
        # S3 pre-signed URLs are handled by S3 directly
        try:
            data, content_type = await storage.get_object(key)
        except Exception:
            raise NotFoundException(f"Document file {key} not found on server.")

    filename = Path(key).name
    if not filename.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")) and content_type == "application/pdf":
        filename = f"{filename}.pdf"

    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Request-ID, X-Requested-With, Range",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type, Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Accept-Ranges": "bytes",
        "Content-Length": str(len(data)),
    }
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'

    return Response(content=data, media_type=content_type, headers=headers)
