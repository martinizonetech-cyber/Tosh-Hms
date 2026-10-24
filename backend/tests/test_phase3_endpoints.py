import asyncio

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.tokens import allocate_daily_token


@pytest.fixture
async def reception_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    token = res.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def skin_doctor_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "skin@gmail.com", "password": settings.SKIN_INITIAL_PASSWORD},
    )
    token = res.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def ortho_doctor_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "ortho@gmail.com", "password": settings.ORTHO_INITIAL_PASSWORD},
    )
    token = res.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_patient_registration_and_validation(async_client: AsyncClient, reception_headers):
    # 422 on invalid phone (contains letters or too short)
    res_invalid_phone = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Test Patient",
            "dateOfBirth": "1990-01-01",
            "gender": "Female",
            "phone": "12345",  # Under 7 digits
            "address": "123 Clinic Road",
            "department": "skin",
        },
    )
    assert res_invalid_phone.status_code == 422

    # 422 on short name
    res_short_name = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "A",
            "dateOfBirth": "1990-01-01",
            "gender": "Female",
            "phone": "9876543210",
            "address": "123 Clinic Road",
            "department": "skin",
        },
    )
    assert res_short_name.status_code == 422

    # Valid registration
    res_valid = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Aarav Sharma",
            "dateOfBirth": "1995-05-15",
            "gender": "Male",
            "phone": "9876543210",
            "email": "aarav.sharma@example.com",
            "address": "42MG Road, Bangalore",
            "emergencyContact": "9876543211",
            "department": "skin",
        },
    )
    assert res_valid.status_code == 201
    patient = res_valid.json()
    assert patient["id"].startswith("PT-")
    assert patient["fullName"] == "Aarav Sharma"
    assert patient["phone"] == "9876543210"
    assert "skin" in patient["departments"]

    # GET /patients/{id}
    res_get = await async_client.get(f"/api/v1/patients/{patient['id']}", headers=reception_headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == patient["id"]

    # 404 on nonexistent patient
    res_not_found = await async_client.get("/api/v1/patients/PT-99999", headers=reception_headers)
    assert res_not_found.status_code == 404


@pytest.mark.asyncio
async def test_patient_department_isolation(async_client: AsyncClient, reception_headers, skin_doctor_headers, ortho_doctor_headers):
    # Register an ortho patient
    res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Kavita Rao",
            "dateOfBirth": "1988-08-20",
            "gender": "Female",
            "phone": "9123456789",
            "address": "77 Brigade Road",
            "department": "orthopaedics",
        },
    )
    assert res.status_code == 201
    assert res.json()["id"].startswith("PT-")

    # Ortho doctor can query list and see them
    res_ortho = await async_client.get("/api/v1/patients", headers=ortho_doctor_headers)
    assert res_ortho.status_code == 200

    # Skin doctor forbidden from requesting orthopaedics list
    res_skin_forbidden = await async_client.get("/api/v1/patients?department=orthopaedics", headers=skin_doctor_headers)
    assert res_skin_forbidden.status_code == 403


@pytest.mark.asyncio
async def test_atomic_queue_checkin(async_client: AsyncClient, reception_headers):
    # Register patient first
    pat_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Priya Nair",
            "dateOfBirth": "1992-03-10",
            "gender": "Female",
            "phone": "9811223344",
            "address": "15 Indiranagar",
            "department": "skin",
        },
    )
    pat_id = pat_res.json()["id"]

    # POST /queue check-in
    res_checkin = await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "visitType": "New",
            "note": "First consultation for eczema",
            "vitals": {
                "bloodPressure": "120/80 mmHg",
                "pulse": "72 bpm",
                "temperature": "36.6 C",
                "height": "165 cm",
                "weight": "60 kg",
                "oxygenSaturation": "99%",
            },
        },
    )
    assert res_checkin.status_code == 201
    queue_entry = res_checkin.json()

    assert queue_entry["id"].startswith("Q-")
    assert queue_entry["token"].startswith("S-")
    assert queue_entry["status"] == "Waiting"
    assert queue_entry["vitals"]["bloodPressure"] == "120/80 mmHg"

    visit_id = queue_entry["visitId"]
    assert visit_id.startswith("VIS-")

    # Verify visit details via GET /visits/{id}
    res_visit = await async_client.get(f"/api/v1/visits/{visit_id}", headers=reception_headers)
    assert res_visit.status_code == 200
    visit_data = res_visit.json()
    assert visit_data["id"] == visit_id
    assert visit_data["consultation"]["status"] == "Draft"
    assert visit_data["vitals"]["bloodPressure"] == "120/80 mmHg"


