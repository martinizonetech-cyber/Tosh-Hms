import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type {
  Appointment,
  Consultation,
  Department,
  FeeConfiguration,
  FollowUp,
  Invoice,
  Patient,
  PatientDocument,
  Payment,
  QueueEntry,
} from '../../types/domain';
import { useAuth } from '../auth/AuthContext';
import { hospitalApi } from './hospitalApi';
import { requestJson } from './httpClient';

export interface ApiHospitalState {
  patients: Patient[];
  appointments: Appointment[];
  queue: QueueEntry[];
  invoices: Invoice[];
  consultations: Consultation[];
  followUps: FollowUp[];
  fees: FeeConfiguration;
}

interface ApiContextValue {
  state: ApiHospitalState;
  repository: any;
  mode: 'api';
  refetch: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const ApiDataContext = createContext<ApiContextValue | null>(null);

const DEFAULT_STATE: ApiHospitalState = {
  patients: [],
  appointments: [],
  queue: [],
  invoices: [],
  consultations: [],
  followUps: [],
  fees: { skin: 700, orthopaedics: 900, currency: 'INR' },
};

export function ApiProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [state, setState] = useState<ApiHospitalState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClinicData = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const isReception = user.role === 'reception';
      const [patientsRes, apptsRes, queueRes, invoicesRes, followUpsRes, visitsRes, feesRes] = await Promise.all([
        hospitalApi.listPatients({ pageSize: 100 }),
        hospitalApi.listAppointments({ pageSize: 100 }),
        hospitalApi.listQueue({ pageSize: 100 }),
        hospitalApi.listInvoices({ pageSize: 100 }),
        hospitalApi.listFollowUps({ pageSize: 100 }),
        hospitalApi.listVisits({ pageSize: 100 }),
        isReception ? requestJson<FeeConfiguration>('/settings/fees') : Promise.resolve({ skin: 700, orthopaedics: 900, currency: 'INR' as const }),
      ]);

      setState((prev) => ({
        ...prev,
        patients: patientsRes.items,
        appointments: apptsRes.items,
        queue: queueRes.items,
        invoices: invoicesRes.items,
        followUps: followUpsRes.items,
        consultations: visitsRes.items,
        fees: feesRes,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch clinic data from API.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      fetchClinicData();
    }
  }, [user]);

