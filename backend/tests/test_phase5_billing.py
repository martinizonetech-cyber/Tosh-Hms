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
async def skin_invoice(async_client: AsyncClient, reception_headers):
    # Register patient
    p_res = await async_client.post(
        "/api/v1/patients",
        headers=reception_headers,
        json={
            "fullName": "Billing Test Patient",
            "dateOfBirth": "1990-03-15",
            "gender": "Male",
            "phone": "9811223344",
            "address": "90 Billing Street",
            "department": "skin",
        },
    )
    pat_id = p_res.json()["id"]

    # Checkin to queue -> creates Visit and Invoice with default fee ₹700
    q_res = await async_client.post(
        "/api/v1/queue",
        headers=reception_headers,
        json={
            "patientId": pat_id,
            "department": "skin",
            "doctor": "Dr. Sangamitra",
            "visitType": "New",
        },
    )
    visit_id = q_res.json()["visitId"]

    # Fetch invoice
    inv_res = await async_client.get(f"/api/v1/invoices?patientId={pat_id}", headers=reception_headers)
    assert inv_res.status_code == 200
    items = inv_res.json()["items"]
    assert len(items) >= 1
    invoice = items[0]
    return {"patientId": pat_id, "visitId": visit_id, "invoice": invoice}


@pytest.mark.asyncio
async def test_billing_math_and_payments(async_client: AsyncClient, skin_invoice, reception_headers):
    invoice = skin_invoice["invoice"]
    inv_id = invoice["id"]

    # 1. Initial state: Fee ₹700, no charges, no payments, balance = ₹700, status = "Due"
    assert invoice["consultationFee"] == 700.0
    assert invoice["total"] == 700.0
    assert invoice["paid"] == 0.0
    assert invoice["balance"] == 700.0
    assert invoice["status"] == "Due"

    # 2. Overpayment rejection: Paying ₹800 on ₹700 balance -> 422 PAYMENT_EXCEEDS_BALANCE
    res_overpay = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=reception_headers,
        json={"amount": 800.0, "method": "Cash"},
    )
    assert res_overpay.status_code == 422
    assert res_overpay.json()["code"] == "PAYMENT_EXCEEDS_BALANCE"

    # 3. Partial payment of ₹300 -> balance becomes ₹400, status = "Partial"
    res_partial = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=reception_headers,
        json={"amount": 300.0, "method": "UPI", "transactionReference": "UPI-12345"},
    )
    assert res_partial.status_code == 201
    pay_data = res_partial.json()
    assert pay_data["amount"] == 300.0
    assert pay_data["method"] == "UPI"

    # Check invoice status
    inv_res = await async_client.get("/api/v1/invoices?status=Partial", headers=reception_headers)
    assert inv_res.status_code == 200
    updated_inv = next(i for i in inv_res.json()["items"] if i["id"] == inv_id)
    assert updated_inv["paid"] == 300.0
    assert updated_inv["balance"] == 400.0
    assert updated_inv["status"] == "Partial"

    # 4. Final payment of remaining ₹400 -> balance becomes ₹0, status = "Paid"
    res_final = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=reception_headers,
        json={"amount": 400.0, "method": "Card"},
    )
    assert res_final.status_code == 201

    inv_res2 = await async_client.get("/api/v1/invoices?status=Paid", headers=reception_headers)
    assert inv_res2.status_code == 200
    paid_inv = next(i for i in inv_res2.json()["items"] if i["id"] == inv_id)
    assert paid_inv["paid"] == 700.0
    assert paid_inv["balance"] == 0.0
    assert paid_inv["status"] == "Paid"


@pytest.mark.asyncio
async def test_idempotent_payment_retry(async_client: AsyncClient, skin_invoice, reception_headers):
    inv_id = skin_invoice["invoice"]["id"]

    idempotency_key = "idemp-req-unique-999"
    headers_with_key = {**reception_headers, "Idempotency-Key": idempotency_key}

    # First attempt: Pay ₹250
    res1 = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=headers_with_key,
        json={"amount": 250.0, "method": "Cash"},
    )
    assert res1.status_code == 201
    pay1 = res1.json()

    # Second attempt with exact same Idempotency-Key
    res2 = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=headers_with_key,
        json={"amount": 250.0, "method": "Cash"},
    )
    assert res2.status_code == 201
    pay2 = res2.json()
    assert pay2["id"] == pay1["id"]
    assert pay2["amount"] == 250.0


