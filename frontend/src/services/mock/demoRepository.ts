import { createSeedState } from '../../data/seed';
import type { Appointment, Consultation, Department, DemoState, FollowUp, Invoice, NewAppointmentInput, NewFollowUpInput, NewQueueInput, Patient, PatientDocument, PatientDraft, Payment, PrescriptionItem, Vitals } from '../../types/domain';
import { DATA_MODE, requireDemoMode } from '../repositories/mode';
import { createBrowserDemoDocument } from '../documents/browserDocumentService';

const STORAGE_KEY = 'carehub-demo-state-v1';
const stamp = () => new Date().toISOString();
const emptyVitals = (): Vitals => ({ bloodPressure: '', pulse: '', temperature: '', height: '', weight: '', oxygenSaturation: '' });
const emptyState = (): DemoState => ({ patients: [], appointments: [], queue: [], invoices: [], consultations: [], followUps: [], fees: { skin: 700, orthopaedics: 900, currency: 'INR' } });

function initialState(): DemoState {
  if (DATA_MODE !== 'mock' || typeof window === 'undefined') return DATA_MODE === 'mock' ? createSeedState() : emptyState();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DemoState;
      if (Array.isArray(parsed.patients) && Array.isArray(parsed.appointments) && Array.isArray(parsed.invoices)) {
        parsed.appointments.forEach((a) => {
          if (a.doctor === 'Dr. Nisha Kulkarni') a.doctor = 'Dr. Sangamitra';
          if (a.doctor === 'Dr. Raghav Menon') a.doctor = 'Dr. Sundarprakash';
        });
        parsed.queue.forEach((q) => {
          if (q.doctor === 'Dr. Nisha Kulkarni') q.doctor = 'Dr. Sangamitra';
          if (q.doctor === 'Dr. Raghav Menon') q.doctor = 'Dr. Sundarprakash';
        });
        parsed.followUps?.forEach((f) => {
          if (f.doctor === 'Dr. Nisha Kulkarni') f.doctor = 'Dr. Sangamitra';
          if (f.doctor === 'Dr. Raghav Menon') f.doctor = 'Dr. Sundarprakash';
        });
        return parsed;
      }
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return createSeedState();
}

function blankConsultation(patientId: string, department: Department, id = `VIS-${Date.now()}`, vitals: Vitals = emptyVitals()): Consultation {
  return {
    id, patientId, department, visitedAt: stamp(),
    vitals,
    symptoms: '', medicalHistory: '', allergies: '', examination: '', assessment: '', diagnosis: '', treatmentPlan: '',
    prescription: [], documents: [], procedures: [], status: 'Draft',
    painLocation: '', side: 'Not applicable',
  };
}

export class DemoHospitalRepository {
  private state = initialState();
  private listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = () => this.state;

