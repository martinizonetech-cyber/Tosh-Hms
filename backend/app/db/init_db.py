import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.db import session as db_session
import app.db.all_models  # noqa: F401 - Register all models with Base.metadata

logger = structlog.get_logger("tosh.db")


async def init_database() -> None:
    """Verify DB connection, create missing tables, and auto-seed initial data.
    If PostgreSQL is unreachable, automatically fall back to local SQLite to ensure
    zero-setup uninterrupted operation.
    """
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    connected = False

    # Attempt 1: Test connection to configured DATABASE_URL
    try:
        async with db_session.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        connected = True
        logger.info(
            "database_connected",
            target=settings.DATABASE_URL.split("@")[-1] if "@" in settings.DATABASE_URL else settings.DATABASE_URL,
        )
    except Exception as exc:
        logger.warning("primary_database_connection_failed", error=str(exc))
        if not is_sqlite:
            # Fall back to SQLite
            print(f"\n[WARNING] Could not connect to PostgreSQL ({settings.DATABASE_URL}): {exc}")
            print("[INFO] Falling back to local SQLite database (./tosh.db) so the system works immediately...\n")
            try:
                sqlite_url = "sqlite+aiosqlite:///./tosh.db"
                new_engine = create_async_engine(sqlite_url, echo=False, future=True)
                db_session.engine = new_engine
                try:
                    db_session.async_session_factory.configure(bind=new_engine)
                except Exception:
                    pass
                from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
                db_session.async_session_factory = async_sessionmaker(
                    bind=new_engine,
                    class_=AsyncSession,
                    expire_on_commit=False,
                    autocommit=False,
                    autoflush=False,
                )
                connected = True
            except Exception as e2:
                logger.error("sqlite_fallback_failed", error=str(e2))

    if not connected:
        logger.error("database_initialization_aborted_no_connection")
        return

    # Attempt 2: Ensure all tables exist
    try:
        async with db_session.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database_tables_verified")
    except Exception as exc:
        logger.error("database_table_creation_failed", error=str(exc))
        return

    # Attempt 3: Check if staff accounts exist, seed if empty
    try:
        from app.modules.users.models import User

        async with db_session.async_session_factory() as session:
            res = await session.execute(select(User).limit(1))
            user_exists = res.scalars().first() is not None

        if not user_exists:
            logger.info("seeding_initial_staff_data")
            from app.scripts.seed import seed_database

            await seed_database(clean=False)
            logger.info("database_seeded_successfully")
        else:
            # Sync staff accounts to configured initial password
            from app.core.security import hash_password
            initial_pw = settings.RECEPTION_INITIAL_PASSWORD or "123456789"
            async with db_session.async_session_factory() as session:
                res = await session.execute(
                    select(User).where(User.email.in_(["reception@gmail.com", "skin@gmail.com", "ortho@gmail.com"]))
                )
                existing_staff = res.scalars().all()
                if existing_staff:
                    for staff in existing_staff:
                        staff.password_hash = hash_password(initial_pw)
                        staff.must_change_password = False
                    await session.commit()
                    logger.info("staff_initial_passwords_synced")
    except Exception as exc:
        logger.warning("database_seeding_check_failed", error=str(exc))