@pytest.mark.asyncio
async def test_refund_workflow(async_client: AsyncClient, skin_invoice, reception_headers, skin_doctor_headers):
    inv_id = skin_invoice["invoice"]["id"]

    # Record ₹500 payment
    await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=reception_headers,
        json={"amount": 500.0, "method": "Cash"},
    )

    # Clinician cannot record refund (403)
    doc_ref = await async_client.post(
        f"/api/v1/invoices/{inv_id}/refunds",
        headers=skin_doctor_headers,
        json={"amount": 100.0, "reason": "Patient overcharged"},
    )
    assert doc_ref.status_code == 403

    # Cannot refund more than net paid (e.g. ₹600 on ₹500 paid)
    res_excess_ref = await async_client.post(
        f"/api/v1/invoices/{inv_id}/refunds",
        headers=reception_headers,
        json={"amount": 600.0, "reason": "Excess"},
    )
    assert res_excess_ref.status_code == 422
    assert res_excess_ref.json()["code"] == "REFUND_EXCEEDS_PAID"

    # Reception records valid ₹200 refund
    res_ref = await async_client.post(
        f"/api/v1/invoices/{inv_id}/refunds",
        headers=reception_headers,
        json={"amount": 200.0, "reason": "Medication cancelled"},
    )
    assert res_ref.status_code == 201
    refund = res_ref.json()
    assert refund["amount"] == 200.0
    assert refund["reason"] == "Medication cancelled"


@pytest.mark.asyncio
async def test_visit_charge_addition_and_catalog_price_resolution(
    async_client: AsyncClient,
    skin_invoice,
    reception_headers,
    skin_doctor_headers,
    ortho_doctor_headers,
):
    visit_id = skin_invoice["visitId"]
    skin_invoice["invoice"]["id"]

    # 1. Ortho doctor cannot add charges to skin visit (403)
    ortho_chg = await async_client.post(
        f"/api/v1/visits/{visit_id}/charges",
        headers=ortho_doctor_headers,
        json={"description": "Plaster Cast", "amount": 1200.0},
    )
    assert ortho_chg.status_code == 403

    # 2. Skin doctor adds custom procedure charge
    skin_chg = await async_client.post(
        f"/api/v1/visits/{visit_id}/charges",
        headers=skin_doctor_headers,
        json={"description": "Skin Lesion Excision", "amount": 1500.0},
    )
    assert skin_chg.status_code == 201
    chg_data = skin_chg.json()
    assert chg_data["amount"] == 1500.0
    assert chg_data["description"] == "Skin Lesion Excision"

    # 3. Skin doctor adds catalog item by ID (e.g. CHG-301 Chemical Peel ₹1800)
    # Server re-reads the price from the catalog regardless of what amount client sent
    cat_chg = await async_client.post(
        f"/api/v1/visits/{visit_id}/charges",
        headers=skin_doctor_headers,
        json={"catalogItemId": "CHG-301", "description": "Chemical Peel", "amount": 999.0},
    )
    assert cat_chg.status_code == 201
    cat_data = cat_chg.json()
    assert cat_data["amount"] == 1800.0  # Server authoritative catalog price!

    # 4. Verify invoice total updated: fee ₹700 + ₹1500 + ₹1800 = ₹4000
    inv_res = await async_client.get(f"/api/v1/invoices?patientId={skin_invoice['patientId']}", headers=reception_headers)
    updated_inv = inv_res.json()["items"][0]
    assert updated_inv["total"] == 4000.0
    assert updated_inv["balance"] == 4000.0


@pytest.mark.asyncio
async def test_fee_settings_does_not_affect_existing_invoices(
    async_client: AsyncClient,
    skin_invoice,
    reception_headers,
    skin_doctor_headers,
):
    skin_invoice["invoice"]["id"]
    old_total = skin_invoice["invoice"]["total"]
    assert old_total == 700.0

    # Clinician cannot edit fees (403)
    doc_fee = await async_client.put(
        "/api/v1/settings/fees/skin",
        headers=skin_doctor_headers,
        json={"amount": 1200.0},
    )
    assert doc_fee.status_code == 403

    # Reception updates skin fee to ₹1000
    fee_res = await async_client.put(
        "/api/v1/settings/fees/skin",
        headers=reception_headers,
        json={"amount": 1000.0},
    )
    assert fee_res.status_code == 200
    assert fee_res.json()["skin"] == 1000.0

    # Old invoice fee is unchanged!
    inv_res = await async_client.get(f"/api/v1/invoices?patientId={skin_invoice['patientId']}", headers=reception_headers)
    old_inv = inv_res.json()["items"][0]
    assert old_inv["consultationFee"] == 700.0

    # Reset fee back to 700
    await async_client.put("/api/v1/settings/fees/skin", headers=reception_headers, json={"amount": 700.0})


