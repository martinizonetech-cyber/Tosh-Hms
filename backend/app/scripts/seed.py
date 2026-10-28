import asyncio
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import async_session_factory
from app.modules.appointments.models import Appointment
from app.modules.billing.models import Invoice, InvoiceCharge, Payment
from app.modules.catalog.models import BodyRegionTemplate, ChargeCatalogItem
from app.modules.consultations.models import Consultation, PrescriptionItem
from app.modules.followups.models import FollowUp
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry
from app.modules.settings.models import FeeSetting
from app.modules.users.models import Doctor, User
from app.modules.visits.models import Visit, VitalsRecord


def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    tz = ZoneInfo(settings.TIMEZONE)
    now = datetime.now(tz)
    base = now + timedelta(days=day_offset)
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


def iso_day(offset: int) -> str:
    tz = ZoneInfo(settings.TIMEZONE)
    now = datetime.now(tz)
    return (now + timedelta(days=offset)).strftime("%Y-%m-%d")


DEFAULT_VITALS = {
    "blood_pressure": "122/78 mmHg",
    "pulse": "74 bpm",
    "temperature": "36.8 °C",
    "height": "168 cm",
    "weight": "64 kg",
    "oxygen_saturation": "98%",
}

CATALOG_ITEMS = [
    {"display_id": "CHG-101", "name": "Triamcinolone (Kenacort) Steroid Injection", "category": "Injection", "price": 85000, "unit": "per dose", "department": "skin"},
    {"display_id": "CHG-102", "name": "Glutathione Skin Brightening Injection", "category": "Injection", "price": 250000, "unit": "per session", "department": "skin"},
    {"display_id": "CHG-103", "name": "Botox Botulinum Toxin Injection", "category": "Injection", "price": 400000, "unit": "per area", "department": "skin"},
    {"display_id": "CHG-104", "name": "Local Anaesthetic Lidocaine 2% Injection", "category": "Injection", "price": 25000, "unit": "per vial", "department": "all"},
    {"display_id": "CHG-105", "name": "Biotin / Hair Growth Peptide Injection", "category": "Injection", "price": 140000, "unit": "per dose", "department": "skin"},
    {"display_id": "CHG-201", "name": "Sterile Cotton Roll / Cotton Pack", "category": "Consumable", "price": 5000, "unit": "pack", "department": "all"},
    {"display_id": "CHG-202", "name": "Sterile Gauze & Surgical Dressing Pack", "category": "Consumable", "price": 12000, "unit": "set", "department": "all"},
    {"display_id": "CHG-203", "name": "Disposable Syringe & 30G Needle Pack", "category": "Consumable", "price": 6000, "unit": "set of 2", "department": "all"},
    {"display_id": "CHG-204", "name": "Micropore Surgical Tape & Bandage", "category": "Consumable", "price": 8000, "unit": "roll", "department": "all"},
    {"display_id": "CHG-205", "name": "Betadine Antiseptic Cleansing Solution", "category": "Consumable", "price": 10000, "unit": "application", "department": "all"},
    {"display_id": "CHG-206", "name": "Biopsy Punch Disposable Tool (3mm / 4mm)", "category": "Consumable", "price": 35000, "unit": "per piece", "department": "skin"},
    {"display_id": "CHG-207", "name": "Surgical Latex Gloves & Disposable Drapes", "category": "Consumable", "price": 9000, "unit": "pair", "department": "all"},
    {"display_id": "CHG-301", "name": "Chemical Peel (Salicylic / Glycolic Acid)", "category": "Procedure", "price": 180000, "unit": "full face", "department": "skin"},
    {"display_id": "CHG-302", "name": "Comedone / Acne Extraction Session", "category": "Procedure", "price": 85000, "unit": "per session", "department": "skin"},
    {"display_id": "CHG-303", "name": "Electrocautery Wart / Skin Tag Removal", "category": "Procedure", "price": 150000, "unit": "up to 5 lesions", "department": "skin"},
    {"display_id": "CHG-304", "name": "Cryotherapy (Liquid Nitrogen Spray)", "category": "Procedure", "price": 120000, "unit": "per lesion area", "department": "skin"},
    {"display_id": "CHG-305", "name": "Skin Punch Biopsy Procedure", "category": "Procedure", "price": 220000, "unit": "including specimen prep", "department": "skin"},
    {"display_id": "CHG-306", "name": "Dermabrasion / Hydrafacial Treatment", "category": "Procedure", "price": 280000, "unit": "per sitting", "department": "skin"},
    {"display_id": "CHG-307", "name": "Laser Skin Rejuvenation / Pigment Reduction", "category": "Procedure", "price": 350000, "unit": "per sitting", "department": "skin"},
]

