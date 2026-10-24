import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.audit.models import AuditLog


@pytest.mark.asyncio
async def test_login_contract_camel_case(async_client: AsyncClient, seed_test_users):
    """Assert login returns { accessToken, tokenType, user: { id, email, displayName, role, department } }."""
    res = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "reception@northstar.demo",
            "password": settings.RECEPTION_INITIAL_PASSWORD,
        },
    )
    assert res.status_code == 200
    data = res.json()

    # Exact expected keys on the wire
    assert set(data.keys()) == {"accessToken", "tokenType", "user"}
    assert data["tokenType"] == "bearer"
    assert isinstance(data["accessToken"], str)

    user = data["user"]
    assert set(user.keys()) == {"id", "email", "displayName", "role", "department", "mustChangePassword"}
    assert user["email"] == "reception@northstar.demo"
    assert user["displayName"] == "Reception Desk"
    assert user["role"] == "reception"
    assert user["department"] is None


@pytest.mark.asyncio
async def test_doctors_endpoint_returns_real_seeded_doctors(async_client: AsyncClient, seed_test_users):
    """Assert GET /doctors returns seeded real doctors with display names."""
    res = await async_client.get("/api/v1/doctors")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 2
    names = {d["displayName"] for d in data}
    assert "Dr. Sangamitra" in names
    assert "Dr. Sundarprakash" in names

    # Filter by skin
    res_skin = await async_client.get("/api/v1/doctors?department=skin")
    assert res_skin.status_code == 200
    skin_data = res_skin.json()
    assert all(d["department"] == "skin" for d in skin_data)
    assert any(d["displayName"] == "Dr. Sangamitra" for d in skin_data)


@pytest.mark.asyncio
async def test_failed_login_lockout(async_client: AsyncClient, seed_test_users):
    """Assert 5 failed attempts trigger account lockout."""
    email = "skin@gmail.com"

    for _ in range(4):
        res = await async_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword123!"},
        )
        assert res.status_code == 401

    # 5th attempt locks the account
    res_5th = await async_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "WrongPassword123!"},
    )
    assert res_5th.status_code == 429
    assert res_5th.json()["code"] == "ACCOUNT_LOCKED"


@pytest.mark.asyncio
async def test_slowapi_rate_limiting(async_client: AsyncClient, seed_test_users):
    """Assert rate limiter triggers 429 when enabled."""
    from app.core.limiter import limiter
    limiter.enabled = True
    try:
        # Rapid fire requests beyond limit
        for _ in range(12):
            res = await async_client.post(
                "/api/v1/auth/login",
                json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
            )
        assert res.status_code == 429
        assert res.json()["code"] == "RATE_LIMIT_EXCEEDED"
    finally:
        limiter.enabled = False


@pytest.mark.asyncio
async def test_audit_log_records_login_events(async_client: AsyncClient, db_session: AsyncSession, seed_test_users):
    """Assert login attempts write to audit_log table."""
    await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "ortho@gmail.com",
            "password": settings.ORTHO_INITIAL_PASSWORD,
        },
    )

    res = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "AUTH_LOGIN_SUCCESS")
    )
    logs = res.scalars().all()
    assert len(logs) > 0
    assert any(log.after_state.get("email") == "ortho@gmail.com" for log in logs if log.after_state)


@pytest.mark.asyncio
async def test_audit_log_append_only_trigger(db_session: AsyncSession):
    """Assert database blocks UPDATE and DELETE on audit_log."""
    # Insert a test audit record
    log = AuditLog(
        action="TEST_ACTION",
        entity_type="test",
        entity_id="123",
    )
    db_session.add(log)
    await db_session.commit()

    from sqlalchemy.exc import SQLAlchemyError

    # Attempt UPDATE - should raise an exception from Postgres trigger or SQLite constraint
    with pytest.raises(SQLAlchemyError):
        await db_session.execute(
            update(AuditLog).where(AuditLog.id == log.id).values(action="TAMPERED")
        )
        await db_session.commit()
    await db_session.rollback()

    # Attempt DELETE - should raise an exception
    with pytest.raises(SQLAlchemyError):
        await db_session.execute(
            delete(AuditLog).where(AuditLog.id == log.id)
        )
        await db_session.commit()
    await db_session.rollback()
