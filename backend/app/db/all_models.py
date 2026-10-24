"""Central import point for all SQLAlchemy models to register with Base.metadata"""

from app.db.base import Base
from app.modules.appointments.models import Appointment
from app.modules.audit.models import AuditLog
from app.modules.auth.models import RefreshToken
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

__all__ = [
    "Appointment",
    "AuditLog",
    "Base",
    "BodyRegionTemplate",
    "ChargeCatalogItem",
    "Consultation",
    "DailyTokenCounter",
    "Doctor",
    "Document",
    "FeeSetting",
    "FollowUp",
    "Invoice",
    "InvoiceCharge",
    "Patient",
    "Payment",
    "PrescriptionItem",
    "QueueEntry",
    "RefreshToken",
    "Refund",
    "ReminderLog",
    "User",
    "Visit",
    "VitalsRecord",
]