  private save(next: DemoState) {
    this.state = next;
    if (DATA_MODE === 'mock' && typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session remains usable without local persistence. */ }
    }
    this.listeners.forEach((listener) => listener());
  }

  private requireDemo() { requireDemoMode(); }
  private assertVisitId(visitId?: string) {
    if (visitId !== undefined && !visitId.trim()) throw new Error('Visit ID cannot be empty.');
  }

  resetDemoData() {
    this.requireDemo();
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    this.save(createSeedState());
  }

  addPatientAndQueue(input: PatientDraft & Omit<NewQueueInput, 'patientId'>): string {
    this.requireDemo();
    const id = `DEMO-${String(Date.now()).slice(-6)}`;
    const patient: Patient = { id, fullName: input.fullName, dateOfBirth: input.dateOfBirth, gender: input.gender, phone: input.phone, email: input.email, address: input.address, emergencyContact: input.emergencyContact, departments: [input.department], registeredAt: stamp() };
    const visitId = `VIS-${Date.now()}`;
    const queue = this.buildQueueEntry({ ...input, patientId: id }, visitId);
    const consultation = blankConsultation(id, input.department, visitId, input.vitals ?? emptyVitals());
    const invoice: Invoice = { id: `INV-${String(Date.now()).slice(-6)}`, patientId: id, visitId, department: input.department, visitLabel: `${input.department === 'skin' ? 'Skin' : 'Orthopaedics'} ${input.visitType.toLowerCase()} visit`, date: stamp(), consultationFee: this.state.fees[input.department], charges: [], payments: [] };
    this.save({ ...this.state, patients: [patient, ...this.state.patients], queue: [queue, ...this.state.queue], invoices: [invoice, ...this.state.invoices], consultations: [consultation, ...this.state.consultations] });
    return id;
  }

  addQueueEntry(input: NewQueueInput): string {
    this.requireDemo();
    const patient = this.state.patients.find((entry) => entry.id === input.patientId);
    if (!patient) throw new Error('Select a patient that exists in the demo record.');
    const visitId = `VIS-${Date.now()}`;
    const queue = this.buildQueueEntry(input, visitId);
    const patients = this.state.patients.map((entry) => entry.id === patient.id && !entry.departments.includes(input.department) ? { ...entry, departments: [...entry.departments, input.department] } : entry);
    const invoices = [{ id: `INV-${String(Date.now()).slice(-6)}`, patientId: input.patientId, visitId, department: input.department, visitLabel: `${input.department === 'skin' ? 'Skin' : 'Orthopaedics'} ${input.visitType.toLowerCase()} visit`, date: stamp(), consultationFee: this.state.fees[input.department], charges: [], payments: [] }, ...this.state.invoices];
    const consultation = blankConsultation(input.patientId, input.department, visitId, input.vitals ?? emptyVitals());
    const consultations = [consultation, ...this.state.consultations];
    this.save({ ...this.state, patients, queue: [queue, ...this.state.queue], invoices, consultations });
    return queue.id;
  }

  createPatient(input: PatientDraft, department: Department): string {
    this.requireDemo();
    const id = `DEMO-${String(Date.now()).slice(-6)}`;
    const patient: Patient = { ...input, id, departments: [department], registeredAt: stamp() };
    this.save({ ...this.state, patients: [patient, ...this.state.patients] });
    return id;
  }

  addAppointment(input: NewAppointmentInput): string {
    this.requireDemo();
    if (!this.state.patients.some((patient) => patient.id === input.patientId)) throw new Error('Select a patient that exists in the demo record.');
    const appointment: Appointment = { ...input, id: `APT-${String(Date.now()).slice(-6)}`, status: 'Scheduled' };
    this.save({ ...this.state, appointments: [appointment, ...this.state.appointments] });
    return appointment.id;
  }

  updateAppointment(id: string, patch: Partial<Appointment>) {
    this.requireDemo();
    const appointment = this.state.appointments.find((entry) => entry.id === id);
    if (!appointment) return;
    const updated = { ...appointment, ...patch };
    let queue = this.state.queue;
    let invoices = this.state.invoices;
    let consultations = this.state.consultations;
    if (updated.status === 'Checked-in' || updated.status === 'In progress' || updated.status === 'Completed') {
      const mappedStatus: DemoState['queue'][number]['status'] = updated.status === 'Checked-in' ? 'Waiting' : updated.status === 'In progress' ? 'Consulting' : 'Completed';
      const existing = queue.find((entry) => entry.id === `Q-${id}`);
      this.assertVisitId(existing?.visitId);
      if (existing && (existing.patientId !== updated.patientId || existing.department !== updated.department)) throw new Error('This queue entry does not belong to the selected appointment patient and department.');
      const visitId = existing?.visitId ?? `VIS-${updated.id}`;
      const linkedVisit = consultations.find((visit) => visit.id === visitId);
      const linkedInvoice = invoices.find((invoice) => invoice.visitId === visitId);
      if (linkedVisit && (linkedVisit.patientId !== updated.patientId || linkedVisit.department !== updated.department)) throw new Error('This visit ID does not belong to the selected appointment patient and department.');
      if (linkedInvoice && (linkedInvoice.patientId !== updated.patientId || linkedInvoice.department !== updated.department)) throw new Error('This invoice visit does not belong to the selected appointment patient and department.');
      const newEntry: DemoState['queue'][number] = { id: `Q-${id}`, visitId, vitals: existing?.vitals ?? emptyVitals(), token: `${updated.department === 'skin' ? 'S' : 'O'}-${String(queue.filter((entry) => entry.department === updated.department).length + 20).padStart(3, '0')}`, patientId: updated.patientId, department: updated.department, doctor: updated.doctor, arrivalAt: existing?.arrivalAt ?? stamp(), status: mappedStatus, paymentStatus: existing?.paymentStatus ?? 'Due', visitType: updated.visitType, note: updated.note };
      queue = existing ? queue.map((entry) => entry.id === existing.id ? newEntry : entry) : [newEntry, ...queue];
      if (!linkedVisit) consultations = [blankConsultation(updated.patientId, updated.department, visitId, newEntry.vitals), ...consultations];
      if (!linkedInvoice) invoices = [{ id: `INV-${String(Date.now()).slice(-6)}`, patientId: updated.patientId, visitId, department: updated.department, visitLabel: `${updated.department === 'skin' ? 'Skin' : 'Orthopaedics'} ${updated.visitType.toLowerCase()} visit`, date: stamp(), consultationFee: this.state.fees[updated.department], charges: [], payments: [] }, ...invoices];
    }
    this.save({ ...this.state, appointments: this.state.appointments.map((entry) => entry.id === id ? updated : entry), queue, invoices, consultations });
  }

  updateQueueEntry(id: string, status: 'Waiting' | 'Consulting' | 'Completed') {
    this.requireDemo();
    this.save({ ...this.state, queue: this.state.queue.map((entry) => entry.id === id ? { ...entry, status } : entry) });
  }

  saveConsultation(patientId: string, department: Department, patch: Partial<Consultation>) {
    this.requireDemo();
    this.assertVisitId(patch.id);
    const linked = patch.id ? this.state.consultations.find((entry) => entry.id === patch.id) : undefined;
    if (linked && (linked.patientId !== patientId || linked.department !== department)) throw new Error('This visit ID does not belong to the selected patient and department.');
    const current = patch.id ? linked ?? blankConsultation(patientId, department, patch.id) : this.state.consultations.find((entry) => entry.patientId === patientId && entry.department === department) ?? blankConsultation(patientId, department);
    const updated = { ...current, ...patch, patientId, department, visitedAt: stamp() };
    const exists = this.state.consultations.some((entry) => entry.id === updated.id);
    const consultations = exists ? this.state.consultations.map((entry) => entry.id === updated.id ? updated : entry) : [updated, ...this.state.consultations];
    const patients = this.state.patients.map((patient) => patient.id === patientId ? { ...patient, latestVisitAt: updated.visitedAt } : patient);
    this.save({ ...this.state, consultations, patients });
  }

  async getConsultation(visitId: string): Promise<Consultation> {
    const found = this.state.consultations.find((entry) => entry.id === visitId);
    if (!found) {
      throw new Error(`Consultation with ID ${visitId} not found.`);
    }
    return found;
  }

  addPrescriptionItem(patientId: string, department: Department, item: Omit<PrescriptionItem, 'id'>, visitId?: string) {
    this.requireDemo();
    this.assertVisitId(visitId);
    const linked = visitId ? this.state.consultations.find((entry) => entry.id === visitId) : undefined;
    if (linked && (linked.patientId !== patientId || linked.department !== department)) throw new Error('This visit ID does not belong to the selected patient and department.');
    const visit = visitId ? linked ?? blankConsultation(patientId, department, visitId) : this.state.consultations.find((entry) => entry.patientId === patientId && entry.department === department) ?? blankConsultation(patientId, department);
    this.saveConsultation(patientId, department, { id: visit.id, prescription: [...visit.prescription, { ...item, id: `RX-${Date.now()}` }] });
  }

  addServiceCharge(patientId: string, department: Department, description: string, amount: number, addedBy: string, visitId?: string) {
    this.requireDemo();
    this.assertVisitId(visitId);
    if (amount <= 0) throw new Error('Charge must be greater than zero.');
    const charge = { id: `CH-${Date.now()}`, description, amount, addedBy, createdAt: stamp() };
    const linkedInvoice = visitId ? this.state.invoices.find((entry) => entry.visitId === visitId) : undefined;
    if (linkedInvoice && (linkedInvoice.patientId !== patientId || linkedInvoice.department !== department)) throw new Error('This invoice visit does not belong to the selected patient and department.');
    const invoice = visitId ? linkedInvoice : this.state.invoices.find((entry) => entry.patientId === patientId && entry.department === department);
    const invoices = invoice ? this.state.invoices.map((entry) => entry.id === invoice.id ? { ...entry, charges: [...entry.charges, charge] } : entry) : [{ id: `INV-${String(Date.now()).slice(-6)}`, patientId, visitId, department, visitLabel: `${department === 'skin' ? 'Skin' : 'Orthopaedics'} visit`, date: stamp(), consultationFee: this.state.fees[department], charges: [charge], payments: [] }, ...this.state.invoices];
    const linkedVisit = visitId ? this.state.consultations.find((entry) => entry.id === visitId) : undefined;
    if (linkedVisit && (linkedVisit.patientId !== patientId || linkedVisit.department !== department)) throw new Error('This visit ID does not belong to the selected patient and department.');
    const visit = visitId ? linkedVisit ?? blankConsultation(patientId, department, visitId) : this.state.consultations.find((entry) => entry.patientId === patientId && entry.department === department) ?? blankConsultation(patientId, department);
    const consultations = this.state.consultations.some((entry) => entry.id === visit.id)
      ? this.state.consultations.map((entry) => entry.id === visit.id ? { ...entry, procedures: [...entry.procedures, charge] } : entry)
      : [{ ...visit, procedures: [charge] }, ...this.state.consultations];
    this.save({ ...this.state, invoices, consultations });
  }

  recordPayment(invoiceId: string, payment: Omit<Payment, 'id' | 'paidAt'>) {
    this.requireDemo();
    const invoice = this.state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) throw new Error('Invoice could not be found.');
    this.assertVisitId(invoice.visitId);
    const total = invoice.consultationFee + invoice.charges.reduce((sum, charge) => sum + charge.amount, 0);
    const paid = invoice.payments.reduce((sum, item) => sum + item.amount, 0);
    if (payment.amount > total - paid) throw new Error('Payment amount cannot exceed the remaining invoice balance.');
    const updated: Invoice = { ...invoice, payments: [...invoice.payments, { ...payment, id: `PAY-${Date.now()}`, paidAt: stamp() }] };
    const linkedQueue = invoice.visitId ? this.state.queue.find((entry) => entry.visitId === invoice.visitId && entry.patientId === invoice.patientId && entry.department === invoice.department) : this.state.queue.filter((entry) => entry.patientId === invoice.patientId && entry.department === invoice.department).sort((a, b) => b.arrivalAt.localeCompare(a.arrivalAt))[0];
    const queue = this.state.queue.map((entry) => entry.id === linkedQueue?.id ? { ...entry, paymentStatus: updated.payments.reduce((sum, item) => sum + item.amount, 0) >= total ? 'Paid' as const : 'Partial' as const } : entry);
    this.save({ ...this.state, invoices: this.state.invoices.map((entry) => entry.id === invoiceId ? updated : entry), queue });
  }

  addFollowUp(input: NewFollowUpInput) {
    this.requireDemo();
    const followUp: FollowUp = { ...input, id: `FU-${Date.now()}`, status: 'Upcoming', reminderStatus: 'Not sent' };
    this.save({ ...this.state, followUps: [followUp, ...this.state.followUps] });
    return followUp.id;
  }

  updateFollowUp(id: string, patch: Partial<FollowUp>) {
    this.requireDemo();
    this.save({ ...this.state, followUps: this.state.followUps.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
  }

  addDocuments(
    patientId: string,
    department: Department,
    documents: Array<Omit<PatientDocument, 'id' | 'patientId' | 'uploadedAt'> | PatientDocument>,
    visitId?: string,
    queueId?: string
  ): PatientDocument[] {
    this.requireDemo();
    let effectiveVisitId = visitId;
    let queue = this.state.queue;

    if (queueId) {
      const qEntry = queue.find((q) => q.id === queueId);
      if (qEntry) {
        if (!effectiveVisitId && qEntry.visitId) {
          effectiveVisitId = qEntry.visitId;
        } else if (!effectiveVisitId) {
          effectiveVisitId = `VIS-${Date.now()}`;
          queue = queue.map((q) => (q.id === queueId ? { ...q, visitId: effectiveVisitId } : q));
        }
      }
    }

    this.assertVisitId(effectiveVisitId);
    const linked = effectiveVisitId
      ? this.state.consultations.find((entry) => entry.id === effectiveVisitId)
      : undefined;

    if (linked && (linked.patientId !== patientId || linked.department !== department)) {
      throw new Error('This visit ID does not belong to the selected patient and department.');
    }

    const visit = effectiveVisitId
      ? (linked ?? blankConsultation(patientId, department, effectiveVisitId))
      : (this.state.consultations.find((entry) => entry.patientId === patientId && entry.department === department) ??
         blankConsultation(patientId, department));

    const newEntries: PatientDocument[] = documents.map((doc, idx) => ({
      ...doc,
      id: ('id' in doc && doc.id) ? doc.id : `DOC-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      patientId,
      uploadedAt: ('uploadedAt' in doc && doc.uploadedAt) ? doc.uploadedAt : stamp(),
    }));

    const updated = { ...visit, documents: [...visit.documents, ...newEntries] };
    const exists = this.state.consultations.some((item) => item.id === visit.id);
    const consultations = exists
      ? this.state.consultations.map((item) => (item.id === visit.id ? updated : item))
      : [updated, ...this.state.consultations];

    this.save({ ...this.state, queue, consultations });
    return newEntries;
  }

  addDocument(
    patientId: string,
    department: Department,
    document: Omit<PatientDocument, 'id' | 'patientId' | 'uploadedAt'> | PatientDocument,
    visitId?: string,
    queueId?: string
  ): PatientDocument {
    return this.addDocuments(patientId, department, [document], visitId, queueId)[0];
  }

  removeDocument(patientId: string, department?: Department, documentId?: string, visitId?: string) {
    this.requireDemo();
    if (!documentId) return;
    this.assertVisitId(visitId);
    const target = visitId
      ? this.state.consultations.find((visit) => visit.id === visitId)
      : this.state.consultations.find(
          (visit) =>
            visit.patientId === patientId &&
            (!department || visit.department === department) &&
            visit.documents.some((document) => document.id === documentId)
        );
    if (!target) throw new Error('The document visit could not be found.');
    if (target.patientId !== patientId) throw new Error('This visit does not belong to the selected patient.');
    if (!target.documents.some((document) => document.id === documentId)) throw new Error('The document could not be found in this visit.');
    this.save({
      ...this.state,
      consultations: this.state.consultations.map((visit) =>
        visit.id === target.id ? { ...visit, documents: visit.documents.filter((document) => document.id !== documentId) } : visit
      ),
    });
  }

  async uploadDocument(patientId: string, category: string, file: File, visitId?: string, name?: string): Promise<PatientDocument> {
    const doc = await createBrowserDemoDocument(file, patientId, category, name);
    this.addDocuments(patientId, 'skin', [doc], visitId);
    return doc;
  }

  async renameDocument(id: string, name: string): Promise<PatientDocument> {
    let updatedDoc: PatientDocument | null = null;
    this.save({
      ...this.state,
      consultations: this.state.consultations.map((visit) => ({
        ...visit,
        documents: visit.documents.map((d) => {
          if (d.id === id) {
            updatedDoc = { ...d, name };
            return updatedDoc;
          }
          return d;
        }),
      })),
    });
    if (!updatedDoc) {
      updatedDoc = {
        id,
        patientId: '',
        name,
        category: 'Other',
        mimeType: 'application/octet-stream',
        size: 0,
        uploadedAt: new Date().toISOString(),
      };
    }
    return updatedDoc;
  }

  async deleteDocument(id: string): Promise<void> {
    this.save({
      ...this.state,
      consultations: this.state.consultations.map((visit) => ({
        ...visit,
        documents: visit.documents.filter((d) => d.id !== id),
        prescriptionImages: (visit.prescriptionImages || []).filter((p) => p.id !== id),
      })),
    });
  }

  updateFee(department: Department, amount: number) {
    this.requireDemo();
    if (amount < 0) throw new Error('A fee cannot be negative.');
    this.save({ ...this.state, fees: { ...this.state.fees, [department]: amount } });
  }

  private buildQueueEntry(input: NewQueueInput, visitId: string) {
    const prefix = input.department === 'skin' ? 'S' : 'O';
    const highest = this.state.queue.filter((entry) => entry.department === input.department).reduce((max, entry) => Math.max(max, Number(entry.token.split('-')[1]) || 0), 0);
    return { id: `Q-${Date.now()}`, visitId, vitals: input.vitals ?? emptyVitals(), token: `${prefix}-${String(highest + 1).padStart(3, '0')}`, patientId: input.patientId, department: input.department, doctor: input.doctor, arrivalAt: stamp(), status: 'Waiting' as const, paymentStatus: 'Due' as const, visitType: input.visitType, note: input.note };
  }
}

export const demoRepository = new DemoHospitalRepository();
