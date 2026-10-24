from datetime import datetime
from zoneinfo import ZoneInfo

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.modules.followups.models import FollowUp, ReminderLog
from app.services.notification import get_notification_provider

logger = structlog.get_logger("tosh.scheduler")

scheduler = AsyncIOScheduler()


def get_today_ist() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")


async def run_reminder_processing_job():
    async with async_session_factory() as db:
        await process_scheduled_reminders(db)


async def process_scheduled_reminders(db: AsyncSession) -> int:
    today_ist = get_today_ist()
    stmt = select(FollowUp).where(
        FollowUp.status == "Upcoming",
        FollowUp.reminder_status != "Sent",
    )
    res = await db.execute(stmt)
    follow_ups = res.scalars().all()

    provider = get_notification_provider()
    processed_count = 0

    for fu in follow_ups:
        # Check date
        kind = None
        if fu.date == today_ist:
            kind = "on-date"
        else:
            from datetime import date, timedelta
            fu_date = date.fromisoformat(fu.date)
            today_date = date.fromisoformat(today_ist)
            if fu_date == today_date + timedelta(days=2):
                kind = "two-days-before"

        if kind:
            phone = fu.patient.phone if fu.patient else ""
            msg = f"Reminder: You have a follow-up appointment scheduled on {fu.date} with {fu.doctor.display_name if fu.doctor else 'the doctor'}."

            fu.reminder_status = "Queued"
            log_entry = ReminderLog(
                follow_up_id=fu.id,
                kind=kind,
                channel="whatsapp",
                status="Queued",
            )
            db.add(log_entry)

            success, msg_id = await provider.send_reminder(phone=phone, message=msg, kind=kind)
            if success:
                log_entry.status = "Sent"
                log_entry.provider_message_id = msg_id
                fu.reminder_status = "Sent"
            else:
                log_entry.status = "Failed"

            processed_count += 1

    if processed_count > 0:
        await db.commit()

    return processed_count


def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(
            run_reminder_processing_job,
            "cron",
            hour=9,
            minute=0,
            timezone="Asia/Kolkata",
            id="daily_followup_reminders",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("scheduler_started", job_id="daily_followup_reminders")


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_shutdown")
