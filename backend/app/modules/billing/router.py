import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    AppException,
    ForbiddenException,
    NotFoundException,
    PaymentExceedsBalanceException,
)
from app.core.tokens import next_display_id
from app.db.session import get_db
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.billing.models import Invoice, InvoiceCharge, Payment, Refund
from app.modules.billing.schemas import (
    UpdateInvoiceRequest,
    ChargeItemResponse,
    CreateVisitChargeRequest,
    InvoiceResponse,
    PaginatedInvoicesResponse,
    PaymentResponse,
    RecordPaymentRequest,
    RecordRefundRequest,
    RefundResponse,
)
from app.modules.catalog.models import ChargeCatalogItem
from app.modules.patients.router import find_patient_by_id
from app.modules.users.models import User
from app.modules.visits.router import find_visit_by_id

router = APIRouter(tags=["Billing"])

require_reception = require_role("reception")
require_staff = require_role("reception", "skin", "orthopaedics")

_invoice_locks: dict[tuple[Any, str], asyncio.Lock] = {}


def get_invoice_lock(invoice_id: str) -> asyncio.Lock:
    """DEFENSE-IN-DEPTH ONLY.

    Authoritative concurrency control across multiple uvicorn workers is enforced
    exclusively by the PostgreSQL database row lock (`SELECT ... FOR UPDATE OF invoices`
    in `find_invoice_by_id(..., for_update=True)` inside the active transaction).
    This in-process asyncio lock serves purely as an in-process optimization and
    sqlite test fixture helper.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    key = (loop, invoice_id)
    if key not in _invoice_locks:
        _invoice_locks[key] = asyncio.Lock()
    return _invoice_locks[key]


async def find_invoice_by_id(db: AsyncSession, identifier: str, for_update: bool = False) -> Invoice | None:
    try:
        val_uuid = uuid.UUID(identifier)
        stmt = select(Invoice).where(or_(Invoice.id == val_uuid, Invoice.display_id == identifier))
    except ValueError:
        stmt = select(Invoice).where(Invoice.display_id == identifier)

    if for_update:
        stmt = stmt.with_for_update(of=Invoice)

    res = await db.execute(stmt)
    return res.scalar_one_or_none()


def compute_invoice_math(
    consultation_fee_paise: int,
    charges: list[InvoiceCharge],
    payments: list[Payment],
    refunds: list[Refund],
) -> tuple[float, float, float, str]:
    """Compute total, paid, balance, and status in Rupees."""
    total_charges_paise = sum(c.amount for c in charges)
    total_paise = consultation_fee_paise + total_charges_paise

    total_payments_paise = sum(p.amount for p in payments)
    total_refunds_paise = sum(r.amount for r in refunds)
    net_paid_paise = max(0, total_payments_paise - total_refunds_paise)

    balance_paise = max(0, total_paise - net_paid_paise)

    total_rupees = round(total_paise / 100.0, 2)
    paid_rupees = round(net_paid_paise / 100.0, 2)
    balance_rupees = round(balance_paise / 100.0, 2)

    if balance_paise == 0 and total_paise > 0:
        inv_status = "Paid"
    elif net_paid_paise > 0 and balance_paise > 0:
        inv_status = "Partial"
    else:
        inv_status = "Due"

    return total_rupees, paid_rupees, balance_rupees, inv_status


def to_invoice_response(invoice: Invoice) -> InvoiceResponse:
    charges = invoice.charges or []
    payments = invoice.payments or []
    refunds = invoice.refunds or []

    total, paid, balance, inv_status = compute_invoice_math(
        invoice.consultation_fee,
        charges,
        payments,
        refunds,
    )

    charge_items = [
        ChargeItemResponse(
            id=c.display_id,
            description=c.description,
            amount=round(c.amount / 100.0, 2),
            department=invoice.department,
            added_by=c.added_by,
            date=c.created_at.strftime("%Y-%m-%d"),
        )
        for c in charges
    ]

    payment_items = [
        PaymentResponse(
            id=p.display_id,
            amount=round(p.amount / 100.0, 2),
            method=p.method,
            transaction_reference=p.transaction_reference,
            paid_at=p.paid_at.isoformat(),
            recorded_by=str(p.recorded_by) if p.recorded_by else None,
        )
        for p in payments
    ]

    refund_items = [
        RefundResponse(
            id=r.display_id,
            amount=round(r.amount / 100.0, 2),
            reason=r.reason,
            refunded_at=r.refunded_at.isoformat(),
            recorded_by=str(r.recorded_by) if r.recorded_by else None,
        )
        for r in refunds
    ]

    pat_id = invoice.patient.display_id if invoice.patient else str(invoice.patient_id)

    return InvoiceResponse(
        id=invoice.display_id,
        patient_id=pat_id,
        department=invoice.department,
        visit_label=invoice.visit_label,
        consultation_fee=round(invoice.consultation_fee / 100.0, 2),
        charges=charge_items,
        payments=payment_items,
        refunds=refund_items,
        total=total,
        paid=paid,
        balance=balance,
        status=inv_status,  # type: ignore[arg-type]
        created_at=invoice.created_at.isoformat(),
        date=invoice.created_at.strftime("%Y-%m-%d"),
    )


@router.get("/invoices", response_model=PaginatedInvoicesResponse, summary="List invoices")
async def list_invoices(
    department: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_id: str | None = Query(None, alias="patientId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedInvoicesResponse:
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians cannot access invoices from other departments.")
        department = current_user.role

    stmt = select(Invoice)
    if department:
        stmt = stmt.where(Invoice.department == department.lower())

    if patient_id:
        patient = await find_patient_by_id(db, patient_id)
        if patient:
            stmt = stmt.where(Invoice.patient_id == patient.id)
        else:
            stmt = stmt.where(Invoice.patient_id == uuid.uuid4())

    stmt = stmt.order_by(Invoice.created_at.desc())
    res = await db.execute(stmt)
    invoices = res.scalars().all()

    # Compute status and filter in memory if status_filter passed
    matched_items: list[InvoiceResponse] = []
    for inv in invoices:
        resp_item = to_invoice_response(inv)
        if status_filter:
            if resp_item.status.lower() == status_filter.lower():
                matched_items.append(resp_item)
        else:
            matched_items.append(resp_item)

    total = len(matched_items)
    start_idx = (page - 1) * page_size
    paged_items = matched_items[start_idx : start_idx + page_size]

    return PaginatedInvoicesResponse(
        items=paged_items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/invoices/{invoice_id}/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED, summary="Record payment on invoice")
async def record_payment(
    invoice_id: str,
    payload: RecordPaymentRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> PaymentResponse:
    # Row-lock invoice for payment
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role in ("skin", "orthopaedics") and invoice.department != current_user.role:
        raise ForbiddenException("Clinicians cannot accept payments for other departments.")

    lock = get_invoice_lock(str(invoice.id))
    async with lock:
        # Idempotent retry check: if idempotency key passed and payment already exists with this reference
        if idempotency_key:
            ref_stmt = select(Payment).where(
                Payment.invoice_id == invoice.id,
                Payment.transaction_reference == idempotency_key,
            )
            ref_res = await db.execute(ref_stmt)
            existing_pay = ref_res.scalar_one_or_none()
            if existing_pay:
                return PaymentResponse(
                    id=existing_pay.display_id,
                    amount=round(existing_pay.amount / 100.0, 2),
                    method=existing_pay.method,
                    transaction_reference=existing_pay.transaction_reference,
                    paid_at=existing_pay.paid_at.isoformat(),
                    recorded_by=str(existing_pay.recorded_by) if existing_pay.recorded_by else None,
                )

        # Calculate balance fresh from db
        chg_sum_stmt = select(func.coalesce(func.sum(InvoiceCharge.amount), 0)).where(InvoiceCharge.invoice_id == invoice.id)
        total_charges_paise: int = int((await db.execute(chg_sum_stmt)).scalar_one())

        pay_sum_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == invoice.id)
        total_payments_paise: int = int((await db.execute(pay_sum_stmt)).scalar_one())

        refund_sum_stmt = select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.invoice_id == invoice.id)
        total_refunds_paise: int = int((await db.execute(refund_sum_stmt)).scalar_one())

        net_paid_paise = max(0, total_payments_paise - total_refunds_paise)
        total_paise = invoice.consultation_fee + total_charges_paise
        balance_paise = max(0, total_paise - net_paid_paise)
        balance_rupees = round(balance_paise / 100.0, 2)

        amount_paise = round(payload.amount * 100)

        if amount_paise > balance_paise:
            raise PaymentExceedsBalanceException(
                f"Payment amount (₹{payload.amount}) cannot exceed remaining balance (₹{balance_rupees})."
            )

        display_id = await next_display_id(db, Payment, "PAY")
        payment = Payment(
            display_id=display_id,
            invoice_id=invoice.id,
            amount=amount_paise,
            method=payload.method,
            transaction_reference=idempotency_key or payload.transaction_reference,
            recorded_by=current_user.id,
        )
        db.add(payment)

        await log_audit_event(
            db=db,
            action="INVOICE_PAYMENT",
            entity_type="Invoice",
            entity_id=invoice.display_id,
            actor_user_id=current_user.id,
            patient_id=invoice.patient_id,
            after_state={"paymentId": display_id, "amount": payload.amount, "method": payload.method},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

        await db.commit()

        return PaymentResponse(
            id=payment.display_id,
            amount=round(payment.amount / 100.0, 2),
            method=payment.method,
            transaction_reference=payment.transaction_reference,
            paid_at=payment.paid_at.isoformat() if payment.paid_at else datetime.now(UTC).isoformat(),
            recorded_by=str(payment.recorded_by) if payment.recorded_by else None,
        )


@router.post("/invoices/{invoice_id}/refunds", response_model=RefundResponse, status_code=status.HTTP_201_CREATED, summary="Record refund on invoice")
async def record_refund(
    invoice_id: str,
    payload: RecordRefundRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_reception),
) -> RefundResponse:
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    lock = get_invoice_lock(str(invoice.id))
    async with lock:
        pay_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == invoice.id)
        total_payments_paise: int = int((await db.execute(pay_stmt)).scalar_one())

        ref_stmt = select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.invoice_id == invoice.id)
        total_refunds_paise: int = int((await db.execute(ref_stmt)).scalar_one())

        net_paid_paise = max(0, total_payments_paise - total_refunds_paise)
        net_paid_rupees = round(net_paid_paise / 100.0, 2)

        refund_paise = round(payload.amount * 100)

        if refund_paise > net_paid_paise:
            raise AppException(
                f"Refund amount (₹{payload.amount}) cannot exceed net paid amount (₹{net_paid_rupees}).",
                code="REFUND_EXCEEDS_PAID",
                status_code=422,
            )

        display_id = await next_display_id(db, Refund, "REF")
        refund = Refund(
            display_id=display_id,
            invoice_id=invoice.id,
            amount=refund_paise,
            reason=payload.reason,
            recorded_by=current_user.id,
        )
        db.add(refund)

        await log_audit_event(
            db=db,
            action="INVOICE_REFUND",
            entity_type="Invoice",
            entity_id=invoice.display_id,
            actor_user_id=current_user.id,
            patient_id=invoice.patient_id,
            after_state={"refundId": display_id, "amount": payload.amount, "reason": payload.reason},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

        await db.commit()

        return RefundResponse(
            id=refund.display_id,
            amount=round(refund.amount / 100.0, 2),
            reason=refund.reason,
            refunded_at=refund.refunded_at.isoformat() if refund.refunded_at else datetime.now(UTC).isoformat(),
            recorded_by=str(refund.recorded_by) if refund.recorded_by else None,
        )


@router.post("/visits/{visit_id}/charges", response_model=ChargeItemResponse, status_code=status.HTTP_201_CREATED, summary="Add charge to visit invoice")
async def add_visit_charge(
    visit_id: str,
    payload: CreateVisitChargeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> ChargeItemResponse:
    visit = await find_visit_by_id(db, visit_id)
    if not visit:
        raise NotFoundException(f"Visit with ID {visit_id} not found.")

    # Doctor of that department or reception staff
    if current_user.role != visit.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can add charges.")

    # Find linked invoice
    inv_stmt = select(Invoice).where(Invoice.visit_id == visit.id).with_for_update(of=Invoice)
    inv_res = await db.execute(inv_stmt)
    invoice = inv_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundException(f"No invoice found for visit {visit_id}.")

    # If catalog item is referenced, re-read price from server catalog!
    final_amount = payload.amount
    description = payload.description
    if payload.catalog_item_id:
        conditions = [ChargeCatalogItem.display_id == payload.catalog_item_id]
        if is_uuid(payload.catalog_item_id):
            conditions.append(ChargeCatalogItem.id == uuid.UUID(payload.catalog_item_id))
        cat_stmt = select(ChargeCatalogItem).where(
            or_(*conditions),
            ChargeCatalogItem.is_active.is_(True),
        )
        cat_res = await db.execute(cat_stmt)
        cat_item = cat_res.scalar_one_or_none()
        if cat_item:
            final_amount = round(cat_item.price / 100.0, 2)
            if not description or description == payload.catalog_item_id:
                description = cat_item.name

    display_id = await next_display_id(db, InvoiceCharge, "CHG")
    charge = InvoiceCharge(
        display_id=display_id,
        invoice_id=invoice.id,
        description=description,
        amount=round(final_amount * 100),
        added_by=current_user.display_name,
    )
    db.add(charge)

    await log_audit_event(
        db=db,
        action="VISIT_CHARGE_ADD",
        entity_type="Invoice",
        entity_id=invoice.display_id,
        actor_user_id=current_user.id,
        patient_id=invoice.patient_id,
        after_state={"chargeId": display_id, "description": description, "amount": final_amount},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(charge)

    return ChargeItemResponse(
        id=charge.display_id,
        description=charge.description,
        amount=final_amount,
        department=visit.department,
        added_by=charge.added_by,
        date=charge.created_at.strftime("%Y-%m-%d"),
    )

@router.post("/invoices/{invoice_id}/charges", response_model=ChargeItemResponse, status_code=status.HTTP_201_CREATED, summary="Add charge directly to invoice")
async def add_invoice_charge(
    invoice_id: str,
    payload: CreateVisitChargeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> ChargeItemResponse:
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role != invoice.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can add charges.")

    final_amount = payload.amount
    description = payload.description
    if payload.catalog_item_id:
        conditions = [ChargeCatalogItem.display_id == payload.catalog_item_id]
        if is_uuid(payload.catalog_item_id):
            conditions.append(ChargeCatalogItem.id == uuid.UUID(payload.catalog_item_id))
        cat_stmt = select(ChargeCatalogItem).where(
            or_(*conditions),
            ChargeCatalogItem.is_active.is_(True),
        )
        cat_res = await db.execute(cat_stmt)
        cat_item = cat_res.scalar_one_or_none()
        if cat_item:
            final_amount = round(cat_item.price / 100.0, 2)
            if not description or description == payload.catalog_item_id:
                description = cat_item.name

    display_id = await next_display_id(db, InvoiceCharge, "CHG")
    charge = InvoiceCharge(
        display_id=display_id,
        invoice_id=invoice.id,
        description=description,
        amount=round(final_amount * 100),
        added_by=current_user.display_name,
    )
    db.add(charge)

    await log_audit_event(
        db=db,
        action="INVOICE_CHARGE_ADD",
        entity_type="Invoice",
        entity_id=invoice.display_id,
        actor_user_id=current_user.id,
        patient_id=invoice.patient_id,
        after_state={"chargeId": display_id, "description": description, "amount": final_amount},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    await db.refresh(charge)

    return ChargeItemResponse(
        id=charge.display_id,
        description=charge.description,
        amount=final_amount,
        department=invoice.department,
        added_by=charge.added_by,
        date=charge.created_at.strftime("%Y-%m-%d"),
    )





@router.patch("/invoices/{invoice_id}", response_model=InvoiceResponse, summary="Update invoice consultation fee")
async def update_invoice(
    invoice_id: str,
    payload: UpdateInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role != invoice.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can edit invoices.")

    if payload.consultation_fee is not None:
        if payload.consultation_fee < 0:
            raise BadRequestException("Consultation fee cannot be negative.")
        invoice.consultation_fee = int(round(payload.consultation_fee * 100))

    await db.commit()
    await db.refresh(invoice)
    return to_invoice_response(invoice)


@router.delete("/invoices/{invoice_id}/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete payment from invoice")
async def delete_invoice_payment(
    invoice_id: str,
    payment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role != invoice.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can delete payments.")

    conditions = [Payment.invoice_id == invoice.id]
    if is_uuid(payment_id):
        conditions.append(or_(Payment.id == uuid.UUID(payment_id), Payment.display_id == payment_id))
    else:
        conditions.append(Payment.display_id == payment_id)

    stmt = select(Payment).where(*conditions)
    res = await db.execute(stmt)
    payment = res.scalar_one_or_none()
    if not payment:
        raise NotFoundException(f"Payment {payment_id} not found on invoice.")

    await db.delete(payment)
    await db.commit()


@router.patch("/invoices/{invoice_id}/charges/{charge_id}", response_model=ChargeItemResponse, summary="Update charge on invoice")
async def update_invoice_charge(
    invoice_id: str,
    charge_id: str,
    payload: CreateVisitChargeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role != invoice.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can edit charges.")

    conditions = [InvoiceCharge.invoice_id == invoice.id]
    if is_uuid(charge_id):
        conditions.append(or_(InvoiceCharge.id == uuid.UUID(charge_id), InvoiceCharge.display_id == charge_id))
    else:
        conditions.append(InvoiceCharge.display_id == charge_id)

    stmt = select(InvoiceCharge).where(*conditions)
    res = await db.execute(stmt)
    charge = res.scalar_one_or_none()
    if not charge:
        raise NotFoundException(f"Charge {charge_id} not found on invoice.")

    charge.description = payload.description.strip()
    charge.amount = int(round(payload.amount * 100))
    await db.commit()
    await db.refresh(charge)
    return serialize_charge(charge)


@router.delete("/invoices/{invoice_id}/charges/{charge_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete charge from invoice")
async def delete_invoice_charge(
    invoice_id: str,
    charge_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    invoice = await find_invoice_by_id(db, invoice_id, for_update=True)
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

    if current_user.role != invoice.department and current_user.role != "reception":
        raise ForbiddenException("Only the clinician of this department or reception staff can delete charges.")

    # Find charge by display_id or id
    conditions = [InvoiceCharge.invoice_id == invoice.id]
    if is_uuid(charge_id):
        conditions.append(or_(InvoiceCharge.id == uuid.UUID(charge_id), InvoiceCharge.display_id == charge_id))
    else:
        conditions.append(InvoiceCharge.display_id == charge_id)

    stmt = select(InvoiceCharge).where(*conditions)
    res = await db.execute(stmt)
    charge = res.scalar_one_or_none()
    if not charge:
        raise NotFoundException(f"Charge {charge_id} not found on invoice.")

    deleted_disp = charge.display_id
    deleted_amt = charge.amount / 100.0

    await db.delete(charge)

    await log_audit_event(
        db=db,
        action="INVOICE_CHARGE_DELETE",
        entity_type="Invoice",
        entity_id=invoice.display_id,
        actor_user_id=current_user.id,
        patient_id=invoice.patient_id,
        after_state={"deletedChargeId": deleted_disp, "amount": deleted_amt},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()
    return None


def is_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False
