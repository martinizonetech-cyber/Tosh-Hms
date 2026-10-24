from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.appointments.models import Appointment
from app.modules.audit.models import AuditLog
from app.modules.billing.models import Invoice, InvoiceCharge, Payment, Refund
from app.modules.catalog.models import BodyRegionTemplate, ChargeCatalogItem
from app.modules.consultations.models import Consultation, PrescriptionItem
from app.modules.documents.models import Document
from app.modules.followups.models import FollowUp, ReminderLog
from app.modules.patients.models import Patient
from app.modules.queue.models import DailyTokenCounter, QueueEntry
from app.modules.settings.models import FeeSetting
from app.modules.users.models import Doctor, User
from app.modules.visits.models import Visit, VitalsRecord


@pytest.mark.asyncio
async def test_all_models_persist_and_query(db_session: AsyncSession):
    # 1. User & Doctor
    user = User(
        email="doctor.skin@example.com",
        password_hash="argon2id$hashed",
        role="skin",
        display_name="Dr. Sangamitra",
        department="skin",
    )
    db_session.add(user)
    await db_session.flush()

    doctor = Doctor(
        user_id=user.id,
        display_name="Dr. Sangamitra",
        department="skin",
    )
    db_session.add(doctor)
    await db_session.flush()

    # 2. Patient
    patient = Patient(
        display_id="PT-2041",
        full_name="Aarav Mehta",
        date_of_birth="1993-06-14",
        gender="Male",
        phone="+91 98765 41021",
        address="12 Lakeview Road, Pune",
    )
    db_session.add(patient)
    await db_session.flush()

    # 3. Appointment
    appointment = Appointment(
        display_id="APT-7201",
        patient_id=patient.id,
        department="skin",
        doctor_id=doctor.id,
        starts_at=datetime.now(UTC),
        visit_type="Follow-up",
        status="Checked-in",
    )
    db_session.add(appointment)
    await db_session.flush()

    # 4. Visit & Vitals
    visit = Visit(
        display_id="VIS-8801",
        patient_id=patient.id,
        department="skin",
        doctor_id=doctor.id,
        appointment_id=appointment.id,
        visit_type="Follow-up",
    )
    db_session.add(visit)
    await db_session.flush()

    vitals = VitalsRecord(
        visit_id=visit.id,
        blood_pressure="120/80 mmHg",
        pulse="72 bpm",
        temperature="37.0 C",
        height="170 cm",
        weight="68 kg",
        oxygen_saturation="99%",
        entered_by=user.id,
    )
    db_session.add(vitals)
    await db_session.flush()

    # 5. Queue & Token Counter
    queue_entry = QueueEntry(
        display_id="Q-5101",
        token="S-001",
        visit_id=visit.id,
        patient_id=patient.id,
        department="skin",
        doctor_id=doctor.id,
        status="Waiting",
        visit_type="Follow-up",
    )
    counter = DailyTokenCounter(
        department="skin",
        date=date.today(),
        current_number=1,
    )
    db_session.add_all([queue_entry, counter])
    await db_session.flush()

    # 6. Consultation & Prescription
    consultation = Consultation(
        id=visit.id,
        visit_id=visit.id,
        patient_id=patient.id,
        department="skin",
        symptoms="Dryness",
        diagnosis="Dermatitis",
        status="Draft",
    )
    db_session.add(consultation)
    await db_session.flush()

    rx = PrescriptionItem(
        display_id="RX-1",
        consultation_id=consultation.id,
        medicine_name="Moisturizer",
        strength="Regular",
        dosage="1 application",
        route="Topical",
        frequency="BD",
        duration="14 days",
    )
    db_session.add(rx)
    await db_session.flush()

    # 7. Invoices, Charges, Payments, Refunds
    invoice = Invoice(
        display_id="INV-3401",
        visit_id=visit.id,
        patient_id=patient.id,
        department="skin",
        visit_label="Skin visit",
        consultation_fee=70000,  # Rs. 700.00
    )
    db_session.add(invoice)
    await db_session.flush()

    charge = InvoiceCharge(
        display_id="CH-1",
        invoice_id=invoice.id,
        description="Laser peel",
        amount=150000,  # Rs. 1500.00
        added_by=doctor.display_name,
    )
    db_session.add(charge)
    await db_session.flush()

    payment = Payment(
        display_id="PAY-1",
        invoice_id=invoice.id,
        amount=220000,  # Rs. 2200.00
        method="UPI",
        transaction_reference="UPI-12345",
        recorded_by=user.id,
    )
    db_session.add(payment)
    await db_session.flush()

    refund = Refund(
        display_id="REF-1",
        invoice_id=invoice.id,
        amount=50000,  # Rs. 500.00
        reason="Dispute adjustment",
        recorded_by=user.id,
    )
    db_session.add(refund)
    await db_session.flush()

    # 8. Follow-up & Reminder
    follow_up = FollowUp(
        display_id="FU-2101",
        patient_id=patient.id,
        department="skin",
        doctor_id=doctor.id,
        date="2026-11-01",
        status="Upcoming",
        reminder_status="Queued",
        source_visit_id=visit.id,
    )
    db_session.add(follow_up)
    await db_session.flush()

    reminder = ReminderLog(
        follow_up_id=follow_up.id,
        kind="two-days-before",
        channel="whatsapp",
        status="Queued",
    )
    db_session.add(reminder)
    await db_session.flush()

    # 9. Document
    doc = Document(
        display_id="DOC-1",
        patient_id=patient.id,
        visit_id=visit.id,
        name="scan.jpg",
        mime_type="image/jpeg",
        size=1024,
        category="General",
        storage_key="patients/pt-1/doc-1.jpg",
        checksum="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        uploaded_by=user.id,
    )
    db_session.add(doc)
    await db_session.flush()

    # 10. Settings, Catalog, Templates, Audit
    fee_setting = FeeSetting(department="skin", amount=70000)
    catalog_item = ChargeCatalogItem(
        display_id="CHG-101",
        name="Kenacort Injection",
        category="Injection",
        price=85000,
        department="skin",
    )
    template = BodyRegionTemplate(
        region="Knee",
        fields=["Range of motion", "Stability"],
        medications=[{"id": "knee-1", "name": "Aceclofenac"}],
    )
    audit = AuditLog(
        actor_user_id=user.id,
        action="CREATE_PATIENT",
        entity_type="Patient",
        entity_id=str(patient.id),
        patient_id=patient.id,
    )
    db_session.add_all([fee_setting, catalog_item, template, audit])
    await db_session.commit()

    # Query back to verify integrity
    res = await db_session.execute(select(Patient).where(Patient.display_id == "PT-2041"))
    found_patient = res.scalar_one()
    assert found_patient.full_name == "Aarav Mehta"

    inv_res = await db_session.execute(select(Invoice).where(Invoice.display_id == "INV-3401"))
    found_invoice = inv_res.scalar_one()
    assert found_invoice.consultation_fee == 70000
