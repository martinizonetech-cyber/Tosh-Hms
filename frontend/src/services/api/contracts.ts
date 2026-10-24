import type { Appointment, ChargeItem, Consultation, Department, FollowUp, Invoice, NewAppointmentInput, NewFollowUpInput, NewQueueInput, Patient, PatientDocument, PatientDraft, Payment, QueueEntry } from '../../types/domain';

export interface PaginatedResponse<T> { items: T[]; page: number; pageSize: number; total: number; }
export interface PatientSearchParams { query?: string; department?: Department; page?: number; pageSize?: number; }
export interface AppointmentSearchParams { department?: Department; date?: string; status?: string; page?: number; pageSize?: number; }
export interface QueueSearchParams { department?: Department; status?: QueueEntry['status']; date?: string; page?: number; pageSize?: number; }
export interface InvoiceSearchParams { department?: Department; status?: string; page?: number; pageSize?: number; }
export interface FollowUpSearchParams { department?: Department; status?: FollowUp['status']; dueBefore?: string; page?: number; pageSize?: number; }
export interface DocumentSearchParams { patientId: string; page?: number; pageSize?: number; }
export interface ReportSummaryRequest { from: string; to: string; department?: Department; }
export interface ReportSummary {
  from: string; to: string; department?: Department;
  registrations: number; appointments: number; completedVisits: number; walkIns: number;
  collections: number; outstandingBalance: number; followUpCompletion: number;
  paymentMethods: Partial<Record<Payment['method'], number>>;
  daily: { date: string; appointments: number; completedVisits: number; collections: number }[];
  departmentActivity: Partial<Record<Department, number>>;
}
export interface CreatePatientRequest extends PatientDraft { department: Department; }
export interface CreateAppointmentRequest extends NewAppointmentInput {}
export interface CreateQueueRequest extends NewQueueInput {}
export interface UpdateQueueRequest { status: QueueEntry['status']; }
export interface SaveConsultationRequest extends Omit<Partial<Consultation>, 'department' | 'id' | 'patientId'> { visitId: string; patientId: string; department: Department; }
export interface RecordPaymentRequest extends Omit<Payment, 'id' | 'paidAt'> { invoiceId: string; }
export interface CreateFollowUpRequest extends NewFollowUpInput {}
export interface UpdateFollowUpRequest { status?: FollowUp['status']; date?: string; note?: string; reminderAction?: 'two-days-before' | 'on-date' | 'manual'; }
export interface CreateVisitChargeRequest { description: string; amount: number; }
export interface QueueResponse extends QueueEntry {}
export interface ApiEntities {
  patients: PaginatedResponse<Patient>; appointments: PaginatedResponse<Appointment>; queue: PaginatedResponse<QueueEntry>;
  invoices: PaginatedResponse<Invoice>; followUps: PaginatedResponse<FollowUp>; documents: PaginatedResponse<PatientDocument>;
  charges: PaginatedResponse<ChargeItem>;
}
