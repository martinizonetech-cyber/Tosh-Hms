import hashlib
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppException, ForbiddenException, NotFoundException, UnauthenticatedException
from app.core.tokens import next_display_id
from app.core.websocket import broadcast_event
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

    # If clinician uploads without a resolved visit, auto-link to active or latest visit in their department
    if not resolved_visit_id and current_user.role in ("skin", "orthopaedics"):
        v_active_stmt = (
            select(Visit)
            .where(Visit.patient_id == patient.id, Visit.department == current_user.role)
            .order_by(Visit.started_at.desc())
        )
        v_active = (await db.execute(v_active_stmt)).scalars().first()
        if v_active:
            resolved_visit_id = v_active.id

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

    await broadcast_event("document:created", {"document_id": doc.display_id, "patient_id": patient.display_id, "visit_id": str(doc.visit_id) if doc.visit_id else None})
    await broadcast_event("visit:updated", {"patient_id": patient.display_id, "visit_id": str(doc.visit_id) if doc.visit_id else None})

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

    stmt = (
        select(Document)
        .outerjoin(Visit, Document.visit_id == Visit.id)
        .outerjoin(User, Document.uploaded_by == User.id)
        .where(Document.patient_id == patient.id, Document.deleted_at.is_(None))
    )

    if current_user.role in ("skin", "orthopaedics"):
        # Strictly isolate: clinicians only see documents belonging to their own department
        stmt = stmt.where(
            or_(
                Visit.department == current_user.role,
                and_(
                    Document.visit_id.is_(None),
                    or_(
                        User.role == current_user.role,
                        User.department == current_user.role,
                        Document.uploaded_by == current_user.id,
                    ),
                ),
            )
        )

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

    # Department guard: clinicians can only delete documents belonging to their own department
    if current_user.role in ("skin", "orthopaedics") and doc.uploaded_by != current_user.id:
        doc_dept = None
        if doc.visit_id:
            v_res = await db.execute(select(Visit.department).where(Visit.id == doc.visit_id))
            doc_dept = v_res.scalar_one_or_none()
        elif doc.uploaded_by:
            u_res = await db.execute(select(User.role).where(User.id == doc.uploaded_by))
            doc_dept = u_res.scalar_one_or_none()

        if doc_dept and doc_dept != current_user.role:
            raise ForbiddenException("Clinicians cannot delete documents belonging to another department.")

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

    await broadcast_event("document:deleted", {"document_id": doc.display_id, "patient_id": str(doc.patient_id), "visit_id": str(doc.visit_id) if doc.visit_id else None})
    await broadcast_event("visit:updated", {"patient_id": str(doc.patient_id), "visit_id": str(doc.visit_id) if doc.visit_id else None})

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

    # Department guard: clinicians can only rename documents belonging to their own department
    if current_user.role in ("skin", "orthopaedics") and doc.uploaded_by != current_user.id:
        doc_dept = None
        if doc.visit_id:
            v_res = await db.execute(select(Visit.department).where(Visit.id == doc.visit_id))
            doc_dept = v_res.scalar_one_or_none()
        elif doc.uploaded_by:
            u_res = await db.execute(select(User.role).where(User.id == doc.uploaded_by))
            doc_dept = u_res.scalar_one_or_none()

        if doc_dept and doc_dept != current_user.role:
            raise ForbiddenException("Clinicians cannot rename documents belonging to another department.")

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

    await broadcast_event("document:updated", {"document_id": doc.display_id, "name": doc.name, "patient_id": str(doc.patient_id), "visit_id": str(doc.visit_id) if doc.visit_id else None})
    await broadcast_event("visit:updated", {"patient_id": str(doc.patient_id), "visit_id": str(doc.visit_id) if doc.visit_id else None})

    storage_service = get_storage_service()
    signed_url = storage_service.get_signed_url(doc.storage_key)
    return to_document_response(doc, signed_url)


