import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.all_models import *
from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Test fixture throwaway passwords for testing
if not settings.RECEPTION_INITIAL_PASSWORD:
    settings.RECEPTION_INITIAL_PASSWORD = "FixturePassword123!"
if not settings.SKIN_INITIAL_PASSWORD:
    settings.SKIN_INITIAL_PASSWORD = "FixturePassword123!"
if not settings.ORTHO_INITIAL_PASSWORD:
    settings.ORTHO_INITIAL_PASSWORD = "FixturePassword123!"

# Database configuration: PostgreSQL is strictly required for all backend tests
TEST_DATABASE_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or settings.DATABASE_URL
)
if "postgres" not in TEST_DATABASE_URL.lower():
    raise RuntimeError(
        f"PostgreSQL database is strictly required for Tosh backend tests. Got: {TEST_DATABASE_URL}"
    )

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


from app.core.limiter import limiter


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def disable_limiter_in_tests():
    limiter.enabled = False
    yield
    limiter.enabled = False


from sqlalchemy import text

from app.core.config import settings
from app.core.security import hash_password
from app.modules.users.models import Doctor, User


@pytest.fixture(autouse=True)
async def setup_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("""
            CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'audit_log table is append-only. UPDATE and DELETE operations are forbidden.';
            END;
            $$ LANGUAGE plpgsql;
        """))
        await conn.execute(text("DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;"))
        await conn.execute(text("""
            CREATE TRIGGER trg_audit_log_append_only
            BEFORE UPDATE OR DELETE ON audit_log
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
        """))
        table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {', '.join(table_names)} CASCADE;"))
    yield
    async with test_engine.begin() as conn:
        table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {', '.join(table_names)} CASCADE;"))


@pytest.fixture
async def seed_test_users(db_session: AsyncSession):
    # Reception
    reception = User(
        email="reception@northstar.demo",
        password_hash=hash_password(settings.RECEPTION_INITIAL_PASSWORD),
        role="reception",
        display_name="Reception Desk",
        department=None,
    )
    # Skin
    skin = User(
        email="skin@gmail.com",
        password_hash=hash_password(settings.SKIN_INITIAL_PASSWORD),
        role="skin",
        display_name="Dr. Sangamitra",
        department="skin",
    )
    # Ortho
    ortho = User(
        email="ortho@gmail.com",
        password_hash=hash_password(settings.ORTHO_INITIAL_PASSWORD),
        role="orthopaedics",
        display_name="Dr. Sundarprakash",
        department="orthopaedics",
    )
    db_session.add_all([reception, skin, ortho])
    await db_session.flush()

    doc_skin = Doctor(user_id=skin.id, display_name="Dr. Sangamitra", department="skin")
    doc_ortho = Doctor(user_id=ortho.id, display_name="Dr. Sundarprakash", department="orthopaedics")
    db_session.add_all([doc_skin, doc_ortho])

    # Fee settings
    from app.modules.settings.models import FeeSetting
    fee_skin = FeeSetting(department="skin", amount=70000, currency="INR")
    fee_ortho = FeeSetting(department="orthopaedics", amount=90000, currency="INR")
    db_session.add_all([fee_skin, fee_ortho])

    # Charge Catalog
    from app.modules.catalog.models import ChargeCatalogItem
    from app.scripts.seed import CATALOG_ITEMS
    for c in CATALOG_ITEMS:
        db_session.add(ChargeCatalogItem(**c))

    await db_session.commit()



@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def async_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        async with TestingSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()
