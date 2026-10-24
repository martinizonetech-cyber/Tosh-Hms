import asyncio
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.fixture
async def reception_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


@pytest.fixture
async def skin_doctor_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "skin@gmail.com", "password": settings.SKIN_INITIAL_PASSWORD},
    )
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


@pytest.fixture
async def ortho_doctor_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "ortho@gmail.com", "password": settings.ORTHO_INITIAL_PASSWORD},
    )
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


@pytest.mark.asyncio
async def test_doctor_cannot_create_patient_appointment_or_queue(
    async_client: AsyncClient,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    # Both skin and orthopaedics doctors must receive 403 on POST /patients
    pat_payload = {
        "fullName": "Unauthorized Patient",
        "dateOfBirth": "1995-01-01",
        "gender": "Male",
        "phone": "9998887776",
        "address": "Street",
        "department": "skin",
    }
    res_skin_pat = await async_client.post("/api/v1/patients", headers=skin_doctor_headers, json=pat_payload)
    assert res_skin_pat.status_code == 403
    assert res_skin_pat.json()["code"] == "FORBIDDEN"

    res_ortho_pat = await async_client.post("/api/v1/patients", headers=ortho_doctor_headers, json=pat_payload)
    assert res_ortho_pat.status_code == 403
    assert res_ortho_pat.json()["code"] == "FORBIDDEN"

    # Both doctors must receive 403 on POST /appointments
    apt_payload = {
        "patientId": "PT-1001",
        "department": "skin",
        "doctor": "Dr. Sangamitra",
        "startsAt": "2026-11-01T10:00:00Z",
    }
    res_skin_apt = await async_client.post("/api/v1/appointments", headers=skin_doctor_headers, json=apt_payload)
    assert res_skin_apt.status_code == 403
    assert res_skin_apt.json()["code"] == "FORBIDDEN"

    res_ortho_apt = await async_client.post("/api/v1/appointments", headers=ortho_doctor_headers, json=apt_payload)
    assert res_ortho_apt.status_code == 403
    assert res_ortho_apt.json()["code"] == "FORBIDDEN"

    # Both doctors must receive 403 on POST /queue
    q_payload = {
        "patientId": "PT-1001",
        "department": "skin",
        "doctor": "Dr. Sangamitra",
    }
    res_skin_q = await async_client.post("/api/v1/queue", headers=skin_doctor_headers, json=q_payload)
    assert res_skin_q.status_code == 403
    assert res_skin_q.json()["code"] == "FORBIDDEN"

    res_ortho_q = await async_client.post("/api/v1/queue", headers=ortho_doctor_headers, json=q_payload)
    assert res_ortho_q.status_code == 403
    assert res_ortho_q.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_doctor_restricted_on_patch_appointment(
    async_client: AsyncClient,
    reception_headers,
    skin_doctor_headers,
):
    # Reception creates patient and appointment
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Appointment Transition Patient",
            "dateOfBirth": "1990-01-01",
            "gender": "Female",
            "phone": "9123456789",
            "address": "Pune",
            "department": "skin",
        },
    )
    pat_id = p_res.json()["id"]

    apt_res = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "startsAt": "2026-11-05T14:00:00Z",
            "visitType": "New",
        },
    )
    apt_id = apt_res.json()["id"]

    # 1. Doctor cannot cancel appointment (403 FORBIDDEN - reception only)
    res_cancel = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=skin_doctor_headers,
        json={"status": "Cancelled"},
    )
    assert res_cancel.status_code == 403
    assert res_cancel.json()["code"] == "FORBIDDEN"

    # 2. Doctor cannot reschedule appointment (403 FORBIDDEN - reception only)
    res_resched = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=skin_doctor_headers,
        json={"startsAt": "2026-11-06T14:00:00Z"},
    )
    assert res_resched.status_code == 403
    assert res_resched.json()["code"] == "FORBIDDEN"

    # Reception checks in the appointment (Scheduled -> Checked-in)
    res_checkin = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=reception_headers,
        json={"status": "Checked-in"},
    )
    assert res_checkin.status_code == 200

    # 3. Doctor CAN transition own appointment to 'In progress'
    res_progress = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=skin_doctor_headers,
        json={"status": "In progress"},
    )
    assert res_progress.status_code == 200
    assert res_progress.json()["status"] == "In progress"

    # 4. Doctor CAN transition own appointment to 'Completed'
    res_done = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=skin_doctor_headers,
        json={"status": "Completed"},
    )
    assert res_done.status_code == 200
    assert res_done.json()["status"] == "Completed"