@router.get("/documents/files/{key}/view", summary="Inline view document file via signed URL")
@router.get("/documents/view/{key}", summary="Inline view document file via signed URL")
@router.get("/documents/files/{key}", summary="Download document file via signed URL")
async def get_document_file(
    key: str,
    request: Request,
    expires: int | None = Query(default=None),
    sig: str | None = Query(default=None),
    token: str | None = Query(default=None),
    download: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> Response:
    clean_key = Path(key).name
    storage = get_storage_service()

    # 1. Authorize via signed URL or token
    authorized = False
    if expires is not None and sig is not None:
        if isinstance(storage, LocalStorageService):
            if storage.verify_signed_url(clean_key, expires, sig):
                authorized = True
        else:
            authorized = True

    if not authorized:
        # Check Bearer token in header or query parameter
        auth_header = request.headers.get("Authorization") or ""
        raw_token = token
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()
        if raw_token:
            from app.core.security import decode_access_token
            try:
                payload = decode_access_token(raw_token)
                if payload and "sub" in payload:
                    authorized = True
            except Exception:
                pass

    if not authorized:
        raise UnauthenticatedException("Signed URL has expired or has an invalid signature.")

    # Department guard for clinicians accessing files
    caller_role = None
    auth_header = request.headers.get("Authorization") or ""
    raw_tok = token or (auth_header[7:].strip() if auth_header.startswith("Bearer ") else None)
    if raw_tok:
        from app.core.security import decode_access_token
        try:
            tok_payload = decode_access_token(raw_tok)
            if tok_payload:
                caller_role = tok_payload.get("role")
        except Exception:
            pass

    if caller_role in ("skin", "orthopaedics"):
        doc_chk_stmt = (
            select(Document)
            .where(Document.storage_key == clean_key, Document.deleted_at.is_(None))
        )
        doc_chk = (await db.execute(doc_chk_stmt)).scalar_one_or_none()
        if doc_chk:
            doc_dept = None
            if doc_chk.visit_id:
                v_res = await db.execute(select(Visit.department).where(Visit.id == doc_chk.visit_id))
                doc_dept = v_res.scalar_one_or_none()
            elif doc_chk.uploaded_by:
                u_res = await db.execute(select(User.role).where(User.id == doc_chk.uploaded_by))
                doc_dept = u_res.scalar_one_or_none()

            if doc_dept and doc_dept != caller_role:
                raise ForbiddenException("Clinicians cannot access documents belonging to another department.")

    # 2. Retrieve document bytes
    try:
        data, content_type = await storage.get_object(clean_key)
    except FileNotFoundError:
        raise NotFoundException(f"Document file {clean_key} not found on server.")
    except Exception:
        raise NotFoundException(f"Document file {clean_key} could not be retrieved.")

    filename = clean_key
    if not filename.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")) and content_type == "application/pdf":
        filename = f"{filename}.pdf"

    file_size = len(data)
    disposition = "attachment" if download else "inline"
    content_disposition = f'{disposition}; filename="{filename}"'

    base_headers = {
        "Content-Disposition": content_disposition,
        "Accept-Ranges": "bytes",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges",
    }

    # 3. HTTP Range requests (RFC 7233) for streaming PDF rendering in Chrome / Edge / Firefox
    range_header = request.headers.get("range") or request.headers.get("Range")
    if range_header and range_header.strip().lower().startswith("bytes="):
        range_val = range_header.strip()[6:].strip()
        try:
            if "," in range_val:
                range_val = range_val.split(",")[0].strip()
            parts = range_val.split("-", 1)
            start_str, end_str = parts[0].strip(), parts[1].strip()

            if start_str and end_str:
                start = int(start_str)
                end = int(end_str)
            elif start_str:
                start = int(start_str)
                end = file_size - 1
            elif end_str:
                suffix_len = int(end_str)
                start = max(0, file_size - suffix_len)
                end = file_size - 1
            else:
                start = 0
                end = file_size - 1

            if start < 0 or start >= file_size or end < start:
                return Response(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    headers={
                        "Content-Range": f"bytes */{file_size}",
                        **base_headers,
                    },
                )

            end = min(end, file_size - 1)
            content_length = end - start + 1
            sliced_data = data[start:end + 1]

            range_headers = {
                **base_headers,
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
            }

            return Response(
                content=sliced_data,
                status_code=status.HTTP_206_PARTIAL_CONTENT,
                media_type=content_type,
                headers=range_headers,
            )
        except (ValueError, IndexError):
            pass

    # 4. Standard 200 OK full response
    full_headers = {
        **base_headers,
        "Content-Length": str(file_size),
    }
    return Response(
        content=data,
        status_code=status.HTTP_200_OK,
        media_type=content_type,
        headers=full_headers,
    )
