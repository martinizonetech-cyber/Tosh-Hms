from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenException
from app.db.session import get_db
from app.modules.appointments.models import Appointment
from app.modules.auth.dependencies import get_current_user
from app.modules.billing.models import Invoice, Payment, Refund
from app.modules.followups.models import FollowUp
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry
from app.modules.reports.schemas import (
    DailyReportEntry,
    DashboardSummaryResponse,
    ReportSummaryResponse,
)
from app.modules.users.models import User
from app.modules.visits.models import Visit
from app.services.scheduler import get_today_ist

router = APIRouter(tags=["Reports & Dashboard"])

IST = ZoneInfo("Asia/Kolkata")


def parse_date_range_ist(from_str: str, to_str: str) -> tuple[datetime, datetime]:
    start_dt = datetime.strptime(from_str, "%Y-%m-%d").replace(tzinfo=IST)
    end_dt = datetime.strptime(to_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=IST)
    return start_dt.astimezone(UTC), end_dt.astimezone(UTC)


@router.get("/reports/summary", response_model=ReportSummaryResponse, summary="Get operational report summary")
async def get_report_summary(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    department: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportSummaryResponse:
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians can only view reports for their own department.")
        department = current_user.role

    dept_clean = department.lower() if department and department.lower() != "all" else None
    start_utc, end_utc = parse_date_range_ist(from_date, to_date)

    # 1. Registrations
    pat_stmt = select(func.count(Patient.id)).where(Patient.registered_at.between(start_utc, end_utc))
    if dept_clean:
        vis_subquery = select(Visit.patient_id).where(Visit.department == dept_clean)
        pat_stmt = pat_stmt.where(Patient.id.in_(vis_subquery))
    pat_res = await db.execute(pat_stmt)
    registrations = pat_res.scalar_one() or 0

    # 2. Appointments & Walk-ins
    apt_stmt = select(Appointment).where(Appointment.starts_at.between(start_utc, end_utc))
    if dept_clean:
        apt_stmt = apt_stmt.where(Appointment.department == dept_clean)
    apt_res = await db.execute(apt_stmt)
    all_appointments = apt_res.scalars().all()
    appointments_count = len(all_appointments)
    walk_ins = sum(1 for a in all_appointments if a.visit_type == "Walk-in")

    # 3. Completed Visits (from Queue)
    q_stmt = select(func.count(QueueEntry.id)).where(
        QueueEntry.status == "Completed",
        QueueEntry.arrival_at.between(start_utc, end_utc),
    )
    if dept_clean:
        q_stmt = q_stmt.where(QueueEntry.department == dept_clean)
    q_res = await db.execute(q_stmt)
    completed_visits = q_res.scalar_one() or 0

    # 4. Collections & Payment Methods
    pay_stmt = select(Payment).join(Payment.invoice).where(Payment.paid_at.between(start_utc, end_utc))
    if dept_clean:
        pay_stmt = pay_stmt.where(Invoice.department == dept_clean)
    pay_res = await db.execute(pay_stmt)
    payments = pay_res.scalars().all()

    ref_stmt = select(func.coalesce(func.sum(Refund.amount), 0)).join(Refund.invoice).where(Refund.refunded_at.between(start_utc, end_utc))
    if dept_clean:
        ref_stmt = ref_stmt.where(Invoice.department == dept_clean)
    ref_res = await db.execute(ref_stmt)
    total_refunds_paise = int(ref_res.scalar_one())

    total_payments_paise = sum(p.amount for p in payments)
    net_collections_paise = max(0, total_payments_paise - total_refunds_paise)
    collections = round(net_collections_paise / 100.0, 2)

    payment_methods: dict[str, float] = {}
    for p in payments:
        m = p.method
        payment_methods[m] = round(payment_methods.get(m, 0.0) + (p.amount / 100.0), 2)

    # 5. Outstanding Balance on Invoices in range
    inv_stmt = select(Invoice).where(Invoice.created_at.between(start_utc, end_utc))
    if dept_clean:
        inv_stmt = inv_stmt.where(Invoice.department == dept_clean)
    inv_res = await db.execute(inv_stmt)
    invoices = inv_res.scalars().all()

    outstanding_paise = 0
    for inv in invoices:
        chg_sum = sum(c.amount for c in inv.charges)
        tot = inv.consultation_fee + chg_sum
        p_sum = sum(p.amount for p in inv.payments) - sum(r.amount for r in inv.refunds)
        bal = max(0, tot - max(0, p_sum))
        outstanding_paise += bal
    outstanding_balance = round(outstanding_paise / 100.0, 2)

    # 6. Follow-up completion
    fu_stmt = select(FollowUp).where(FollowUp.date.between(from_date, to_date))
    if dept_clean:
        fu_stmt = fu_stmt.where(FollowUp.department == dept_clean)
    fu_res = await db.execute(fu_stmt)
    follow_ups = fu_res.scalars().all()
    fu_total = len(follow_ups)
    fu_completed = sum(1 for f in follow_ups if f.status == "Completed")
    follow_up_completion = round(fu_completed / fu_total * 100) if fu_total > 0 else 0

    # 7. Daily Breakdown
    cur_date = date.fromisoformat(from_date)
    end_date = date.fromisoformat(to_date)
    daily: list[DailyReportEntry] = []

    while cur_date <= end_date:
        d_str = cur_date.strftime("%Y-%m-%d")
        d_start_utc, d_end_utc = parse_date_range_ist(d_str, d_str)

        d_apt = sum(1 for a in all_appointments if d_start_utc <= a.starts_at <= d_end_utc)
        d_comp_stmt = select(func.count(QueueEntry.id)).where(
            QueueEntry.status == "Completed",
            QueueEntry.arrival_at.between(d_start_utc, d_end_utc),
        )
        if dept_clean:
            d_comp_stmt = d_comp_stmt.where(QueueEntry.department == dept_clean)
        d_comp_res = await db.execute(d_comp_stmt)
        d_completed = d_comp_res.scalar_one() or 0

        d_col_paise = sum(p.amount for p in payments if d_start_utc <= p.paid_at <= d_end_utc)
        daily.append(
            DailyReportEntry(
                date=d_str,
                appointments=d_apt,
                completed_visits=d_completed,
                collections=round(d_col_paise / 100.0, 2),
            )
        )
        cur_date += timedelta(days=1)

    # 8. Department Activity
    department_activity: dict[str, int] = {}
    for d in ("skin", "orthopaedics"):
        if dept_clean and dept_clean != d:
            continue
        act_stmt = select(func.count(Visit.id)).where(Visit.department == d, Visit.started_at.between(start_utc, end_utc))
        act_res = await db.execute(act_stmt)
        department_activity[d] = act_res.scalar_one() or 0

    return ReportSummaryResponse(
        **{"from": from_date},  # type: ignore[arg-type]
        to=to_date,
        department=dept_clean,
        registrations=registrations,
        appointments=appointments_count,
        completed_visits=completed_visits,
        walk_ins=walk_ins,
        collections=collections,
        outstanding_balance=outstanding_balance,
        follow_up_completion=follow_up_completion,
        payment_methods=payment_methods,
        daily=daily,
        department_activity=department_activity,
    )


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse, summary="Get today's dashboard counters")
async def get_dashboard_summary(
    department: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryResponse:
    if current_user.role in ("skin", "orthopaedics"):
        if department and department.lower() != current_user.role:
            raise ForbiddenException("Clinicians can only view dashboard for their own department.")
        department = current_user.role

    dept_clean = department.lower() if department and department.lower() != "all" else None
    today_ist = get_today_ist()
    start_utc, end_utc = parse_date_range_ist(today_ist, today_ist)

    # Queue counts today
    q_base = select(QueueEntry.status, func.count(QueueEntry.id)).where(
        QueueEntry.arrival_at.between(start_utc, end_utc)
    )
    if dept_clean:
        q_base = q_base.where(QueueEntry.department == dept_clean)
    q_base = q_base.group_by(QueueEntry.status)
    q_res = await db.execute(q_base)
    status_counts = dict(q_res.all())

    waiting_count = status_counts.get("Waiting", 0)
    consulting_count = status_counts.get("Consulting", 0)
    completed_count = status_counts.get("Completed", 0)

    # Appointments today
    apt_stmt = select(func.count(Appointment.id)).where(Appointment.starts_at.between(start_utc, end_utc))
    if dept_clean:
        apt_stmt = apt_stmt.where(Appointment.department == dept_clean)
    apt_res = await db.execute(apt_stmt)
    appointments_count = apt_res.scalar_one() or 0

    # Collections today
    pay_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).join(Payment.invoice).where(Payment.paid_at.between(start_utc, end_utc))
    if dept_clean:
        pay_stmt = pay_stmt.where(Invoice.department == dept_clean)
    pay_res = await db.execute(pay_stmt)
    collections_paise = int(pay_res.scalar_one())

    ref_stmt = select(func.coalesce(func.sum(Refund.amount), 0)).join(Refund.invoice).where(Refund.refunded_at.between(start_utc, end_utc))
    if dept_clean:
        ref_stmt = ref_stmt.where(Invoice.department == dept_clean)
    ref_res = await db.execute(ref_stmt)
    refunds_paise = int(ref_res.scalar_one())

    net_today = max(0, collections_paise - refunds_paise)
    collections = round(net_today / 100.0, 2)

    # Follow-ups today
    fu_stmt = select(func.count(FollowUp.id)).where(FollowUp.date == today_ist)
    if dept_clean:
        fu_stmt = fu_stmt.where(FollowUp.department == dept_clean)
    fu_res = await db.execute(fu_stmt)
    follow_ups_count = fu_res.scalar_one() or 0

    return DashboardSummaryResponse(
        waiting_count=waiting_count,
        consulting_count=consulting_count,
        completed_count=completed_count,
        appointments_count=appointments_count,
        collections=collections,
        follow_ups_count=follow_ups_count,
    )
