export type Department = 'skin' | 'orthopaedics';
export type PortalRole = 'reception' | 'skin' | 'orthopaedics';
export type VisitType = 'New' | 'Follow-up' | 'Walk-in';
export type Gender = 'Female' | 'Male' | 'Other' | 'Prefer not to say';
export type AppointmentStatus = 'Scheduled' | 'Checked-in' | 'In progress' | 'Completed' | 'Cancelled' | 'No-show';
export type QueueStatus = 'Waiting' | 'Consulting' | 'Completed';
export type PaymentStatus = 'Paid' | 'Partial' | 'Due';
export type FollowUpStatus = 'Upcoming' | 'Completed' | 'Overdue' | 'Rescheduled' | 'Cancelled';
export type ReminderStatus = 'Not sent' | 'Queued' | 'Sent';

export interface Patient {
  id: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  email?: string;
  address: string;
  emergencyContact?: string;
  departments: Department[];
  registeredAt: string;
  latestVisitAt?: string;
}

export interface PatientDraft {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  email?: string;
  address: string;
  emergencyContact?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  department: Department;
  doctor: string;
  startsAt: string;
  visitType: VisitType;
  note?: string;
  status: AppointmentStatus;
}

export interface QueueEntry {
  id: string;
  token: string;
  patientId: string;
  visitId?: string;
  department: Department;
  doctor: string;
  arrivalAt: string;
  status: QueueStatus;
  paymentStatus: PaymentStatus;
  visitType: VisitType;
  note?: string;
  vitals?: Vitals;
}

export interface ChargeItem {
  id: string;
  description: string;
  amount: number;
  addedBy: string;
  createdAt: string;
  qty?: number;
  unitPrice?: number;
}

export interface Payment {
  id: string;
  amount: number;
  method: 'Cash' | 'UPI' | 'GPay' | 'PhonePe' | 'Card' | 'Other';
  transactionReference?: string;
  paidAt: string;
}

export interface Invoice {
  id: string;
  patientId: string;
  visitId?: string;
  department: Department;
  visitLabel: string;
  date: string;
  consultationFee: number;
  charges: ChargeItem[];
  payments: Payment[];
  total?: number;
  paid?: number;
  balance?: number;
  status?: PaymentStatus;
}

export interface Vitals {
  bloodPressure: string;
  pulse: string;
  temperature: string;
  height: string;
  weight: string;
  oxygenSaturation: string;
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  strength: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  appliedAreas?: string[];
}

export interface PrescriptionImage {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl?: string;
  url?: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  uploadedAt: string;
  dataUrl?: string;
  url?: string;
}

export interface BodyRegionTemplateData {
  region: string;
  side: 'Left' | 'Right' | 'Bilateral' | 'Not applicable';
  examinationFields: Record<string, string>;
  findings: string;
  treatmentAdvice: string;
  prescription: string;
  followUpInstructions: string;
}

export interface Consultation {
  /** The unique identifier of the consultation, which corresponds directly to the visit ID. */
  id: string;
  patientId: string;
  department: Department;
  visitedAt: string;
  vitals: Vitals;
  symptoms: string;
  medicalHistory: string;
  allergies: string;
  examination: string;
  assessment: string;
  diagnosis: string;
  treatmentPlan: string;
  prescription: PrescriptionItem[];
  prescriptionImages?: PrescriptionImage[];
  documents: PatientDocument[];
  procedures: ChargeItem[];
  followUpDate?: string;
  painLocation?: string;
  side?: 'Left' | 'Right' | 'Bilateral' | 'Not applicable';
  bodyRegionTemplate?: BodyRegionTemplateData;
  status: 'Draft' | 'Finalized';
}

export interface FollowUp {
  id: string;
  patientId: string;
  department: Department;
  doctor: string;
  date: string;
  status: FollowUpStatus;
  reminderStatus: ReminderStatus;
  note?: string;
}

export interface FeeConfiguration {
  skin: number;
  orthopaedics: number;
  currency: 'INR';
}

export interface DemoState {
  patients: Patient[];
  appointments: Appointment[];
  queue: QueueEntry[];
  invoices: Invoice[];
  consultations: Consultation[];
  followUps: FollowUp[];
  fees: FeeConfiguration;
}

export interface NewAppointmentInput {
  patientId: string;
  department: Department;
  doctor: string;
  startsAt: string;
  visitType: VisitType;
  note?: string;
}

export interface NewQueueInput {
  patientId: string;
  department: Department;
  doctor: string;
  visitType: VisitType;
  note?: string;
  vitals?: Vitals;
}

export interface NewFollowUpInput {
  patientId: string;
  department: Department;
  doctor: string;
  date: string;
  note?: string;
}