@pytest.mark.asyncio
async def test_clinician_list_scoping_never_returns_other_department(
    async_client: AsyncClient,
    reception_headers,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    # Register skin patient
    p_skin = (await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={"fullName": "Skin Scoped Pat", "dateOfBirth": "1990-01-01", "gender": "Male", "phone": "9111111111", "address": "Skin", "department": "skin"},
    )).json()
    q_skin = (await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={"patientId": p_skin["id"], "department": "skin", "doctor": "Dr. Sangamitra", "visitType": "New"},
    )).json()

    # Register ortho patient
    p_ortho = (await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={"fullName": "Ortho Scoped Pat", "dateOfBirth": "1990-01-01", "gender": "Female", "phone": "9222222222", "address": "Ortho", "department": "orthopaedics"},
    )).json()
    q_ortho = (await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={"patientId": p_ortho["id"], "department": "orthopaedics", "doctor": "Dr. Sundarprakash", "visitType": "New"},
    )).json()

    # Skin doctor lists queue -> must NEVER see Ortho queue entry
    skin_q_list = (await async_client.get("/api/v1/queue", headers=skin_doctor_headers)).json()["items"]
    assert any(q["id"] == q_skin["id"] for q in skin_q_list)
    assert not any(q["id"] == q_ortho["id"] for q in skin_q_list)

    # Ortho doctor lists queue -> must NEVER see Skin queue entry
    ortho_q_list = (await async_client.get("/api/v1/queue", headers=ortho_doctor_headers)).json()["items"]
    assert any(q["id"] == q_ortho["id"] for q in ortho_q_list)
    assert not any(q["id"] == q_skin["id"] for q in ortho_q_list)

    # Invoices list scoping
    skin_inv_list = (await async_client.get("/api/v1/invoices", headers=skin_doctor_headers)).json()["items"]
    assert all(inv["department"] == "skin" for inv in skin_inv_list)

    ortho_inv_list = (await async_client.get("/api/v1/invoices", headers=ortho_doctor_headers)).json()["items"]
    assert all(inv["department"] == "orthopaedics" for inv in ortho_inv_list)


@pytest.fixture
async def pg_async_client():
    from httpx import ASGITransport
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.session import get_db
    from app.main import app
    pg_engine = create_async_engine(settings.DATABASE_URL, pool_size=10, max_overflow=20)
    PgSession = async_sessionmaker(pg_engine, expire_on_commit=False)

    async def override_get_db():
        async with PgSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()
    await pg_engine.dispose()


