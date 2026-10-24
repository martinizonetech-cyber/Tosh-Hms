from app.core.schemas import CamelModel


class PatientDocumentResponse(CamelModel):
    id: str  # DOC-1001
    patient_id: str  # PT-1001
    name: str
    mime_type: str
    size: int
    category: str
    uploaded_at: str
    data_url: str | None = None
    url: str | None = None


class PaginatedDocumentsResponse(CamelModel):
    items: list[PatientDocumentResponse]
    page: int
    page_size: int
    total: int
