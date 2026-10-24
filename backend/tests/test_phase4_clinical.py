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


@pytest.fixture
async def skin_visit(async_client: AsyncClient, reception_headers):
    # Register patient
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Clinical Test Patient",
            "dateOfBirth": "1992-05-10",
            "gender": "Female",
            "phone": "9988776611",
            "address": "12 Clinical Road",
            "department": "skin",
        },
    )
    assert p_res.status_code == 201
    pat_id = p_res.json()["id"]

    # Checkin to queue
    q_res = await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "visitType": "New",
            "vitals": {
                "bloodPressure": "115/75 mmHg",
                "pulse": "72",
                "temperature": "36.6",
                "height": "160",
                "weight": "54",
                "oxygenSaturation": "98",
            },
        },
    )
    assert q_res.status_code == 201
    q_data = q_res.json()
    return {"patientId": pat_id, "visitId": q_data["visitId"], "queueId": q_data["id"]}


@pytest.mark.asyncio
async def test_consultation_rbac_and_read(
    async_client: AsyncClient,
    skin_visit,
    reception_headers,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    visit_id = skin_visit["visitId"]

    # Reception can read consultation
    rec_res = await async_client.get(f"/api/v1/visits/{visit_id}/consultation", headers=reception_headers)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["id"] == visit_id
    assert rec_data["vitals"]["bloodPressure"] == "115/75 mmHg"

    # Skin doctor can read consultation
    skin_res = await async_client.get(f"/api/v1/visits/{visit_id}/consultation", headers=skin_doctor_headers)
    assert skin_res.status_code == 200
    assert skin_res.json()["department"] == "skin"

    # Ortho doctor gets 403 Forbidden on skin consultation
    ortho_res = await async_client.get(f"/api/v1/visits/{visit_id}/consultation", headers=ortho_doctor_headers)
    assert ortho_res.status_code == 403
    assert ortho_res.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_consultation_edit_and_optimistic_concurrency(
    async_client: AsyncClient,
    skin_visit,
    reception_headers,
    skin_doctor_headers,
):
    visit_id = skin_visit["visitId"]

    # Reception cannot write consultation (403)
    rec_save = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=reception_headers,
        json={"symptoms": "Rash on left forearm"},
    )
    assert rec_save.status_code == 403

    # Initial get to fetch current version
    initial = (await async_client.get(f"/api/v1/visits/{visit_id}/consultation", headers=skin_doctor_headers)).json()
    version = initial["version"]

    # Doctor writes consultation successfully
    payload = {
        "visitId": visit_id,
        "patientId": skin_visit["patientId"],
        "department": "skin",
        "version": version,
        "symptoms": "Mild pruritus and erythematous macules",
        "diagnosis": "Contact Dermatitis",
        "treatmentPlan": "Topical corticosteroid application twice daily",
        "prescription": [
            {
                "medicineName": "Hydrocortisone Cream 1%",
                "strength": "1%",
                "dosage": "Apply thin layer",
                "route": "Topical",
                "frequency": "Twice daily",
                "duration": "7 days",
                "instructions": "After washing area",
            }
        ],
        "followUpDate": "2026-11-01",
        "painLocation": "Forearm",
        "side": "Left",
    }
    save_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json=payload,
    )
    assert save_res.status_code == 200
    saved = save_res.json()
    assert saved["symptoms"] == payload["symptoms"]
    assert len(saved["prescription"]) == 1
    assert saved["prescription"][0]["medicineName"] == "Hydrocortisone Cream 1%"
    assert saved["version"] == version + 1
    new_version = saved["version"]

    # Optimistic concurrency conflict check: passing old version -> 409 CONFLICT
    conflict_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json={**payload, "version": version},  # Stale version
    )
    assert conflict_res.status_code == 409
    assert conflict_res.json()["code"] == "CONFLICT"

    # Finalize consultation
    finalize_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json={"version": new_version, "status": "Finalized"},
    )
    assert finalize_res.status_code == 200
    finalized = finalize_res.json()
    assert finalized["status"] == "Finalized"
    locked_version = finalized["version"]

    # Modifying finalized consultation -> 409 VISIT_LOCKED
    edit_locked_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json={"version": locked_version, "symptoms": "New symptoms after finalize"},
    )
    assert edit_locked_res.status_code == 409
    assert edit_locked_res.json()["code"] == "VISIT_LOCKED"

    # Reopening consultation by doctor -> Allowed!
    reopen_res = await async_client.put(
        f"/api/v1/visits/{visit_id}/consultation",
        headers=skin_doctor_headers,
        json={"version": locked_version, "status": "Draft"},
    )
    assert reopen_res.status_code == 200
    assert reopen_res.json()["status"] == "Draft"


