import uuid

from app.core.schemas import CamelModel


class DoctorPublic(CamelModel):
    id: uuid.UUID
    display_name: str
    department: str