BODY_REGION_TEMPLATES = [
    {
        "region": "Knee",
        "fields": ["Range of motion", "Stability (Lachman / Pivot / Collateral)", "Swelling / effusion", "Gait / weight bearing", "Joint line tenderness", "Patellofemoral tracking"],
        "medications": [
            {"id": "knee-med-1", "medicineName": "Tab. Aceclofenac + Paracetamol", "strength": "100mg / 325mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "5 Days", "instructions": "Take after meals (Pain & anti-inflammatory)"},
            {"id": "knee-med-2", "medicineName": "Tab. Pantoprazole", "strength": "40mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Once daily (OD)", "duration": "5 Days", "instructions": "Take in morning on empty stomach"},
            {"id": "knee-med-3", "medicineName": "Tab. Thiocolchicoside", "strength": "4mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "5 Days", "instructions": "Take after meals (Muscle relaxant)"},
        ],
    },
    {
        "region": "Shoulder",
        "fields": ["Range of motion (Abduction / Flexion / Rotation)", "Rotator cuff strength (Empty can / Hawkins)", "Tenderness / impingement", "Functional movement / overhead reach", "Biceps tendon stability", "Scapular rhythm"],
        "medications": [
            {"id": "shoulder-med-1", "medicineName": "Tab. Etoricoxib", "strength": "90mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Once daily (OD)", "duration": "5 Days", "instructions": "Take after breakfast (Anti-inflammatory)"},
            {"id": "shoulder-med-2", "medicineName": "Tab. Rabeprazole", "strength": "20mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Once daily (OD)", "duration": "5 Days", "instructions": "Take 30 mins before breakfast"},
        ],
    },
    {
        "region": "Spine",
        "fields": ["Region / level (Cervical / Lumbar / Dorsal)", "Range of motion (Flexion / Extension / Lateral)", "Neurological examination (SLR / Motor / Sensory / Reflexes)", "Paraspinal tenderness / spasm", "Radicular symptoms / Sciatica", "Posture / gait"],
        "medications": [
            {"id": "spine-med-1", "medicineName": "Tab. Aceclofenac + Paracetamol + Chlorzoxazone", "strength": "100 / 325 / 250mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "7 Days", "instructions": "Take after meals (Spinal pain & relaxant)"},
            {"id": "spine-med-2", "medicineName": "Tab. Pantoprazole", "strength": "40mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Once daily (OD)", "duration": "7 Days", "instructions": "Take in morning on empty stomach"},
        ],
    },
    {
        "region": "Hip",
        "fields": ["Range of motion (Flexion / Rotation / Abduction)", "Gait / Trendelenburg test", "Tenderness / groin pain", "Functional movement / squatting", "Leg length discrepancy", "Trochanteric bursitis assessment"],
        "medications": [
            {"id": "hip-med-1", "medicineName": "Tab. Etodolac + Paracetamol", "strength": "400mg / 325mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "7 Days", "instructions": "Take after meals (Anti-inflammatory)"},
        ],
    },
    {
        "region": "Elbow",
        "fields": ["Range of motion (Flexion / Extension / Pronation / Supination)", "Epicondylar tenderness (Tennis / Golfer elbow test)", "Stability (Collateral ligaments)", "Grip strength", "Ulnar nerve subluxation / Tinel sign"],
        "medications": [
            {"id": "elbow-med-1", "medicineName": "Tab. Aceclofenac + Serratiopeptidase", "strength": "100mg / 15mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "5 Days", "instructions": "Take after food for tendinitis & swelling"},
        ],
    },
    {
        "region": "Wrist & Hand",
        "fields": ["Range of motion (Dorsiflexion / Palmar flexion / Ulnar deviation)", "Grip strength & pinch test", "Phalen & Tinel test (Carpal tunnel)", "Finkelstein test (De Quervain)", "Swelling / effusion / deformity"],
        "medications": [
            {"id": "wrist-med-1", "medicineName": "Tab. Aceclofenac", "strength": "100mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "5 Days", "instructions": "Take after meals"},
        ],
    },
    {
        "region": "Ankle & Foot",
        "fields": ["Range of motion (Dorsiflexion / Plantar flexion / Inversion / Eversion)", "Anterior drawer & Talar tilt (Ligament stability)", "Malleolar / Achilles / Plantar fascia tenderness", "Swelling / ecchymosis / weight bearing ability", "Arch examination (Pes planus / cavus)"],
        "medications": [
            {"id": "ankle-med-1", "medicineName": "Tab. Etoricoxib", "strength": "90mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Once daily (OD)", "duration": "5 Days", "instructions": "Take after breakfast for acute ligament sprain"},
        ],
    },
    {
        "region": "Other / General",
        "fields": ["Anatomical location", "Range of motion / mobility", "Deformity / alignment", "Neurovascular status", "Relevant orthopaedic findings"],
        "medications": [
            {"id": "other-med-1", "medicineName": "Tab. Aceclofenac + Paracetamol", "strength": "100mg / 325mg", "dosage": "1 Tab", "route": "Oral", "frequency": "Twice daily (BD)", "duration": "5 Days", "instructions": "Take after meals (Analgesic & anti-inflammatory)"},
        ],
    },
]


async def seed_database() -> None:
    print("[SEED] Starting database seeding...")
    async with async_session_factory() as session:
        # 1. Clean existing records in correct topological order
        print("Cleaning previous records...")
        table_names = [f'"{table.name}"' for table in Base.metadata.sorted_tables]
        await session.execute(text(f"TRUNCATE TABLE {', '.join(table_names)} CASCADE;"))
        await session.flush()

        # 2. Staff Users & Doctors
        print("Seeding staff accounts and doctors...")
        reception_pw = settings.RECEPTION_INITIAL_PASSWORD
        skin_pw = settings.SKIN_INITIAL_PASSWORD
        ortho_pw = settings.ORTHO_INITIAL_PASSWORD
        if not reception_pw or not skin_pw or not ortho_pw:
            raise ValueError("Initial staff passwords must be configured in environment / backend/.env")

        reception_user = User(
            email="reception@gmail.com",
            password_hash=hash_password(reception_pw),
            role="reception",
            display_name="Reception Desk",
            department=None,
            is_active=True,
            must_change_password=True,
        )
        skin_user = User(
            email="skin@gmail.com",
            password_hash=hash_password(skin_pw),
            role="skin",
            display_name="Dr. Sangamitra",
            department="skin",
            is_active=True,
            must_change_password=True,
        )
        ortho_user = User(
            email="ortho@gmail.com",
            password_hash=hash_password(ortho_pw),
            role="orthopaedics",
            display_name="Dr. Sundarprakash",
            department="orthopaedics",
            is_active=True,
            must_change_password=True,
        )
        session.add_all([reception_user, skin_user, ortho_user])
        await session.flush()

        doc_skin = Doctor(
            user_id=skin_user.id,
            display_name="Dr. Sangamitra",
            department="skin",
        )
        doc_ortho = Doctor(
            user_id=ortho_user.id,
            display_name="Dr. Sundarprakash",
            department="orthopaedics",
        )
        session.add_all([doc_skin, doc_ortho])
        await session.flush()

        # 3. Fee Settings
        print("Seeding fee settings...")
        fee_skin = FeeSetting(department="skin", amount=70000, currency="INR")
        fee_ortho = FeeSetting(department="orthopaedics", amount=90000, currency="INR")
        session.add_all([fee_skin, fee_ortho])

        # 4. Charge Catalog
        print("Seeding charge catalog...")
        for item in CATALOG_ITEMS:
            session.add(ChargeCatalogItem(**item))

        # 5. Body Region Templates
        print("Seeding body region templates...")
        for tmpl in BODY_REGION_TEMPLATES:
            session.add(BodyRegionTemplate(**tmpl))

        await session.flush()

        # 6. Patients
        print("Seeding patients...")
        patients_data: list[dict[str, Any]] = [
            {"display_id": "PT-2041", "full_name": "Aarav Mehta", "date_of_birth": "1993-06-14", "gender": "Male", "phone": "+91 98765 41021", "email": "aarav.mehta@example.test", "address": "12 Lakeview Road, Pune", "emergency_contact": "+91 98765 41022", "registered_at": at(-42, 9), "latest_visit_at": at(-18, 10)},
            {"display_id": "PT-2042", "full_name": "Mira Shah", "date_of_birth": "1987-11-03", "gender": "Female", "phone": "+91 98220 34108", "email": "mira.shah@example.test", "address": "8 Cedar Avenue, Pune", "registered_at": at(-36, 11), "latest_visit_at": at(-12, 11)},
            {"display_id": "PT-2043", "full_name": "Ishaan Rao", "date_of_birth": "2000-02-20", "gender": "Male", "phone": "+91 97655 11870", "address": "44 Park Street, Pune", "registered_at": at(-23, 12), "latest_visit_at": at(-6, 9)},
            {"display_id": "PT-2044", "full_name": "Ananya Iyer", "date_of_birth": "1979-09-08", "gender": "Female", "phone": "+91 98901 77214", "email": "ananya.iyer@example.test", "address": "29 Willow Lane, Pune", "registered_at": at(-14, 15), "latest_visit_at": at(-3, 14)},
            {"display_id": "PT-2045", "full_name": "Kabir Nair", "date_of_birth": "1996-03-25", "gender": "Male", "phone": "+91 99701 62542", "email": "kabir.nair@example.test", "address": "5 Riverside Walk, Pune", "registered_at": at(-9, 10), "latest_visit_at": at(-2, 16)},
            {"display_id": "PT-2046", "full_name": "Leena Kapoor", "date_of_birth": "1968-12-17", "gender": "Female", "phone": "+91 98190 56231", "address": "19 Garden View, Pune", "registered_at": at(-7, 13), "latest_visit_at": at(-1, 10)},
            {"display_id": "PT-2047", "full_name": "Devika Menon", "date_of_birth": "1990-08-30", "gender": "Female", "phone": "+91 99870 22615", "email": "devika.menon@example.test", "address": "63 Hillcrest, Pune", "registered_at": at(-4, 11)},
            {"display_id": "PT-2048", "full_name": "Rohan Desai", "date_of_birth": "1984-01-12", "gender": "Male", "phone": "+91 98600 39941", "address": "7 Orchard Road, Pune", "registered_at": at(-2, 9)},
        ]

        patient_map: dict[str, Patient] = {}
        for p_data in patients_data:
            p = Patient(**p_data)
            session.add(p)
            patient_map[p_data["display_id"]] = p

        await session.flush()

        # 7. Appointments
        print("Seeding appointments...")
        appts_data: list[dict[str, Any]] = [
            {"display_id": "APT-7201", "patient_display": "PT-2041", "dept": "skin", "doc": doc_skin, "starts_at": at(0, 9, 30), "visit_type": "Follow-up", "note": "Review skin-care routine", "status": "Checked-in"},
            {"display_id": "APT-7202", "patient_display": "PT-2042", "dept": "orthopaedics", "doc": doc_ortho, "starts_at": at(0, 10), "visit_type": "Follow-up", "note": "Knee mobility review", "status": "Scheduled"},
            {"display_id": "APT-7203", "patient_display": "PT-2043", "dept": "skin", "doc": doc_skin, "starts_at": at(0, 10, 30), "visit_type": "New", "note": "", "status": "Scheduled"},
            {"display_id": "APT-7204", "patient_display": "PT-2044", "dept": "orthopaedics", "doc": doc_ortho, "starts_at": at(0, 11), "visit_type": "Follow-up", "note": "Shoulder symptoms", "status": "In progress"},
            {"display_id": "APT-7205", "patient_display": "PT-2045", "dept": "skin", "doc": doc_skin, "starts_at": at(0, 12), "visit_type": "Walk-in", "note": "Itching; clinician review", "status": "Scheduled"},
            {"display_id": "APT-7206", "patient_display": "PT-2046", "dept": "orthopaedics", "doc": doc_ortho, "starts_at": at(0, 12, 30), "visit_type": "New", "note": "", "status": "Scheduled"},
            {"display_id": "APT-7207", "patient_display": "PT-2047", "dept": "skin", "doc": doc_skin, "starts_at": at(0, 14), "visit_type": "New", "note": "", "status": "Scheduled"},
            {"display_id": "APT-7208", "patient_display": "PT-2048", "dept": "orthopaedics", "doc": doc_ortho, "starts_at": at(0, 15), "visit_type": "Follow-up", "note": "Review current symptoms", "status": "Scheduled"},
            {"display_id": "APT-7209", "patient_display": "PT-2041", "dept": "skin", "doc": doc_skin, "starts_at": at(2, 10), "visit_type": "Follow-up", "note": "Future follow-up demo", "status": "Scheduled"},
        ]

        appt_map: dict[str, Appointment] = {}
        for a in appts_data:
            appt = Appointment(
                display_id=a["display_id"],
                patient_id=patient_map[a["patient_display"]].id,
                department=a["dept"],
                doctor_id=a["doc"].id,
                starts_at=a["starts_at"],
                visit_type=a["visit_type"],
                note=a["note"],
                status=a["status"],
                created_by=reception_user.id,
            )
            session.add(appt)
            appt_map[a["display_id"]] = appt

        await session.flush()

        # 8. Visits & Vitals
        print("Seeding visits & vitals...")
        visits_data: list[dict[str, Any]] = [
            {"display_id": "VIS-8801", "patient_display": "PT-2041", "dept": "skin", "doc": doc_skin, "appt": appt_map["APT-7201"], "started_at": at(0, 9, 12), "visit_type": "Follow-up"},
            {"display_id": "VIS-8802", "patient_display": "PT-2042", "dept": "orthopaedics", "doc": doc_ortho, "appt": appt_map["APT-7202"], "started_at": at(-12, 11), "visit_type": "Follow-up"},
            {"display_id": "VIS-8803", "patient_display": "PT-2043", "dept": "skin", "doc": doc_skin, "appt": None, "started_at": at(-6, 9), "visit_type": "New"},
            {"display_id": "VIS-8804", "patient_display": "PT-2044", "dept": "orthopaedics", "doc": doc_ortho, "appt": appt_map["APT-7204"], "started_at": at(0, 9, 25), "visit_type": "Follow-up"},
        ]

        visit_map: dict[str, Visit] = {}
        for v in visits_data:
            vis = Visit(
                display_id=v["display_id"],
                patient_id=patient_map[v["patient_display"]].id,
                department=v["dept"],
                doctor_id=v["doc"].id,
                appointment_id=v["appt"].id if v["appt"] else None,
                visit_type=v["visit_type"],
                started_at=v["started_at"],
            )
            session.add(vis)
            visit_map[v["display_id"]] = vis

        await session.flush()

        # Add vitals for each visit
        for vis in visit_map.values():
            session.add(VitalsRecord(
                visit_id=vis.id,
                blood_pressure=DEFAULT_VITALS["blood_pressure"],
                pulse=DEFAULT_VITALS["pulse"],
                temperature=DEFAULT_VITALS["temperature"],
                height=DEFAULT_VITALS["height"],
                weight=DEFAULT_VITALS["weight"],
                oxygen_saturation=DEFAULT_VITALS["oxygen_saturation"],
                entered_by=reception_user.id,
                entered_at=vis.started_at,
            ))

        # 9. Queue Entries
        print("Seeding queue entries...")
        q_entries: list[dict[str, Any]] = [
            {"display_id": "Q-5101", "token": "S-018", "vis": visit_map["VIS-8801"], "patient_display": "PT-2041", "dept": "skin", "doc": doc_skin, "arrival_at": at(0, 9, 12), "status": "Waiting", "visit_type": "Follow-up", "note": "Review skin-care routine"},
            {"display_id": "Q-5102", "token": "O-011", "vis": visit_map["VIS-8804"], "patient_display": "PT-2044", "dept": "orthopaedics", "doc": doc_ortho, "arrival_at": at(0, 9, 25), "status": "Consulting", "visit_type": "Follow-up", "note": "Shoulder symptoms"},
            {"display_id": "Q-5103", "token": "S-019", "vis": visit_map["VIS-8803"], "patient_display": "PT-2045", "dept": "skin", "doc": doc_skin, "arrival_at": at(0, 9, 41), "status": "Waiting", "visit_type": "Walk-in", "note": "Itching; clinician review"},
        ]

        for q in q_entries:
            session.add(QueueEntry(
                display_id=q["display_id"],
                token=q["token"],
                visit_id=q["vis"].id,
                patient_id=patient_map[q["patient_display"]].id,
                department=q["dept"],
                doctor_id=q["doc"].id,
                arrival_at=q["arrival_at"],
                status=q["status"],
                visit_type=q["visit_type"],
                note=q["note"],
            ))

        # 10. Consultations & Prescriptions
        print("Seeding consultations...")
        c1 = Consultation(
            id=visit_map["VIS-8801"].id,
            visit_id=visit_map["VIS-8801"].id,
            patient_id=patient_map["PT-2041"].id,
            department="skin",
            symptoms="Intermittent dryness on both cheeks for three weeks.",
            medical_history="No significant history reported.",
            allergies="No known drug allergies.",
            examination="Mild erythema; skin intact.",
            assessment="Dryness with mild irritation.",
            diagnosis="Irritant contact dermatitis",
            treatment_plan="Gentle skin-care routine; review in four weeks.",
            follow_up_date=iso_day(9),
            status="Finalized",
            finalized_at=at(0, 9, 30),
            finalized_by=skin_user.id,
        )
        session.add(c1)
        session.add(PrescriptionItem(
            display_id="RX-1",
            consultation_id=c1.id,
            medicine_name="Moisturizer (doctor-entered)",
            strength="—",
            dosage="Apply a thin layer",
            route="Topical",
            frequency="As directed",
            duration="To be confirmed",
            instructions="Use only as directed by the clinician.",
            sort_order=0,
        ))

        c2 = Consultation(
            id=visit_map["VIS-8802"].id,
            visit_id=visit_map["VIS-8802"].id,
            patient_id=patient_map["PT-2042"].id,
            department="orthopaedics",
            symptoms="Right knee discomfort when using stairs.",
            medical_history="Occasional recreational walking.",
            allergies="No known allergies reported.",
            examination="Range of motion recorded for clinician review.",
            assessment="Symptoms require clinical assessment.",
            diagnosis="Pending clinician entry",
            treatment_plan="Pending clinician entry.",
            pain_location="Anterior right knee",
            side="Right",
            status="Finalized",
            finalized_at=at(-12, 11, 30),
            finalized_by=ortho_user.id,
        )
        session.add(c2)

        c3 = Consultation(
            id=visit_map["VIS-8803"].id,
            visit_id=visit_map["VIS-8803"].id,
            patient_id=patient_map["PT-2043"].id,
            department="skin",
            symptoms="Occasional scalp itching; patient reports recent product change.",
            medical_history="No significant history reported.",
            allergies="Seasonal pollen sensitivity reported.",
            examination="No open lesions noted in demo record.",
            diagnosis="",
            status="Draft",
        )
        session.add(c3)

        c4 = Consultation(
            id=visit_map["VIS-8804"].id,
            visit_id=visit_map["VIS-8804"].id,
            patient_id=patient_map["PT-2044"].id,
            department="orthopaedics",
            symptoms="Left shoulder stiffness after activity.",
            medical_history="No significant history reported.",
            allergies="Not recorded.",
            pain_location="Left shoulder",
            side="Left",
            status="Draft",
        )
        session.add(c4)

        # 11. Invoices, Charges, Payments
        print("Seeding invoices, charges, and payments...")
        inv1 = Invoice(
            display_id="INV-3401",
            patient_id=patient_map["PT-2041"].id,
            visit_id=visit_map["VIS-8801"].id,
            department="skin",
            visit_label="Skin consultation · APT-7201",
            consultation_fee=70000,
            created_at=at(0, 9, 30),
        )
        inv2 = Invoice(
            display_id="INV-3402",
            patient_id=patient_map["PT-2042"].id,
            visit_id=visit_map["VIS-8802"].id,
            department="orthopaedics",
            visit_label="Orthopaedics follow-up · APT-7202",
            consultation_fee=90000,
            created_at=at(0, 10),
        )
        inv3 = Invoice(
            display_id="INV-3403",
            patient_id=patient_map["PT-2044"].id,
            visit_id=visit_map["VIS-8804"].id,
            department="orthopaedics",
            visit_label="Orthopaedics consultation · APT-7204",
            consultation_fee=90000,
            created_at=at(0, 11),
        )
        session.add_all([inv1, inv2, inv3])
        await session.flush()

        # Charges & Payments on Invoice 2
        session.add(InvoiceCharge(
            display_id="CH-10",
            invoice_id=inv2.id,
            description="Support assessment",
            amount=35000,  # ₹350
            added_by="Dr. Sundarprakash",
            created_at=at(0, 8),
        ))
        session.add(Payment(
            display_id="PAY-11",
            invoice_id=inv2.id,
            amount=50000,  # ₹500
            method="UPI",
            transaction_reference="DEMO-UPI-4418",
            paid_at=at(0, 8, 10),
            recorded_by=reception_user.id,
        ))

        # Invoice 3 starts unpaid (Due) for reception workflow

        # 12. Follow-ups
        print("Seeding follow-ups...")
        fu_data: list[dict[str, Any]] = [
            {"display_id": "FU-2101", "patient_display": "PT-2041", "dept": "skin", "doc": doc_skin, "date": iso_day(9), "status": "Upcoming", "reminder_status": "Not sent", "note": "Review skin-care routine"},
            {"display_id": "FU-2102", "patient_display": "PT-2042", "dept": "orthopaedics", "doc": doc_ortho, "date": iso_day(0), "status": "Upcoming", "reminder_status": "Queued", "note": "Knee mobility review"},
            {"display_id": "FU-2103", "patient_display": "PT-2045", "dept": "skin", "doc": doc_skin, "date": iso_day(-2), "status": "Overdue", "reminder_status": "Not sent", "note": "Follow-up pending"},
            {"display_id": "FU-2104", "patient_display": "PT-2046", "dept": "orthopaedics", "doc": doc_ortho, "date": iso_day(14), "status": "Upcoming", "reminder_status": "Not sent", "note": "Review current symptoms"},
        ]

        for fu in fu_data:
            session.add(FollowUp(
                display_id=fu["display_id"],
                patient_id=patient_map[fu["patient_display"]].id,
                department=fu["dept"],
                doctor_id=fu["doc"].id,
                date=fu["date"],
                status=fu["status"],
                reminder_status=fu["reminder_status"],
                note=fu["note"],
            ))

        await session.commit()
        print("[SUCCESS] Database seeding successfully finished!")


if __name__ == "__main__":
    asyncio.run(seed_database())
