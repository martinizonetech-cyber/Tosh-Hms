import asyncio
from sqlalchemy import text
from app.db.session import async_session_factory


MOCK_DATA_TABLES = [
    "reminder_logs",
    "follow_ups",
    "payments",
    "refunds",
    "invoice_charges",
    "invoices",
    "documents",
    "prescription_items",
    "consultations",
    "queue_entries",
    "daily_token_counters",
    "vitals",
    "visits",
    "appointments",
    "patients",
    "audit_log",
]


async def clear_mock_data() -> None:
    print("[INFO] Clearing mock clinical data while preserving staff credentials and doctor profiles...")
    async with async_session_factory() as session:
        table_str = ", ".join(f'"{table}"' for table in MOCK_DATA_TABLES)
        await session.execute(text(f"TRUNCATE TABLE {table_str} CASCADE;"))
        await session.commit()
    print("[SUCCESS] Mock data deleted successfully! Users, doctors, catalog, and fee settings remain intact.")


if __name__ == "__main__":
    asyncio.run(clear_mock_data())