@pytest.mark.asyncio
async def test_vitals_patch(async_client: AsyncClient, skin_visit, reception_headers):
    visit_id = skin_visit["visitId"]
    res = await async_client.patch(
        f"/api/v1/visits/{visit_id}/vitals",
        headers=reception_headers,
        json={
            "bloodPressure": "122/82 mmHg",
            "pulse": "76",
            "temperature": "37.1",
        },
    )
    assert res.status_code == 200
    vitals = res.json()
    assert vitals["bloodPressure"] == "122/82 mmHg"
    assert vitals["pulse"] == "76"
    assert vitals["temperature"] == "37.1"


@pytest.mark.asyncio
async def test_documents_lifecycle_and_validation(
    async_client: AsyncClient,
    skin_visit,
    reception_headers,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    pat_id = skin_visit["patientId"]
    visit_id = skin_visit["visitId"]

    # 1. Reject invalid file type (e.g. text/plain or executable bytes) -> 422 FILE_REJECTED
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00"
    res_bad = await async_client.post(
        "/api/v1/documents",
        headers=reception_headers,
        data={"patientId": pat_id, "category": "General", "visitId": visit_id},
        files={"file": ("virus.exe", fake_exe, "application/octet-stream")},
    )
    assert res_bad.status_code == 422
    assert res_bad.json()["code"] == "FILE_REJECTED"

    # 2. Upload valid PDF document
    valid_pdf = b"%PDF-1.4\n%Fake PDF content for test\n%%EOF"
    res_pdf = await async_client.post(
        "/api/v1/documents",
        headers=reception_headers,
        data={"patientId": pat_id, "category": "Lab Report", "visitId": visit_id},
        files={"file": ("lab_report.pdf", valid_pdf, "application/pdf")},
    )
    assert res_pdf.status_code == 201
    doc = res_pdf.json()
    assert doc["id"].startswith("DOC-")
    assert doc["patientId"] == pat_id
    assert doc["category"] == "Lab Report"
    assert doc["mimeType"] == "application/pdf"
    assert doc["url"] is not None
    doc_id = doc["id"]

    # 3. List documents for patient
    list_res = await async_client.get(
        f"/api/v1/patients/{pat_id}/documents",
        headers=reception_headers,
    )
    assert list_res.status_code == 200
    docs_list = list_res.json()
    assert docs_list["total"] >= 1
    assert any(d["id"] == doc_id for d in docs_list["items"])

    # 4. Ortho doctor cannot list documents for skin patient (403)
    ortho_list = await async_client.get(
        f"/api/v1/patients/{pat_id}/documents",
        headers=ortho_doctor_headers,
    )
    assert ortho_list.status_code == 403

    # 5. Download document via signed URL
    signed_url = doc["url"]
    dl_res = await async_client.get(signed_url)
    assert dl_res.status_code == 200
    assert dl_res.content == valid_pdf

    # 5b. Tampered signature on signed URL -> 401 UNAUTHENTICATED
    tampered_url = signed_url.replace(signed_url.split("sig=")[1], "tampered_sig_hash")
    dl_tampered = await async_client.get(tampered_url)
    assert dl_tampered.status_code == 401
    assert dl_tampered.json()["code"] == "UNAUTHENTICATED"

    # 5c. Expired timestamp on signed URL -> 401 UNAUTHENTICATED
    expired_url = signed_url.split("expires=")[0] + "expires=1000000000&sig=" + signed_url.split("sig=")[1]
    dl_expired = await async_client.get(expired_url)
    assert dl_expired.status_code == 401
    assert dl_expired.json()["code"] == "UNAUTHENTICATED"

    # 6. Soft delete document
    del_res = await async_client.delete(f"/api/v1/documents/{doc_id}", headers=reception_headers)
    assert del_res.status_code == 200

    # 7. Confirm deleted document is excluded from listing
    list_after = await async_client.get(
        f"/api/v1/patients/{pat_id}/documents",
        headers=reception_headers,
    )
    assert not any(d["id"] == doc_id for d in list_after.json()["items"])