  const repository = useMemo(() => {
    return {
      // Patients
      listPatients: hospitalApi.listPatients,
      createPatient: async (input: any) => {
        const created = await hospitalApi.createPatient(input);
        await fetchClinicData();
        return created;
      },

      // Appointments
      listAppointments: hospitalApi.listAppointments,
      scheduleAppointment: async (input: any) => {
        const created = await hospitalApi.scheduleAppointment(input);
        await fetchClinicData();
        return created;
      },
      addAppointment: async (input: any) => {
        const created = await hospitalApi.scheduleAppointment(input);
        await fetchClinicData();
        return created.id;
      },
      updateAppointment: async (id: string, patch: Partial<Appointment>) => {
        const updated = await hospitalApi.updateAppointment(id, patch);
        await fetchClinicData();
        return updated;
      },

      // Queue
      listQueue: hospitalApi.listQueue,
      createQueue: async (input: any) => {
        const created = await hospitalApi.createQueue(input);
        await fetchClinicData();
        return created;
      },
      addQueueEntry: async (input: any) => {
        const entry = await hospitalApi.createQueue(input);
        await fetchClinicData();
        return entry.id;
      },
      addPatientAndQueue: async (input: any) => {
        const patient = await hospitalApi.createPatient({
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          phone: input.phone,
          email: input.email,
          address: input.address,
          emergencyContact: input.emergencyContact,
          department: input.department,
        });
        await hospitalApi.createQueue({
          patientId: patient.id,
          department: input.department,
          doctor: input.doctor,
          visitType: input.visitType,
          vitals: input.vitals,
          note: input.note,
        });
        await fetchClinicData();
        return patient.id;
      },
      updateQueueEntry: async (id: string, patch: any) => {
        const payload = typeof patch === 'string' ? { status: patch } : patch;
        const updated = await hospitalApi.updateQueueEntry(id, payload);
        await fetchClinicData();
        return updated;
      },
      updateVitals: async (visitId: string, vitalsInput: any) => {
        const res = await requestJson<any>(`/visits/${encodeURIComponent(visitId)}/vitals`, {
          method: 'PATCH',
          body: JSON.stringify(vitalsInput),
        });
        await fetchClinicData();
        return res;
      },

      // Invoices & Billing
      listInvoices: hospitalApi.listInvoices,
      addPayment: async (invoiceId: string, paymentInput: any) => {
        const idempotencyKey = `pay-${invoiceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const res = await requestJson<Payment>(`/invoices/${encodeURIComponent(invoiceId)}/payments`, {
          method: 'POST',
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(paymentInput),
        });
        await fetchClinicData();
        return res;
      },
      recordRefund: async (invoiceId: string, refundInput: any) => {
        const res = await requestJson<any>(`/invoices/${encodeURIComponent(invoiceId)}/refunds`, {
          method: 'POST',
          body: JSON.stringify(refundInput),
        });
        await fetchClinicData();
        return res;
      },
      recordPayment: async (invoiceIdOrInput: any, maybePayment?: any) => {
        let payment: Payment;
        if (typeof invoiceIdOrInput === 'string') {
          const idempotencyKey = `pay-${invoiceIdOrInput}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          payment = await requestJson<Payment>(`/invoices/${encodeURIComponent(invoiceIdOrInput)}/payments`, {
            method: 'POST',
            headers: {
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(maybePayment),
          });
        } else {
          payment = await hospitalApi.recordPayment(invoiceIdOrInput);
        }
        await fetchClinicData();
        return payment;
      },

      // Consultations
      listVisits: hospitalApi.listVisits,
      getConsultation: async (visitId: string) => {
        const consult = await hospitalApi.getConsultation(visitId);
        setState((prev) => {
          const exists = prev.consultations.some((c) => c.id === consult.id);
          return {
            ...prev,
            consultations: exists
              ? prev.consultations.map((c) => (c.id === consult.id ? consult : c))
              : [consult, ...prev.consultations],
          };
        });
        return consult;
      },
      saveConsultation: async (patientIdOrInput: any, departmentOrPatch?: any, patch?: any) => {
        let payload: any;
        if (typeof patientIdOrInput === 'string') {
          const patientId = patientIdOrInput;
          const department = departmentOrPatch;
          const update = patch || {};
          const visitId = update.id;
          payload = {
            visitId,
            patientId,
            department,
            version: update.version,
            symptoms: update.symptoms ?? '',
            medicalHistory: update.medicalHistory ?? '',
            allergies: update.allergies ?? '',
            examination: update.examination ?? '',
            assessment: update.assessment ?? '',
            diagnosis: update.diagnosis ?? '',
            treatmentPlan: update.treatmentPlan ?? '',
            prescription: (update.prescription || []).map((p: any) => ({
              id: p.id,
              medicineName: p.medicineName || '',
              strength: p.strength || '',
              dosage: p.dosage || '',
              route: p.route || '',
              frequency: p.frequency || '',
              duration: p.duration || '',
              instructions: p.instructions || '',
            })),
            followUpDate: update.followUpDate || undefined,
            painLocation: update.painLocation || undefined,
            side: update.side || undefined,
            bodyRegionTemplate: update.bodyRegionTemplate || undefined,
            status: update.status || 'Draft',
          };
        } else {
          payload = patientIdOrInput;
        }

        const saved = await hospitalApi.saveConsultation(payload);
        setState((prev) => {
          const exists = prev.consultations.some((c) => c.id === saved.id);
          return {
            ...prev,
            consultations: exists
              ? prev.consultations.map((c) => (c.id === saved.id ? saved : c))
              : [saved, ...prev.consultations],
            patients: prev.patients.map((p) =>
              p.id === saved.patientId ? { ...p, latestVisitAt: saved.visitedAt } : p,
            ),
          };
        });
        await fetchClinicData();
        return saved;
      },

      // Charges & Procedures
      addVisitCharge: hospitalApi.addVisitCharge,
      addServiceCharge: async (
        _patientId: string,
        _department: Department,
        description: string,
        amount: number,
        _addedBy: string,
        visitId?: string,
      ) => {
        if (!visitId) throw new Error('Visit ID is required to add a clinical charge in API mode.');
        const charge = await hospitalApi.addVisitCharge(visitId, { description, amount });
        await fetchClinicData();
        return charge;
      },

      // Follow-ups
      listFollowUps: hospitalApi.listFollowUps,
      createFollowUp: async (input: any) => {
        const created = await hospitalApi.createFollowUp(input);
        await fetchClinicData();
        return created;
      },
      addFollowUp: async (input: any) => {
        const created = await hospitalApi.createFollowUp(input);
        await fetchClinicData();
        return created.id;
      },
      updateFollowUp: async (id: string, patch: any) => {
        const updated = await hospitalApi.updateFollowUp(id, patch);
        await fetchClinicData();
        return updated;
      },

      // Documents
      listDocuments: hospitalApi.listDocuments,
      uploadDocument: async (patientId: string, category: string, file: File, visitId?: string, name?: string) => {
        const doc = await hospitalApi.uploadDocument(patientId, category, file, visitId, name);
        await fetchClinicData();
        return doc;
      },
      renameDocument: async (id: string, name: string) => {
        const doc = await hospitalApi.renameDocument(id, name);
        await fetchClinicData();
        return doc;
      },
      deleteDocument: async (id: string) => {
        await hospitalApi.deleteDocument(id);
        await fetchClinicData();
      },
      removeDocument: async (_patientId: string, _department?: Department, documentId?: string, _visitId?: string) => {
        if (documentId) {
          await hospitalApi.deleteDocument(documentId);
          await fetchClinicData();
        }
      },
      addDocuments: async (
        patientId: string,
        _department: Department,
        documents: Array<any>,
        visitId?: string,
      ) => {
        const results: PatientDocument[] = [];
        for (const doc of documents) {
          if (doc.file instanceof File) {
            const uploaded = await hospitalApi.uploadDocument(patientId, doc.category || 'Clinical note', doc.file, visitId, doc.name);
            results.push(uploaded);
          } else if (doc instanceof File) {
            const uploaded = await hospitalApi.uploadDocument(patientId, 'Clinical note', doc, visitId);
            results.push(uploaded);
          }
        }
        await fetchClinicData();
        return results;
      },

      // Settings
      updateFee: async (department: Department, amount: number) => {
        const updated = await requestJson<FeeConfiguration>(`/settings/fees/${department}`, {
          method: 'PUT',
          body: JSON.stringify({ amount, currency: 'INR' }),
        });
        setState((prev) => ({ ...prev, fees: updated }));
        return updated;
      },

      // Reports
      getReportSummary: hospitalApi.getReportSummary,
    };
  }, [user]);

  const value = useMemo(
    () => ({
      state,
      repository,
      mode: 'api' as const,
      refetch: fetchClinicData,
      isLoading,
      error,
    }),
    [state, repository, isLoading, error],
  );

  return <ApiDataContext.Provider value={value}>{children}</ApiDataContext.Provider>;
}

export function useApiData() {
  const context = useContext(ApiDataContext);
  if (!context) {
    throw new Error('useApiData must be used within an ApiProvider');
  }
  return context;
}
