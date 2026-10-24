import asyncio
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.queue.models import DailyTokenCounter

_token_locks: dict[tuple[Any, str, str], asyncio.Lock] = {}


def get_token_lock(dept: str, dt_str: str) -> asyncio.Lock:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    key = (loop, dept, dt_str)
    if key not in _token_locks:
        _token_locks[key] = asyncio.Lock()
    return _token_locks[key]


async def allocate_daily_token(db: AsyncSession, department: str) -> str:
    """
    Safely allocate S-### / O-### token per department per IST day.
    Uses database row-locking or upsert to ensure concurrency safety.
    """
    dept = department.lower()
    prefix = "S-" if dept == "skin" else "O-"
    
    # Calculate IST current date
    ist_tz = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(UTC).astimezone(ist_tz)
    today_ist = now_ist.date()

    # Try PostgreSQL UPSERT atomic sequence if running on postgresql
    bind = db.get_bind()
    is_postgres = bind.dialect.name == "postgresql" if bind else False
    if is_postgres:
        query = sa.text("""
            INSERT INTO daily_token_counters (department, date, current_number)
            VALUES (:department, :date, 1)
            ON CONFLICT (department, date)
            DO UPDATE SET current_number = daily_token_counters.current_number + 1
            RETURNING current_number;
        """)
        res = await db.execute(query, {"department": dept, "date": today_ist})
        number = res.scalar_one()
        return f"{prefix}{number:03d}"

    # Fallback for SQLite in tests: coroutine lock / select & update
    lock = get_token_lock(dept, str(today_ist))
    async with lock:
        stmt = (
            select(DailyTokenCounter)
            .where(
                DailyTokenCounter.department == dept,
                DailyTokenCounter.date == today_ist,
            )
        )
        res = await db.execute(stmt)
        counter = res.scalar_one_or_none()
        if not counter:
            counter = DailyTokenCounter(
                department=dept,
                date=today_ist,
                current_number=1,
            )
            db.add(counter)
            await db.flush()
            number = 1
        else:
            counter.current_number += 1
            await db.flush()
            number = counter.current_number
        return f"{prefix}{number:03d}"


async def next_display_id(db: AsyncSession, model, prefix: str, base_offset: int = 1001) -> str:
    """Generate human-readable display IDs (e.g. PT-1001, APT-1001, VIS-1001, Q-1001, INV-1001)."""
    stmt = select(func.count()).select_from(model)
    res = await db.execute(stmt)
    count = res.scalar_one() or 0
    candidate_num = count + base_offset

    # Ensure uniqueness if records were deleted
    for offset in range(50):
        test_id = f"{prefix}-{candidate_num + offset}"
        exists_stmt = select(model.id).where(model.display_id == test_id)
        existing = await db.execute(exists_stmt)
        if not existing.scalar_one_or_none():
            return test_id

    # Fallback to timestamp suffix
    return f"{prefix}-{int(datetime.now(UTC).timestamp())}"
