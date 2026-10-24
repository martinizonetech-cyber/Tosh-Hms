import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCheck, ClipboardList, FileText, Printer, Save, Stethoscope } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Consultation, Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, departmentLabel, getAge, resolveDocumentUrl } from '../../utils/format';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { ClinicalNotesPanel } from './clinical/ClinicalNotesPanel';
import { PrescriptionPanel } from './clinical/PrescriptionPanel';
import { DocumentsPanel } from './clinical/DocumentsPanel';
import { ProceduresPanel } from './clinical/ProceduresPanel';
import { DoctorFollowUpPanel } from './clinical/DoctorFollowUpPanel';
import { BodyRegionTemplatesPanel } from './clinical/BodyRegionTemplatesPanel';
import { PrintLetterhead, PrintPatientMeta, PrintVitalsPanel, PrintRxTable, PrintDoctorSignatureBlock } from '../../components/shared/PrintTemplates';

const tabs = ['Clinical notes', 'Prescription', 'Documents', 'Procedures', 'Follow-up'] as const;
type Tab = typeof tabs[number];
const tabOptions = tabs.map((label) => ({ id: label, label }));
const doctorNames: Record<Department, string> = { skin: 'Dr. Sangamitra', orthopaedics: 'Dr. Sundarprakash' };
function blankVisit(patientId: string, department: Department, visitId?: string): Consultation {
  return { id: visitId ?? `DRAFT-${patientId}-${department}`, patientId, department, visitedAt: new Date().toISOString(), vitals: { bloodPressure: '', pulse: '', temperature: '', height: '', weight: '', oxygenSaturation: '' }, symptoms: '', medicalHistory: '', allergies: '', examination: '', assessment: '', diagnosis: '', treatmentPlan: '', prescription: [], prescriptionImages: [], documents: [], procedures: [], painLocation: '', side: 'Not applicable', status: 'Draft' };
}

