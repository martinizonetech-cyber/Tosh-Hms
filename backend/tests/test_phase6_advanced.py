from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services.scheduler import get_today_ist


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
async def test_follow_ups_lifecycle_and_computed_overdue(async_client: AsyncClient, reception_headers):
    # Register patient
    pat_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Followup Test Patient",
            "dateOfBirth": "1994-08-10",
            "gender": "Female",
            "phone": "9812345670",
            "address": "44 Followup Road",
            "department": "skin",
        },
    )
    pat_id = pat_res.json()["id"]

    today_str = get_today_ist()
    past_date = (date.fromisoformat(today_str) - timedelta(days=3)).strftime("%Y-%m-%d")
    future_date = (date.fromisoformat(today_str) + timedelta(days=5)).strftime("%Y-%m-%d")

    # 1. Create a follow-up in the past -> Computed status should be 'Overdue'
    res_past = await async_client.post(
        "/api/v1/follow-ups",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "date": past_date,
            "note": "Check wound healing",
        },
    )
    assert res_past.status_code == 201
    fu_past = res_past.json()
    assert fu_past["status"] == "Overdue"  # Computed Overdue dynamically!
    assert fu_past["reminderStatus"] == "Not sent"

    # 2. Create a follow-up in the future -> Status is 'Upcoming'
    res_fut = await async_client.post(
        "/api/v1/follow-ups",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "date": future_date,
            "note": "Routine check",
        },
    )
    assert res_fut.status_code == 201
    fu_fut = res_fut.json()
    assert fu_fut["status"] == "Upcoming"
    fut_fu_id = fu_fut["id"]

    # 3. Query follow-ups with patientId filter
    list_res = await async_client.get(f"/api/v1/follow-ups?patientId={pat_id}", headers=reception_headers)
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 2

    # 4. Patient sub-resource GET /patients/{id}/follow-ups
    sub_res = await async_client.get(f"/api/v1/patients/{pat_id}/follow-ups", headers=reception_headers)
    assert sub_res.status_code == 200
    assert len(sub_res.json()["items"]) == 2

    # 5. Trigger reminder action 'queue'
    patch_q = await async_client.patch(
        f"/api/v1/follow-ups/{fut_fu_id}",
        headers=reception_headers,
        json={"reminderAction": "queue"},
    )
    assert patch_q.status_code == 200
    assert patch_q.json()["reminderStatus"] == "Queued"

    # 6. Trigger reminder action 'send' with default provider -> stays Queued
    patch_send = await async_client.patch(
        f"/api/v1/follow-ups/{fut_fu_id}",
        headers=reception_headers,
        json={"reminderAction": "send"},
    )
    assert patch_send.status_code == 200
    assert patch_send.json()["reminderStatus"] == "Queued"

    # 7. With confirmed provider -> becomes Sent
    mock_prov = AsyncMock()
    mock_prov.send_reminder.return_value = (True, "prov-msg-confirmed")
    with patch("app.modules.followups.router.get_notification_provider", return_value=mock_prov):
        patch_send2 = await async_client.patch(
            f"/api/v1/follow-ups/{fut_fu_id}",
            headers=reception_headers,
            json={"reminderAction": "send"},
        )
        assert patch_send2.status_code == 200
        assert patch_send2.json()["reminderStatus"] == "Sent"


@pytest.mark.asyncio
async def test_consultation_save_creates_linked_follow_up(
    async_client: AsyncClient,
    reception_headers,
    skin_doctor_headers,
):
    # Register and check in
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Consult Follow Patient",
            "dateOfBirth": "1993-01-01",
            "gender": "Male",
            "phone": "9812345671",
            "address": "100 Clinic Drive",
            "department": "skin",
        },
    )
    pat_id = p_res.json()["id"]

    q_res = await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={"patientId": pat_id, "department": "skin", "doctor": "Dr. Sangamitra"},
    )
    visit_id = q_res.json()["visitId"]

    # Save consultation with followUpDate
    fu_date = (date.today() + timedelta(days=14)).strftime("%Y-%m-%d")
    save_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json={"followUpDate": fu_date, "diagnosis": "Tinea Corporis"},
    )
    assert save_res.status_code == 200

    # Verify linked follow-up automatically exists
    fu_list = await async_client.get(f"/api/v1/follow-ups?patientId={pat_id}", headers=reception_headers)
    assert fu_list.status_code == 200
    items = fu_list.json()["items"]
    assert len(items) == 1
    assert items[0]["date"] == fu_date
    assert items[0]["department"] == "skin"


@pytest.mark.asyncio
async def test_reports_and_dashboard_summary(
    async_client: AsyncClient,
    reception_headers,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    today = get_today_ist()
    from_date = (date.fromisoformat(today) - timedelta(days=7)).strftime("%Y-%m-%d")

    # 1. GET /reports/summary
    rep_res = await async_client.get(
        f"/api/v1/reports/summary?from={from_date}&to={today}",
        headers=reception_headers,
    )
    assert rep_res.status_code == 200
    rep = rep_res.json()

    # Assert exact ReportSummary shape per contracts.ts
    assert "from" in rep
    assert "to" in rep
    assert "registrations" in rep
    assert "appointments" in rep
    assert "completedVisits" in rep
    assert "walkIns" in rep
    assert "collections" in rep
    assert "outstandingBalance" in rep
    assert "followUpCompletion" in rep
    assert "paymentMethods" in rep
    assert "daily" in rep
    assert "departmentActivity" in rep
    assert isinstance(rep["daily"], list)
    assert len(rep["daily"]) == 8  # 7 days ago to today inclusive

    # 2. Skin doctor accessing ortho report -> 403 Forbidden
    cross_rep = await async_client.get(
        f"/api/v1/reports/summary?from={from_date}&to={today}&department=orthopaedics",
        headers=skin_doctor_headers,
    )
    assert cross_rep.status_code == 403

    # 3. GET /dashboard/summary
    dash_res = await async_client.get("/api/v1/dashboard/summary", headers=reception_headers)
    assert dash_res.status_code == 200
    dash = dash_res.json()
    assert "waitingCount" in dash
    assert "consultingCount" in dash
    assert "completedCount" in dash
    assert "appointmentsCount" in dash
    assert "collections" in dash
    assert "followUpsCount" in dash


@pytest.mark.asyncio
async def test_body_region_templates_endpoints_and_rbac(
    async_client: AsyncClient,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    # 1. Read body region templates
    res = await async_client.get("/api/v1/templates/body-regions", headers=ortho_doctor_headers)
    assert res.status_code == 200
    templates = res.json()
    assert len(templates) >= 2  # Knee, Shoulder, etc.
    knee = next((t for t in templates if t["region"] == "Knee"), None)
    assert knee is not None
    assert len(knee["fields"]) > 0
    assert len(knee["medications"]) > 0

    # 2. Skin doctor cannot update templates (403 Forbidden)
    bad_edit = await async_client.put(
        "/api/v1/templates/body-regions",
        headers=skin_doctor_headers,
        json=[knee],
    )
    assert bad_edit.status_code == 403

    # 3. Orthopaedics doctor can update templates
    updated_knee = {
        **knee,
        "fields": [*knee["fields"], "Quadriceps angle (Q-angle)"],
    }
    good_edit = await async_client.put(
        "/api/v1/templates/body-regions",
        headers=ortho_doctor_headers,
        json=[updated_knee],
    )
    assert good_edit.status_code == 200
    updated_res = next((t for t in good_edit.json() if t["region"] == "Knee"), None)
    assert "Quadriceps angle (Q-angle)" in updated_res["fields"]
