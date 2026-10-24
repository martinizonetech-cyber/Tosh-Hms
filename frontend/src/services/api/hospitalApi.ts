import type { Appointment, ChargeItem, Consultation, Department, FollowUp, Invoice, NewAppointmentInput, NewFollowUpInput, Patient, PatientDocument, PatientDraft, Payment, QueueEntry } from '../../types/domain';
import type { AppointmentSearchParams, CreateAppointmentRequest, CreateFollowUpRequest, CreatePatientRequest, CreateQueueRequest, CreateVisitChargeRequest, DocumentSearchParams, FollowUpSearchParams, InvoiceSearchParams, PaginatedResponse, PatientSearchParams, QueueSearchParams, RecordPaymentRequest, ReportSummary, ReportSummaryRequest, SaveConsultationRequest, UpdateFollowUpRequest, UpdateQueueRequest } from './contracts';
import type { HospitalRepository } from '../repositories/types';
import { requestJson } from './httpClient';

const queryString = (params: object) => {
  const search = new URLSearchParams();
  Object.entries(params as Record<string, string | number | undefined>).forEach(([key, value]) => { if (value !== undefined && value !== '') search.set(key, String(value)); });
  return search.size ? `?${search.toString()}` : '';
};

export const hospitalApi: HospitalRepository = {
  listPatients(params: PatientSearchParams = {}) { return requestJson<PaginatedResponse<Patient>>(`/patients${queryString(params)}`); },
  createPatient(input: PatientDraft & { department: Department }) { const body: CreatePatientRequest = input; return requestJson<Patient>('/patients', { method: 'POST', body: JSON.stringify(body) }); },
  listAppointments(params: AppointmentSearchParams = {}) { return requestJson<PaginatedResponse<Appointment>>(`/appointments${queryString(params)}`); },
  scheduleAppointment(input: NewAppointmentInput) { const body: CreateAppointmentRequest = input; return requestJson<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(body) }); },
  updateAppointment(id: string, patch: Partial<Appointment>) { return requestJson<Appointment>(`/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); },
  listQueue(params: QueueSearchParams = {}) { return requestJson<PaginatedResponse<QueueEntry>>(`/queue${queryString(params)}`); },
  createQueue(input: CreateQueueRequest) { return requestJson<QueueEntry>('/queue', { method: 'POST', body: JSON.stringify(input) }); },
  updateQueueEntry(id: string, patch: UpdateQueueRequest) { return requestJson<QueueEntry>(`/queue/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); },
  listInvoices(params: InvoiceSearchParams = {}) { return requestJson<PaginatedResponse<Invoice>>(`/invoices${queryString(params)}`); },
  recordPayment(input: RecordPaymentRequest) {
    const { invoiceId, ...payment } = input;
    const idempotencyKey = `pay-${invoiceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return requestJson<Payment>(`/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payment),
    });
  },
  listVisits(params: { patientId?: string; department?: string; status?: string; page?: number; pageSize?: number } = {}) {
    return requestJson<PaginatedResponse<Consultation>>(`/visits${queryString(params)}`);
  },
  getConsultation(visitId: string) { return requestJson<Consultation>(`/visits/${encodeURIComponent(visitId)}/consultation`); },
  saveConsultation(input: SaveConsultationRequest) { return requestJson<Consultation>(`/visits/${encodeURIComponent(input.visitId)}/consultation`, { method: 'PUT', body: JSON.stringify(input) }); },
  addVisitCharge(visitId: string, input: CreateVisitChargeRequest) { return requestJson<ChargeItem>(`/visits/${encodeURIComponent(visitId)}/charges`, { method: 'POST', body: JSON.stringify(input) }); },
  listFollowUps(params: FollowUpSearchParams = {}) { return requestJson<PaginatedResponse<FollowUp>>(`/follow-ups${queryString(params)}`); },
  createFollowUp(input: NewFollowUpInput) { const body: CreateFollowUpRequest = input; return requestJson<FollowUp>('/follow-ups', { method: 'POST', body: JSON.stringify(body) }); },
  updateFollowUp(id: string, patch: UpdateFollowUpRequest) { return requestJson<FollowUp>(`/follow-ups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); },
  listDocuments(params: DocumentSearchParams) { return requestJson<PaginatedResponse<PatientDocument>>(`/patients/${encodeURIComponent(params.patientId)}/documents${queryString({ page: params.page, pageSize: params.pageSize })}`); },
  uploadDocument(patientId: string, category: string, file: File, visitId?: string, name?: string) {
    const body = new FormData();
    body.append('patientId', patientId);
    body.append('category', category);
    if (visitId) {
      body.append('visitId', visitId);
    }
    if (name) {
      body.append('name', name);
    }
    body.append('file', file, file.name);
    return requestJson<PatientDocument>('/documents', { method: 'POST', body });
  },
  renameDocument(id: string, name: string) {
    return requestJson<PatientDocument>(`/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },
  deleteDocument(id: string) { return requestJson<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  getReportSummary(params: ReportSummaryRequest) { return requestJson<ReportSummary>(`/reports/summary${queryString(params)}`); },
};
