import re

import pytest
from httpx import AsyncClient

from app.core.config import settings

CAMEL_CASE_REGEX = re.compile(r"^[a-z][a-zA-Z0-9]*$")


def assert_camel_case_keys(data: dict | list, path: str = ""):
    """Recursively assert that all JSON dictionary keys follow camelCase naming convention."""
    if isinstance(data, dict):
        for k, v in data.items():
            current_path = f"{path}.{k}" if path else k
            assert CAMEL_CASE_REGEX.match(k), f"Key '{k}' at path '{current_path}' is not camelCase!"
            assert_camel_case_keys(v, current_path)
    elif isinstance(data, list):
        for idx, item in enumerate(data):
            assert_camel_case_keys(item, f"{path}[{idx}]")


@pytest.fixture
async def auth_headers(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    assert res.status_code == 200
    token = res.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_auth_contract(async_client: AsyncClient, seed_test_users):
    res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    assert res.status_code == 200
    data = res.json()
    assert_camel_case_keys(data)

    assert isinstance(data["accessToken"], str)
    assert isinstance(data["tokenType"], str)
    user = data["user"]
    assert set(user.keys()) == {"id", "email", "displayName", "role", "department", "mustChangePassword"}
    assert user["role"] in {"reception", "skin", "orthopaedics"}


@pytest.mark.asyncio
async def test_patients_contract(async_client: AsyncClient, auth_headers):
    # Create patient
    create_res = await async_client.post(
        "/api/v1/patients",
        headers=auth_headers,
        json={
            "fullName": "Meera Patel",
            "dateOfBirth": "1994-06-25",
            "gender": "Female",
            "phone": "9876501234",
            "address": "12 Residency Road",
            "department": "skin",
        },
    )
    assert create_res.status_code == 201
    patient = create_res.json()
    assert_camel_case_keys(patient)

    # Required contract keys from src/types/domain.ts
    expected_keys = {
        "id", "fullName", "dateOfBirth", "gender", "phone", "email",
        "address", "emergencyContact", "departments", "registeredAt", "latestVisitAt"
    }
    assert set(patient.keys()) == expected_keys
    assert patient["gender"] in {"Female", "Male", "Other", "Prefer not to say"}
    assert all(d in {"skin", "orthopaedics"} for d in patient["departments"])

    # List patients paginated response contract
    list_res = await async_client.get("/api/v1/patients", headers=auth_headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert_camel_case_keys(list_data)
    assert set(list_data.keys()) == {"items", "page", "pageSize", "total"}
    assert isinstance(list_data["page"], int)
    assert isinstance(list_data["pageSize"], int)
    assert isinstance(list_data["total"], int)
    assert isinstance(list_data["items"], list)


@pytest.mark.asyncio
async def test_appointments_contract(async_client: AsyncClient, auth_headers):
    # Setup patient
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=auth_headers,
        json={
            "fullName": "Rohan Gupta",
            "dateOfBirth": "1991-04-12",
            "gender": "Male",
            "phone": "9765432109",
            "address": "88 MG Road",
            "department": "orthopaedics",
        },
    )
    pat_id = p_res.json()["id"]

    # Create appointment
    apt_res = await async_client.post(
        "/api/v1/appointments",
        headers=auth_headers,
        json={
            "patientId": pat_id,
            "department": "orthopaedics",
            "doctor": "Dr. Sundarprakash",
            "startsAt": "2026-10-25T11:00:00",
            "visitType": "Follow-up",
            "note": "Check healing",
        },
    )
    assert apt_res.status_code == 201
    apt = apt_res.json()
    assert_camel_case_keys(apt)

    expected_keys = {"id", "patientId", "department", "doctor", "startsAt", "visitType", "note", "status"}
    assert set(apt.keys()) == expected_keys
    assert apt["status"] in {"Scheduled", "Checked-in", "In progress", "Completed", "Cancelled", "No-show"}
    assert apt["visitType"] in {"New", "Follow-up", "Walk-in"}
    assert apt["department"] in {"skin", "orthopaedics"}


@pytest.mark.asyncio
async def test_queue_contract(async_client: AsyncClient, auth_headers):
    # Setup patient
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=auth_headers,
        json={
            "fullName": "Deepa Joshi",
            "dateOfBirth": "1996-09-01",
            "gender": "Female",
            "phone": "9823456781",
            "address": "33 Jayanagar",
            "department": "skin",
        },
    )
    pat_id = p_res.json()["id"]

    # Check in
    q_res = await async_client.post(
        "/api/v1/queue",
        headers=auth_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "visitType": "New",
            "note": "Skin examination",
            "vitals": {
                "bloodPressure": "118/76 mmHg",
                "pulse": "70",
                "temperature": "36.7",
                "height": "162",
                "weight": "55",
                "oxygenSaturation": "99",
            },
        },
    )
    assert q_res.status_code == 201
    q = q_res.json()
    assert_camel_case_keys(q)

    expected_keys = {
        "id", "token", "patientId", "visitId", "department", "doctor",
        "arrivalAt", "status", "paymentStatus", "visitType", "note", "vitals"
    }
    assert set(q.keys()) == expected_keys
    assert q["status"] in {"Waiting", "Consulting", "Completed"}
    assert q["paymentStatus"] in {"Paid", "Partial", "Due"}
    assert q["visitType"] in {"New", "Follow-up", "Walk-in"}

    vitals = q["vitals"]
    assert set(vitals.keys()) == {"bloodPressure", "pulse", "temperature", "height", "weight", "oxygenSaturation"}
