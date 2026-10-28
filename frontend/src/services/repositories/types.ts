import type { Appointment, ChargeItem, Consultation, FollowUp, Invoice, NewAppointmentInput, NewFollowUpInput, Patient, PatientDocument, Payment, QueueEntry } from '../../types/domain';
import type { AppointmentSearchParams, CreatePatientRequest, CreateQueueRequest, CreateVisitChargeRequest, DocumentSearchParams, FollowUpSearchParams, InvoiceSearchParams, PaginatedResponse, PatientSearchParams, QueueSearchParams, RecordPaymentRequest, ReportSummary, ReportSummaryRequest, SaveConsultationRequest, UpdateFollowUpRequest, UpdateQueueRequest } from '../api/contracts';

/** Asynchronous boundary for a future backend adapter; never substitutes demo records on errors. */
export interface HospitalRepository {
  listPatients(params?: PatientSearchParams): Promise<PaginatedResponse<Patient>>;
  createPatient(input: CreatePatientRequest): Promise<Patient>;
  listAppointments(params?: AppointmentSearchParams): Promise<PaginatedResponse<Appointment>>;
  scheduleAppointment(input: NewAppointmentInput): Promise<Appointment>;
  updateAppointment(id: string, patch: Partial<Appointment>): Promise<Appointment>;
  listQueue(params?: QueueSearchParams): Promise<PaginatedResponse<QueueEntry>>;
  createQueue(input: CreateQueueRequest): Promise<QueueEntry>;
  updateQueueEntry(id: string, patch: UpdateQueueRequest): Promise<QueueEntry>;
  listInvoices(params?: InvoiceSearchParams): Promise<PaginatedResponse<Invoice>>;
  recordPayment(input: RecordPaymentRequest): Promise<Payment>;
  listVisits?(params?: { patientId?: string; department?: string; status?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<Consultation>>;
  getConsultation(visitId: string): Promise<Consultation>;
  saveConsultation(input: SaveConsultationRequest): Promise<Consultation>;
  addVisitCharge(visitId: string, input: CreateVisitChargeRequest): Promise<ChargeItem>;
  addInvoiceCharge?(invoiceId: string, input: CreateVisitChargeRequest): Promise<ChargeItem>;
  removeInvoiceCharge?(invoiceId: string, chargeId: string): Promise<void>;
  updateInvoiceConsultationFee?(invoiceId: string, consultationFee: number): Promise<Invoice | void>;
  deletePayment?(invoiceId: string, paymentId: string): Promise<void>;
  removePayment?(invoiceId: string, paymentId: string): Promise<void>;
  updateInvoiceCharge?(invoiceId: string, chargeId: string, patch: { description: string; amount: number; qty?: number; unitPrice?: number }): Promise<ChargeItem>;
  listFollowUps(params?: FollowUpSearchParams): Promise<PaginatedResponse<FollowUp>>;
  createFollowUp(input: NewFollowUpInput): Promise<FollowUp>;
  updateFollowUp(id: string, patch: UpdateFollowUpRequest): Promise<FollowUp>;
  listDocuments(params: DocumentSearchParams): Promise<PaginatedResponse<PatientDocument>>;
  uploadDocument(patientId: string, category: string, file: File, visitId?: string, name?: string): Promise<PatientDocument>;
  renameDocument?(id: string, name: string): Promise<PatientDocument>;
  deleteDocument(id: string): Promise<void>;
  getReportSummary(params: ReportSummaryRequest): Promise<ReportSummary>;
}