export function ClinicalWorkspace({ department }: { department: Department }) {
  const { patientId: routePatientId } = useParams<{ patientId: string }>();
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const navigate = useNavigate();
  const role = department === 'skin' ? 'skin' : 'ortho';
  const patients = state.patients.filter((patient) => patient.departments.includes(department));
  const defaultPatient = state.queue.find((entry) => entry.department === department && entry.status !== 'Completed')?.patientId ?? patients[0]?.id;
  const selectedPatientId = routePatientId ?? defaultPatient;
  const patient = state.patients.find((entry) => entry.id === selectedPatientId);
  const selectedQueue = state.queue.find((entry) => entry.patientId === selectedPatientId && entry.department === department && entry.status !== 'Completed') ?? state.queue.find((entry) => entry.patientId === selectedPatientId && entry.department === department);
  const visitIdSupplied = selectedQueue?.visitId !== undefined;
  const queueVisitId = selectedQueue?.visitId;
  const invalidEmptyVisitId = visitIdSupplied && !queueVisitId?.trim();
  const visitCandidate = visitIdSupplied && !invalidEmptyVisitId ? state.consultations.find((visit) => visit.id === queueVisitId) : undefined;
  const visitLinkMismatch = Boolean(invalidEmptyVisitId || (visitCandidate && (visitCandidate.patientId !== selectedPatientId || visitCandidate.department !== department)));
  const savedVisit = visitIdSupplied ? (!visitLinkMismatch ? visitCandidate : undefined) : state.consultations.find((visit) => visit.patientId === selectedPatientId && visit.department === department);
  const missingVisitId = visitIdSupplied && !visitLinkMismatch && !visitCandidate ? queueVisitId : undefined;
  const [clinical, setClinical] = useState<Consultation>(() => patient ? savedVisit ?? blankVisit(patient.id, department, missingVisitId) : blankVisit('', department));
  const [tab, setTab] = useState<Tab>('Clinical notes');
  const [dirty, setDirty] = useState(false);
  const [conflictError, setConflictError] = useState(false);
  const [isLocked, setIsLocked] = useState(clinical.status === 'Finalized');

  useEffect(() => {
    if (patient) {
      const initial = savedVisit ?? blankVisit(patient.id, department, missingVisitId);
      setClinical(initial);
      setIsLocked(initial.status === 'Finalized');
      setDirty(false);
      setConflictError(false);
      setTab('Clinical notes');

      const targetVisitId = queueVisitId || initial.id;
      if (targetVisitId && !targetVisitId.startsWith('DRAFT-') && repository.getConsultation) {
        repository
          .getConsultation(targetVisitId)
          .then((fetched: Consultation) => {
            if (fetched) {
              setClinical(fetched);
              setIsLocked(fetched.status === 'Finalized');
            }
          })
          .catch((err: unknown) => {
            console.warn('Could not load consultation from repository:', err);
          });
      }
    }
  }, [selectedPatientId, selectedQueue?.id, selectedQueue?.visitId, savedVisit?.id, missingVisitId]);

  if (visitLinkMismatch) return <><PageHeading eyebrow={`${departmentLabel(department)} · Visit integrity`} title="Visit link needs review" description="No consultation from another patient or department was opened." /><Card><EmptyState title="Visit ID does not match this patient" message="The queue entry has an empty visit ID or points to a consultation assigned to a different patient or department. No changes were made. Reset the fictional demo records in Reception Settings, then reopen this visit." icon={<ClipboardList size={18} />} /></Card></>;
  if (!patient || !selectedPatientId) return <><PageHeading eyebrow={`${departmentLabel(department)} · Consultation`} title="Consultation workspace" description="Select a patient to begin a clinical record." /><Card><EmptyState title="No department patients yet" message="Register or schedule a fictional patient from Reception to start a consultation." icon={<Stethoscope size={18} />} action={<Button onClick={() => navigate('/reception/patients')}>Open patient directory</Button>} /></Card></>;

  const patch = (update: Partial<Consultation>) => {
    if (isLocked) {
      toast.push('This consultation is finalized and locked. Click "Reopen consultation" above to make changes.', 'info');
      return;
    }
    setClinical((current) => ({ ...current, ...update }));
    setDirty(true);
  };

  const save = async (status: Consultation['status'] = clinical.status) => {
    if (isLocked && status !== 'Draft') {
      toast.push('This consultation is finalized and locked. Click "Reopen consultation" to edit.', 'info');
      return;
    }
    try {
      const saved = await repository.saveConsultation(patient.id, department, { ...clinical, status });
      const nextStatus = saved?.status || status;
      setClinical((current) => ({ ...current, ...(saved || {}), status: nextStatus }));
      setIsLocked(nextStatus === 'Finalized');
      setDirty(false);
      setConflictError(false);
      toast.push(status === 'Finalized' ? 'Consultation finalized.' : 'Consultation draft saved.', 'success');
    } catch (error: any) {
      if (error?.status === 409) {
        if (error?.code === 'VISIT_LOCKED') {
          setIsLocked(true);
          toast.push('This visit is finalized and locked. Click Reopen to edit.', 'error');
          if (clinical.id) {
            repository.getConsultation(clinical.id).then((latest: Consultation) => {
              if (latest) setClinical(latest);
            }).catch(() => {});
          }
        } else if (error?.code === 'CONFLICT') {
          setConflictError(true);
          toast.push('Someone else modified this consultation record. Please reload.', 'error');
        } else {
          toast.push(error?.message || 'Conflict saving consultation.', 'error');
        }
      } else {
        toast.push(error instanceof Error ? error.message : 'Could not save consultation.', 'error');
      }
    }
  };

  const reopen = async () => {
    try {
      const saved = await repository.saveConsultation(patient.id, department, { ...clinical, status: 'Draft' });
      setClinical((current) => ({ ...current, ...(saved || {}), status: 'Draft' }));
      setIsLocked(false);
      setDirty(false);
      toast.push('Consultation reopened as Draft. You can now edit.', 'success');
    } catch (error: any) {
      toast.push(error?.message || 'Could not reopen consultation.', 'error');
    }
  };

  const reloadLatest = async () => {
    try {
      if (clinical.id) {
        const latest = await repository.getConsultation(clinical.id);
        if (latest) {
          setClinical(latest);
          setIsLocked(latest.status === 'Finalized');
          setConflictError(false);
          setDirty(false);
          toast.push('Consultation reloaded with latest version.', 'success');
        }
      }
    } catch (error: any) {
      toast.push(error?.message || 'Could not reload consultation.', 'error');
    }
  };

  const changePatient = (id: string) => {
    if (!id) return;
    if (dirty && !window.confirm('Discard unsaved consultation changes and open another patient?')) return;
    navigate(`/${role}/consultation/${id}`);
  };
  const print = (kind: 'clinical' | 'prescription') => {
    document.body.classList.add(kind === 'clinical' ? 'print-clinical' : 'print-prescription');
    window.setTimeout(() => { window.print(); document.body.classList.remove('print-clinical', 'print-prescription'); }, 60);
  };
  const nextAppointment = state.appointments.filter((item) => item.patientId === patient.id && item.department === department && !['Completed', 'Cancelled'].includes(item.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return <>
    <PageHeading eyebrow={`${departmentLabel(department)} · Clinical workspace`} title="Consultation" description="Document what the clinician observes and decides; every clinical statement and prescription stays doctor-entered." actions={<><Button variant="secondary" size="small" onClick={() => print('clinical')} icon={<Printer size={14} />}>Print summary</Button><Button variant="secondary" size="small" onClick={() => save('Draft')} disabled={isLocked} icon={<Save size={14} />}>Save draft</Button><Button size="small" onClick={() => { if (window.confirm('Finalize this consultation?')) save('Finalized'); }} disabled={isLocked} icon={<CheckCheck size={14} />}>Finalize</Button></>} />
    <div className="doctor-workspace">
      <aside className="stack sticky-card">
        <Card><SectionHeading title="Patient overview" action={<span className="clinical-summary-tag"><FileText size={14} /><Badge tone={clinical.status === 'Finalized' ? 'success' : 'warn'}>{clinical.status}</Badge></span>} /><div className="clinical-patient-name"><PatientAvatar name={patient.fullName} /><div><strong>{patient.fullName}</strong><span>{patient.id}</span></div></div><div className="profile-grid compact-profile"><div className="profile-info"><span>Age / gender</span><strong>{getAge(patient.dateOfBirth) ?? '—'} years · {patient.gender}</strong></div><div className="profile-info"><span>Phone</span><strong>{patient.phone}</strong></div><div className="profile-info"><span>Department</span><strong>{departmentLabel(department)}</strong></div><div className="profile-info"><span>Latest visit</span><strong>{patient.latestVisitAt ? formatDistanceToNow(new Date(patient.latestVisitAt), { addSuffix: true }) : 'First visit'}</strong></div></div><div className="field" style={{ marginTop: 13 }}><label htmlFor="consult-patient">Switch patient</label><select id="consult-patient" className="control" value={patient.id} onChange={(event) => changePatient(event.target.value)}>{patients.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} · {entry.id}</option>)}</select></div></Card>
        <Card><SectionHeading title="Reception-entered vitals" subtitle="Review or edit demo measurements in Clinical notes." /><div className="vitals-grid">{[['BP', clinical.vitals.bloodPressure], ['Pulse', clinical.vitals.pulse], ['Temp', clinical.vitals.temperature], ['Height', clinical.vitals.height], ['Weight', clinical.vitals.weight], ['SpO₂', clinical.vitals.oxygenSaturation]].map(([label, value]) => <div className="vital-tile" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}</div></Card>
        <Card><SectionHeading title="Visit context" /><div className="metric-list"><div className="metric-line"><span>Allergies</span><strong>{clinical.allergies || 'Not recorded'}</strong></div><div className="metric-line"><span>Next appointment</span><strong>{nextAppointment ? dateLabel(nextAppointment.startsAt, 'd MMM · h:mm a') : 'None scheduled'}</strong></div><div className="metric-line"><span>Follow-up</span><strong>{clinical.followUpDate ? dateLabel(`${clinical.followUpDate}T00:00:00`) : 'Not set'}</strong></div></div></Card>
        {department === 'orthopaedics' && (
          <BodyRegionTemplatesPanel
            consultation={clinical}
            onChange={patch}
            onPrintPrescription={() => print('prescription')}
            onSelectTab={(tabName) => setTab(tabName as any)}
          />
        )}
      </aside>
      <section className="clinical-main">
        <Tabs idPrefix="clinical" ariaLabel="Consultation sections" items={tabOptions} selected={tab} onChange={setTab} className="clinical-tabs" />
        {isLocked && (
          <div className="status-strip" role="alert" style={{ background: '#FEF3C7', color: '#92400E', padding: '10px 14px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span>This consultation is Finalized and locked against modifications.</span>
            <Button size="small" variant="secondary" onClick={reopen}>Reopen consultation</Button>
          </div>
        )}
        {conflictError && (
          <div className="status-strip" role="alert" style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span>Someone else changed this consultation record since you opened it.</span>
            <Button size="small" variant="secondary" onClick={reloadLatest}>Reload latest version</Button>
          </div>
        )}
        {dirty && !isLocked && !conflictError && <div className="status-strip" role="status"><ClipboardList size={14} /> You have unsaved changes. Save draft to keep them in the record.</div>}
        <TabPanel idPrefix="clinical" selected={tab} className="clinical-tab-content">
          {tab === 'Clinical notes' && <ClinicalNotesPanel department={department} consultation={clinical} onChange={patch} />}
          {tab === 'Prescription' && <PrescriptionPanel consultation={clinical} onChange={patch} onPrint={() => print('prescription')} department={department} />}
          {tab === 'Documents' && <DocumentsPanel patientId={patient.id} department={department} documents={clinical.documents} onChange={(documents) => patch({ documents })} />}
          {tab === 'Procedures' && <ProceduresPanel patientId={patient.id} department={department} consultation={clinical} onChange={patch} />}
          {tab === 'Follow-up' && <DoctorFollowUpPanel patientId={patient.id} department={department} doctor={doctorNames[department]} consultation={clinical} onChange={patch} />}
        </TabPanel>
        <div className="clinical-bottom-actions"><span className="field-hint">Saved in clinic database · consultation records locked once finalized.</span><div className="button-row"><Button variant="secondary" onClick={() => save('Draft')} disabled={isLocked} icon={<Save size={14} />}>Save draft</Button><Button onClick={() => save('Finalized')} disabled={isLocked} icon={<CheckCheck size={14} />}>Save as finalized</Button></div></div>
      </section>
    </div>
    {/* Printable Consultation Summary Sheet */}
    <section className="print-sheet clinical-print-sheet" aria-label="Printable consultation summary">
      <PrintLetterhead
        department={department}
        documentTitle="OUTPATIENT CONSULTATION SUMMARY & CASE RECORD"
        documentSubTitle="Official Clinical Record · TOSH Foundation"
      />
      <PrintPatientMeta
        patient={patient}
        visitedAt={clinical.visitedAt}
        doctorName={doctorNames[department]}
        tokenOrVisitLabel="OPD Consultation Record"
      />

      {clinical.diagnosis && (
        <div className="print-diagnosis-banner">
          <span className="print-diag-label">Clinical Diagnosis:</span>
          <strong className="print-diag-value">{clinical.diagnosis}</strong>
        </div>
      )}

      <PrintVitalsPanel vitals={clinical.vitals} />

      <div className="print-notes-section">
        {clinical.symptoms && (
          <div className="print-block">
            <div className="print-block-heading">Chief Complaints & Presenting Symptoms</div>
            <p className="print-block-content">{clinical.symptoms}</p>
          </div>
        )}

        {clinical.medicalHistory && (
          <div className="print-block">
            <div className="print-block-heading">Relevant Medical / Surgical History</div>
            <p className="print-block-content">{clinical.medicalHistory}</p>
          </div>
        )}

        <div className="print-block">
          <div className="print-block-heading">Allergies & Drug Reactions</div>
          <p className={`print-block-content${clinical.allergies ? ' print-allergy-alert' : ''}`}>
            {clinical.allergies ? clinical.allergies : 'No known drug allergies (NKDA)'}
          </p>
        </div>

        {clinical.examination && (
          <div className="print-block">
            <div className="print-block-heading">Physical Examination & Clinical Observations</div>
            <p className="print-block-content">{clinical.examination}</p>
          </div>
        )}

        {department === 'orthopaedics' && (clinical.painLocation || clinical.side) && (
          <div className="print-block">
            <div className="print-block-heading">Orthopaedic Body Region Assessment</div>
            <p className="print-block-content">
              <strong>Region:</strong> {clinical.painLocation || 'General musculoskeletal'} · <strong>Side:</strong> {clinical.side || 'Not specified'}
            </p>
          </div>
        )}

        {clinical.assessment && (
          <div className="print-block">
            <div className="print-block-heading">Clinical Assessment & Doctor Notes</div>
            <p className="print-block-content">{clinical.assessment}</p>
          </div>
        )}

        {clinical.treatmentPlan && (
          <div className="print-block">
            <div className="print-block-heading">Treatment Plan & Medical Advice</div>
            <p className="print-block-content">{clinical.treatmentPlan}</p>
          </div>
        )}
      </div>

      {clinical.prescription.length > 0 && (
        <div className="print-block print-no-break" style={{ marginTop: 14 }}>
          <div className="print-block-heading">Prescribed Medications (Rx)</div>
          <PrintRxTable items={clinical.prescription} />
        </div>
      )}

      <PrintDoctorSignatureBlock
        doctorName={doctorNames[department]}
        department={department}
        date={clinical.visitedAt}
      />
    </section>

    {/* Printable Prescription Sheet */}
    <section className="print-sheet prescription-print-sheet" aria-label="Printable prescription">
      <PrintLetterhead
        department={department}
        documentTitle="PRESCRIPTION / MEDICAL ORDER"
        documentSubTitle="Outpatient Pharmacy Dispensation & Administration Record"
      />
      <PrintPatientMeta
        patient={patient}
        visitedAt={clinical.visitedAt}
        doctorName={doctorNames[department]}
        tokenOrVisitLabel="Medical Prescription (Rx)"
      />

      {clinical.diagnosis && (
        <div className="print-diagnosis-banner">
          <span className="print-diag-label">Clinical Indication / Diagnosis:</span>
          <strong className="print-diag-value">{clinical.diagnosis}</strong>
        </div>
      )}

      <PrintRxTable items={clinical.prescription} />

      {clinical.prescriptionImages && clinical.prescriptionImages.length > 0 && (
        <div className="print-prescription-images-wrap">
          <div className="print-block-heading">Prescription Attachments / Scanned Pages</div>
          <div className="print-prescription-images-grid">
            {clinical.prescriptionImages.map((img, i) => {
              const isPdf = img.mimeType === 'application/pdf' || img.name.toLowerCase().endsWith('.pdf');
              return (
                <div key={img.id} className="print-prescription-img-tile">
                  {isPdf ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', background: '#F8FAFC', borderRadius: 4, border: '1px solid #CBD5E1' }}>
                      <span style={{ fontWeight: 700, color: '#DC2626', fontSize: 13, display: 'block' }}>[PDF Attachment]</span>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#334155' }}>{img.name}</p>
                    </div>
                  ) : (
                    <img src={resolveDocumentUrl(img)} alt={img.name} />
                  )}
                  <span>Attachment {i + 1}: {img.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {clinical.treatmentPlan && (
        <div className="print-block print-no-break" style={{ marginTop: 12 }}>
          <div className="print-block-heading">Advice & Instructions</div>
          <p className="print-block-content">{clinical.treatmentPlan}</p>
        </div>
      )}

      <PrintDoctorSignatureBlock
        doctorName={doctorNames[department]}
        department={department}
        date={clinical.visitedAt}
      />
    </section>
  </>;
}