@pytest.mark.asyncio
async def test_catalog_crud_and_rbac(async_client: AsyncClient, reception_headers, skin_doctor_headers):
    # 1. Doctors can read catalog
    list_res = await async_client.get("/api/v1/catalog/charges", headers=skin_doctor_headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) > 0

    # 2. Doctors cannot create catalog items (403)
    bad_create = await async_client.post(
        "/api/v1/catalog/charges",
        headers=skin_doctor_headers,
        json={"name": "New Laser", "category": "Procedure", "price": 5000.0},
    )
    assert bad_create.status_code == 403

    # 3. Reception creates catalog item
    create_res = await async_client.post(
        "/api/v1/catalog/charges",
        headers=reception_headers,
        json={"name": "Fractional CO2 Laser", "category": "Procedure", "price": 4500.0, "department": "skin"},
    )
    assert create_res.status_code == 201
    item = create_res.json()
    assert item["price"] == 4500.0
    item_id = item["id"]

    # 4. Reception updates catalog item
    update_res = await async_client.put(
        f"/api/v1/catalog/charges/{item_id}",
        headers=reception_headers,
        json={"price": 4800.0},
    )
    assert update_res.status_code == 200
    assert update_res.json()["price"] == 4800.0

    # 5. Reception deactivates catalog item
    del_res = await async_client.delete(f"/api/v1/catalog/charges/{item_id}", headers=reception_headers)
    assert del_res.status_code == 200

    # Confirm deactivated item is excluded from default listing
    list_after = await async_client.get("/api/v1/catalog/charges", headers=skin_doctor_headers)
    assert not any(i["id"] == item_id for i in list_after.json())


@pytest.mark.asyncio
async def test_doctor_cannot_record_payment(async_client: AsyncClient, skin_invoice, skin_doctor_headers):
    inv_id = skin_invoice["invoice"]["id"]
    res = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=skin_doctor_headers,
        json={"amount": 100.0, "method": "Cash"},
    )
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_concurrent_payments_no_overpay(async_client: AsyncClient, skin_invoice, reception_headers):
    inv_id = skin_invoice["invoice"]["id"]
    # Total balance is ₹700.
    # First payment of ₹500 succeeds, reducing balance to ₹200.
    res1 = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers={**reception_headers, "Idempotency-Key": "conc-pay-1"},
        json={"amount": 500.0, "method": "Cash"},
    )
    assert res1.status_code == 201

    # Subsequent payment of ₹500 exceeding remaining ₹200 balance is rejected (422 PAYMENT_EXCEEDS_BALANCE)
    res2 = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers={**reception_headers, "Idempotency-Key": "conc-pay-2"},
        json={"amount": 500.0, "method": "UPI"},
    )
    assert res2.status_code == 422
    assert res2.json()["code"] == "PAYMENT_EXCEEDS_BALANCE"

    # Check invoice balance is exactly ₹200 and paid is ₹500, preventing any overpayment
    inv_res = await async_client.get(f"/api/v1/invoices?patientId={skin_invoice['patientId']}", headers=reception_headers)
    inv = inv_res.json()["items"][0]
    assert inv["paid"] == 500.0
    assert inv["balance"] == 200.0


@pytest.mark.asyncio
async def test_refunds_never_edit_payments_audit_trail(async_client: AsyncClient, skin_invoice, reception_headers):
    inv_id = skin_invoice["invoice"]["id"]

    # 1. Pay ₹500
    pay_res = await async_client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        headers=reception_headers,
        json={"amount": 500.0, "method": "Cash"},
    )
    assert pay_res.status_code == 201
    payment_id = pay_res.json()["id"]

    # 2. Refund ₹200
    ref_res = await async_client.post(
        f"/api/v1/invoices/{inv_id}/refunds",
        headers=reception_headers,
        json={"amount": 200.0, "reason": "Partial refund for unused service"},
    )
    assert ref_res.status_code == 201

    # 3. Fetch invoice and verify payment is completely intact (append-only)
    inv_res = await async_client.get(f"/api/v1/invoices?patientId={skin_invoice['patientId']}", headers=reception_headers)
    inv = inv_res.json()["items"][0]
    assert len(inv["payments"]) >= 1
    orig_pay = next(p for p in inv["payments"] if p["id"] == payment_id)
    assert orig_pay["amount"] == 500.0  # Payment record was NEVER reduced or mutated!
    assert len(inv["refunds"]) >= 1
    orig_ref = next(r for r in inv["refunds"] if r["id"] == ref_res.json()["id"])
    assert orig_ref["amount"] == 200.0

