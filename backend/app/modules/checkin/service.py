import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tokens import allocate_daily_token, next_display_id
from app.modules.appointments.models import Appointment
from app.modules.billing.models import Invoice
from app.modules.consultations.models import Consultation
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry
from app.modules.settings.models import FeeSetting
from app.modules.users.models import Doctor
from app.modules.visits.models import Visit, VitalsRecord


class CheckInService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def execute_checkin(
        self,
        patient: Patient,
        department: str,
        doctor: Doctor,
        visit_type: str = "New",
        note: str | None = None,
        vitals: dict[str, Any] | None = None,
        appointment_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> QueueEntry:
        dept = department.lower()

        # 1. Create Visit record
        vis_display_id = await next_display_id(self.db, Visit, "VIS")
        visit = Visit(
            display_id=vis_display_id,
            patient_id=patient.id,
            department=dept,
            doctor_id=doctor.id,
            appointment_id=appointment_id,
            visit_type=visit_type,
            started_at=datetime.now(UTC),
        )
        self.db.add(visit)
        await self.db.flush()

        # 2. Concurrency-safe Token allocation
        token = await allocate_daily_token(self.db, dept)

        # 3. Create Queue Entry
        q_display_id = await next_display_id(self.db, QueueEntry, "Q")
        queue_entry = QueueEntry(
            display_id=q_display_id,
            token=token,
            visit_id=visit.id,
            patient_id=patient.id,
            department=dept,
            doctor_id=doctor.id,
            arrival_at=datetime.now(UTC),
            status="Waiting",
            visit_type=visit_type,
            note=note,
        )
        self.db.add(queue_entry)
        await self.db.flush()

        # Link queue entry to visit
        visit.queue_entry_id = queue_entry.id

        # 4. Create Vitals record
        vitals_dict = vitals or {}
        vitals_record = VitalsRecord(
            visit_id=visit.id,
            blood_pressure=str(vitals_dict.get("bloodPressure") or vitals_dict.get("blood_pressure") or ""),
            pulse=str(vitals_dict.get("pulse") or ""),
            temperature=str(vitals_dict.get("temperature") or ""),
            height=str(vitals_dict.get("height") or ""),
            weight=str(vitals_dict.get("weight") or ""),
            oxygen_saturation=str(vitals_dict.get("oxygenSaturation") or vitals_dict.get("oxygen_saturation") or ""),
            entered_by=actor_id,
            entered_at=datetime.now(UTC),
        )
        self.db.add(vitals_record)

        # 5. Create Draft Consultation
        consultation = Consultation(
            id=visit.id,
            visit_id=visit.id,
            patient_id=patient.id,
            department=dept,
            status="Draft",
            version=1,
        )
        self.db.add(consultation)

        # 6. Snapshot current department fee for Invoice
        fee_stmt = select(FeeSetting).where(FeeSetting.department == dept)
        fee_res = await self.db.execute(fee_stmt)
        fee_setting = fee_res.scalar_one_or_none()
        fee_amount_paise = fee_setting.amount if fee_setting else 70000

        inv_display_id = await next_display_id(self.db, Invoice, "INV")
        invoice = Invoice(
            display_id=inv_display_id,
            visit_id=visit.id,
            patient_id=patient.id,
            department=dept,
            visit_label=f"{visit_type} Consultation",
            consultation_fee=fee_amount_paise,
        )
        self.db.add(invoice)

        # 7. Update Patient latest visit timestamp
        patient.latest_visit_at = datetime.now(UTC)

        # 8. Sync Appointment status if linked
        if appointment_id:
            apt_stmt = select(Appointment).where(Appointment.id == appointment_id)
            apt_res = await self.db.execute(apt_stmt)
            apt = apt_res.scalar_one_or_none()
            if apt:
                apt.status = "Checked-in"

        await self.db.flush()
        return queue_entry