@pytest.mark.asyncio
async def test_appointment_state_machine_and_queue_sync(async_client: AsyncClient, reception_headers):
    # Register patient
    pat_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Vikram Sethi",
            "dateOfBirth": "1985-11-22",
            "gender": "Male",
            "phone": "9988776655",
            "address": "90 Whitefield",
            "department": "orthopaedics",
        },
    )
    pat_id = pat_res.json()["id"]

    # Create Appointment
    apt_res = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "orthopaedics",
            "doctor": "Dr. Sundarprakash",
            "startsAt": "2026-10-24T10:00:00",
            "visitType": "New",
            "note": "Knee pain evaluation",
        },
    )
    assert apt_res.status_code == 201
    apt = apt_res.json()
    apt_id = apt["id"]
    assert apt["status"] == "Scheduled"

    # Invalid transition: Scheduled -> Completed must return 409
    res_bad = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=reception_headers,
        json={"status": "Completed"},
    )
    assert res_bad.status_code == 409
    assert res_bad.json()["code"] == "INVALID_TRANSITION"

    # Valid transition: Scheduled -> Checked-in triggers atomic check-in
    res_checkin = await async_client.patch(
        f"/api/v1/appointments/{apt_id}",
        headers=reception_headers,
        json={"status": "Checked-in"},
    )
    assert res_checkin.status_code == 200
    assert res_checkin.json()["status"] == "Checked-in"

    # Verify queue entry was created with Ortho token (O-###)
    q_res = await async_client.get("/api/v1/queue?department=orthopaedics", headers=reception_headers)
    assert q_res.status_code == 200
    q_items = q_res.json()["items"]
    matched_q = next(item for item in q_items if item["patientId"] == pat_id)
    assert matched_q["token"].startswith("O-")
    assert matched_q["status"] == "Waiting"

    # Transition queue to Consulting -> syncs appointment to In progress
    res_consulting = await async_client.patch(
        f"/api/v1/queue/{matched_q['id']}",
        headers=reception_headers,
        json={"status": "Consulting"},
    )
    assert res_consulting.status_code == 200
    assert res_consulting.json()["status"] == "Consulting"

    # Verify appointment status synced to In progress
    apt_check = await async_client.get("/api/v1/appointments?department=orthopaedics", headers=reception_headers)
    updated_apt = next(a for a in apt_check.json()["items"] if a["id"] == apt_id)
    assert updated_apt["status"] == "In progress"

    # Transition queue to Completed -> syncs appointment to Completed
    res_done = await async_client.patch(
        f"/api/v1/queue/{matched_q['id']}",
        headers=reception_headers,
        json={"status": "Completed"},
    )
    assert res_done.status_code == 200
    assert res_done.json()["status"] == "Completed"


@pytest.mark.asyncio
async def test_concurrent_token_allocation():
    """Assert parallel token requests for the same department generate unique sequential numbers."""
    from conftest import TestingSessionLocal

    async def get_tok():
        async with TestingSessionLocal() as s:
            tok = await allocate_daily_token(s, "skin")
            await s.commit()
            return tok

    tasks = [get_tok() for _ in range(10)]
    tokens = await asyncio.gather(*tasks)
    assert len(tokens) == 10
    # Every token should be unique
    assert len(set(tokens)) == 10
    for tok in tokens:
        assert tok.startswith("S-")