@pytest.fixture
async def pg_reception_headers(seed_test_users):
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.security import create_access_token
    from app.modules.users.models import User
    pg_engine = create_async_engine(settings.DATABASE_URL)
    PgSession = async_sessionmaker(pg_engine, expire_on_commit=False)
    async with PgSession() as sess:
        u = (await sess.execute(select(User).where(User.role == "reception"))).scalars().first()
        user_id = str(u.id) if u else "823bfeea-10ef-4197-b868-c5afd06c7e11"
    await pg_engine.dispose()
    token = create_access_token({"sub": user_id, "role": "reception"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_parallel_payments_never_exceed_invoice_balance(
    pg_async_client: AsyncClient,
    pg_reception_headers,
    monkeypatch,
):
    import uuid
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def noop_lock(*args, **kwargs):
        yield

    # Prove PostgreSQL row lock alone prevents overpayment with in-process lock completely disabled
    monkeypatch.setattr("app.modules.billing.router.get_invoice_lock", lambda *args, **kwargs: noop_lock())

    import random
    uid = uuid.uuid4().hex[:6]
    phone_pay = f"98{random.randint(10000000, 99999999)}"
    # Create patient & queue entry -> fee is ₹700 (balance ₹700)
    res_pat = await pg_async_client.post(
        "/api/v1/patients",
        headers=pg_reception_headers,
        json={"fullName": f"Parallel Pay Pat {uid}", "dateOfBirth": "1990-01-01", "gender": "Male", "phone": phone_pay, "address": "Pune", "department": "skin"},
    )
    assert res_pat.status_code == 201
    p = res_pat.json()

    await pg_async_client.post(
        "/api/v1/queue",
        headers=pg_reception_headers,
        json={"patientId": p["id"], "department": "skin", "doctor": "Dr. Sangamitra", "visitType": "New"},
    )
    inv = (await pg_async_client.get(f"/api/v1/invoices?patientId={p['id']}", headers=pg_reception_headers)).json()["items"][0]
    inv_id = inv["id"]
    assert inv["balance"] == 700.0

    # Fire 5 parallel payment requests of ₹200 each (sum = ₹1000, which exceeds ₹700 balance)
    tasks = [
        pg_async_client.post(
            f"/api/v1/invoices/{inv_id}/payments",
            headers={**pg_reception_headers, "Idempotency-Key": f"par-pay-pg-{uid}-{i}"},
            json={"amount": 200.0, "method": "Cash"},
        )
        for i in range(5)
    ]
    results = await asyncio.gather(*tasks)
    statuses = [r.status_code for r in results]

    # Exactly 3 payments of ₹200 can succeed (₹600 paid, balance ₹100), remaining 2 must be rejected with 422
    success_count = statuses.count(201)
    rejected_count = statuses.count(422)

    assert success_count == 3
    assert rejected_count == 2

    # Verify invoice total paid is ₹600, balance is ₹100, NEVER overpaid!
    final_inv = (await pg_async_client.get(f"/api/v1/invoices?patientId={p['id']}", headers=pg_reception_headers)).json()["items"][0]
    assert final_inv["paid"] == 600.0
    assert final_inv["balance"] == 100.0


@pytest.mark.asyncio
async def test_parallel_refunds_never_exceed_paid_amount(
    pg_async_client: AsyncClient,
    pg_reception_headers,
    monkeypatch,
):
    import random
    import uuid
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def noop_lock(*args, **kwargs):
        yield

    # Prove PostgreSQL row lock alone prevents over-refund with in-process lock completely disabled
    monkeypatch.setattr("app.modules.billing.router.get_invoice_lock", lambda *args, **kwargs: noop_lock())

    uid = uuid.uuid4().hex[:6]
    phone_ref = f"97{random.randint(10000000, 99999999)}"
    # Create patient & queue entry -> fee ₹700
    res_pat = await pg_async_client.post(
        "/api/v1/patients",
        headers=pg_reception_headers,
        json={"fullName": f"Parallel Ref Pat {uid}", "dateOfBirth": "1990-01-01", "gender": "Female", "phone": phone_ref, "address": "Pune", "department": "skin"},
    )
    assert res_pat.status_code == 201
    p = res_pat.json()

    await pg_async_client.post(
        "/api/v1/queue",
        headers=pg_reception_headers,
        json={"patientId": p["id"], "department": "skin", "doctor": "Dr. Sangamitra", "visitType": "New"},
    )
    inv = (await pg_async_client.get(f"/api/v1/invoices?patientId={p['id']}", headers=pg_reception_headers)).json()["items"][0]
    inv_id = inv["id"]

    # Record single payment of ₹500
    await pg_async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=pg_reception_headers,
        json={"amount": 500.0, "method": "Cash"},
    )

    # Fire two parallel refunds of ₹350 each (sum = ₹700, which exceeds ₹500 paid amount)
    task1 = pg_async_client.post(f"/api/v1/invoices/{inv_id}/refunds", headers=pg_reception_headers, json={"amount": 350.0, "reason": "Refund A"})
    task2 = pg_async_client.post(f"/api/v1/invoices/{inv_id}/refunds", headers=pg_reception_headers, json={"amount": 350.0, "reason": "Refund B"})

    res1, res2 = await asyncio.gather(task1, task2)
    statuses = {res1.status_code, res2.status_code}

    # Exactly one succeeds (201) and one is rejected (422 REFUND_EXCEEDS_PAID)
    assert 201 in statuses
    assert 422 in statuses

    # Verify total refunded is ₹350, paid remains ₹500
    final_inv = (await pg_async_client.get(f"/api/v1/invoices?patientId={p['id']}", headers=pg_reception_headers)).json()["items"][0]
    total_refunded = sum(r["amount"] for r in final_inv["refunds"])
    assert total_refunded == 350.0


@pytest.mark.asyncio
async def test_patch_followup_reminder_action_default_provider_stays_queued(
    async_client: AsyncClient,
    reception_headers,
    skin_doctor_headers,
):
    # Create patient & follow-up
    p = (await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={"fullName": "Followup Rem Pat", "dateOfBirth": "1990-01-01", "gender": "Male", "phone": "9555555555", "address": "Pune", "department": "skin"},
    )).json()

    fu = (await async_client.post(
        "/api/v1/follow-ups",
        headers=skin_doctor_headers,
        json={"patientId": p["id"], "department": "skin", "doctor": "Dr. Sangamitra", "date": "2026-11-20"},
    )).json()
    fu_id = fu["id"]
    assert fu["reminderStatus"] == "Not sent"

    # Action: send with default NoopProvider (which does not confirm delivery)
    res_send = await async_client.patch(
        f"/api/v1/follow-ups/{fu_id}",
        headers=reception_headers,
        json={"reminderAction": "send"},
    )
    assert res_send.status_code == 200
    # Status MUST remain 'Queued' and NEVER become 'Sent' without provider confirmation!
    assert res_send.json()["reminderStatus"] == "Queued"


@pytest.mark.asyncio
async def test_ready_endpoint_returns_503_when_database_unreachable(async_client: AsyncClient):
    import app.main
    with patch.object(app.main.engine.__class__, "connect", side_effect=Exception("Database unreachable")):
        res = await async_client.get("/ready")
        assert res.status_code == 503
        assert res.json() == {"status": "not_ready", "database": "unreachable"}


@pytest.mark.asyncio
async def test_invalid_queue_transition_returns_409(
    async_client: AsyncClient,
    reception_headers,
):
    p = (await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={"fullName": "Queue Trans Pat", "dateOfBirth": "1990-01-01", "gender": "Male", "phone": "9666666666", "address": "Pune", "department": "skin"},
    )).json()
    q = (await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={"patientId": p["id"], "department": "skin", "doctor": "Dr. Sangamitra", "visitType": "New"},
    )).json()
    q_id = q["id"]
    assert q["status"] == "Waiting"

    # Waiting -> Completed is not allowed directly (must be In-Consultation first)
    res_bad = await async_client.patch(
        f"/api/v1/queue/{q_id}",
        headers=reception_headers,
        json={"status": "Completed"},
    )
    assert res_bad.status_code == 409
    assert res_bad.json()["code"] == "INVALID_TRANSITION"

