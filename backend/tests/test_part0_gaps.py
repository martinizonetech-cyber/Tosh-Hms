from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.config import settings


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
async def test_patient_duplicate_check_and_force_override(async_client: AsyncClient, reception_headers):
    # 1. Register a patient
    payload = {
        "fullName": "Vikram Sethi",
        "dateOfBirth": "1988-03-21",
        "gender": "Male",
        "phone": "9887766554",
        "address": "14 Koramangala",
        "department": "skin",
    }
    res1 = await async_client.post("/api/v1/patients", headers=reception_headers, json=payload)
    assert res1.status_code == 201
    pat1_id = res1.json()["id"]

    # 2. Try to register same name and phone without force -> 409 POSSIBLE_DUPLICATE
    res_dup = await async_client.post("/api/v1/patients", headers=reception_headers, json=payload)
    assert res_dup.status_code == 409
    err = res_dup.json()
    assert err["code"] == "POSSIBLE_DUPLICATE"
    assert "details" in err
    assert err["details"]["existingPatientId"] == pat1_id
    assert err["details"]["phone"] == "9887766554"

    # 3. Override with force=true -> 201 Created
    res_force = await async_client.post("/api/v1/patients?force=true", headers=reception_headers, json=payload)
    assert res_force.status_code == 201
    assert res_force.json()["id"] != pat1_id


@pytest.mark.asyncio
async def test_appointment_booking_rules(async_client: AsyncClient, reception_headers):
    # Register patient
    pat_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Priya Nair",
            "dateOfBirth": "1992-11-10",
            "gender": "Female",
            "phone": "9123456789",
            "address": "55 Indiranagar",
            "department": "skin",
        },
    )
    assert pat_res.status_code == 201
    pat_id = pat_res.json()["id"]

    # 1. Reject past startsAt (e.g. yesterday)
    past_time = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    res_past = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "startsAt": past_time,
            "visitType": "New",
        },
    )
    assert res_past.status_code == 422
    assert res_past.json()["code"] == "PAST_APPOINTMENT_TIME"

    # 2. Reject doctor from wrong department (Dr. Sundarprakash is orthopaedics, scheduling for skin)
    future_time = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0)
    res_wrong_dept = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sundarprakash",
            "startsAt": future_time.isoformat(),
            "visitType": "New",
        },
    )
    assert res_wrong_dept.status_code == 422
    assert res_wrong_dept.json()["code"] == "INVALID_DOCTOR_DEPARTMENT"

    # 3. Successfully book valid appointment
    res_valid = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "startsAt": future_time.isoformat(),
            "visitType": "New",
            "note": "Initial consultation",
        },
    )
    assert res_valid.status_code == 201
    apt_id = res_valid.json()["id"]
    assert apt_id.startswith("APT-")

    # 4. Reject double-booking (same doctor + startsAt) -> 409 CONFLICT
    # Register another patient
    pat2_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Anil Verma",
            "dateOfBirth": "1985-07-04",
            "gender": "Male",
            "phone": "9112233445",
            "address": "10 Malleshwaram",
            "department": "skin",
        },
    )
    pat2_id = pat2_res.json()["id"]

    res_double_book = await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={
            "patientId": pat2_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "startsAt": future_time.isoformat(),
            "visitType": "New",
        },
    )
    assert res_double_book.status_code == 409
    assert res_double_book.json()["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_patient_id_filters_and_subresource(async_client: AsyncClient, reception_headers):
    # Setup patient A
    pat_a = (
        await async_client.post(
            "/api/v1/patients",
            headers=reception_headers,
            json={
                "fullName": "Patient Alpha",
                "dateOfBirth": "1990-01-01",
                "gender": "Male",
                "phone": "9000000001",
                "address": "Street A",
                "department": "skin",
            },
        )
    ).json()["id"]

    # Setup patient B
    pat_b = (
        await async_client.post(
            "/api/v1/patients",
            headers=reception_headers,
            json={
                "fullName": "Patient Beta",
                "dateOfBirth": "1991-01-01",
                "gender": "Female",
                "phone": "9000000002",
                "address": "Street B",
                "department": "skin",
            },
        )
    ).json()["id"]

    # Book appointments for Alpha and Beta
    dt1 = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0).isoformat()
    dt2 = (datetime.now(UTC) + timedelta(days=4)).replace(microsecond=0).isoformat()

    await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={"patientId": pat_a, "department": "skin", "doctor": "Dr. Sangamitra", "startsAt": dt1},
    )
    await async_client.post(
        "/api/v1/appointments",
        headers=reception_headers,
        json={"patientId": pat_b, "department": "skin", "doctor": "Dr. Sangamitra", "startsAt": dt2},
    )

    # Filter GET /appointments?patientId=pat_a
    res_filter_a = await async_client.get(f"/api/v1/appointments?patientId={pat_a}", headers=reception_headers)
    assert res_filter_a.status_code == 200
    items_a = res_filter_a.json()["items"]
    assert len(items_a) == 1
    assert items_a[0]["patientId"] == pat_a

    # Test sub-resource GET /patients/{id}/appointments
    res_sub_a = await async_client.get(f"/api/v1/patients/{pat_a}/appointments", headers=reception_headers)
    assert res_sub_a.status_code == 200
    sub_items_a = res_sub_a.json()["items"]
    assert len(sub_items_a) == 1
    assert sub_items_a[0]["patientId"] == pat_a

    # Check-in Alpha to queue
    q_res = await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={
            "patientId": pat_a,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "vitals": {"bloodPressure": "120/80 mmHg", "pulse": "72"},
        },
    )
    assert q_res.status_code == 201
    q_entry = q_res.json()
    assert q_entry["paymentStatus"] == "Due"
    assert q_entry["vitals"]["bloodPressure"] == "120/80 mmHg"

    # Filter GET /queue?patientId=pat_a
    q_filter = await async_client.get(f"/api/v1/queue?patientId={pat_a}", headers=reception_headers)
    assert q_filter.status_code == 200
    q_items = q_filter.json()["items"]
    assert any(item["patientId"] == pat_a for item in q_items)
