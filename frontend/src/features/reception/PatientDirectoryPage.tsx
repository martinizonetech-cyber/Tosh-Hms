import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isSameDay, startOfDay } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Image as ImageIcon,
  Plus,
  Search,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { Patient, PatientDocument } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { dateLabel, departmentLabel, downloadFile, money, patientInvoiceTotals, resolveDocumentUrl, resolveInlineDocumentUrl } from '../../utils/format';
import { matchesPatient } from '../../utils/patientSearch';
import { useToast } from '../../components/ui/Toast';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { PatientDocumentsModal } from '../../components/shared/PatientDocumentsModal';

type ProfileTab = 'Overview' | 'Appointments' | 'Visit history' | 'Prescriptions & Documents' | 'Invoices and payments' | 'Follow-ups';

export function PatientDirectoryPage() {
  const { state } = useHospitalData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [department, setDepartment] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateMode, setDateMode] = useState<'activity' | 'registered' | 'visit'>('activity');

  useEffect(() => { setQuery(params.get('q') ?? ''); }, [params]);

  const dateMove = (days: number) => {
    const base = dateFilter ? new Date(`${dateFilter}T00:00:00`) : new Date();
    base.setDate(base.getDate() + days);
    setDateFilter(format(base, 'yyyy-MM-dd'));
    setPage(1);
  };

  const matches = useMemo(() => {
    const targetDate = dateFilter ? startOfDay(new Date(`${dateFilter}T00:00:00`)) : null;

    return state.patients
      .filter((patient) => {
        if (!matchesPatient(patient, query)) return false;

        if (department !== 'all' && !patient.departments.includes(department as 'skin' | 'orthopaedics')) {
          return false;
        }

        // When a search query is typed, search across the entire directory without restricting to today's date
        if (targetDate && !query.trim()) {
          const registeredMatches = patient.registeredAt && isSameDay(new Date(patient.registeredAt), targetDate);
          const latestVisitMatches = patient.latestVisitAt && isSameDay(new Date(patient.latestVisitAt), targetDate);

          if (dateMode === 'registered') {
            return registeredMatches;
          }
          if (dateMode === 'visit') {
            const hasConsultation = state.consultations.some(
              (c) => c.patientId === patient.id && isSameDay(new Date(c.visitedAt), targetDate)
            );
            return latestVisitMatches || hasConsultation;
          }

          const hasConsultation = state.consultations.some(
            (c) => c.patientId === patient.id && isSameDay(new Date(c.visitedAt), targetDate)
          );
          const hasAppointment = state.appointments.some(
            (a) => a.patientId === patient.id && isSameDay(new Date(a.startsAt), targetDate)
          );
          const hasQueue = state.queue.some(
            (q) => q.patientId === patient.id && isSameDay(new Date(q.arrivalAt), targetDate)
          );

          return registeredMatches || latestVisitMatches || hasConsultation || hasAppointment || hasQueue;
        }

        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [dateFilter, dateMode, department, query, state.appointments, state.consultations, state.patients, state.queue]);

  const { page, setPage, pageSize, setPageSize, pagedItems: visible, total } = usePagination(matches, 6);
  const setSearch = (value: string) => { setPage(1); setQuery(value); setParams(value ? { q: value } : {}); };

  return <>
    <PageHeading eyebrow="Reception · Records" title="All patients" description="Patient clinical records with visit history, appointments, invoices and follow-ups." actions={<Badge tone="info">{state.patients.length} patients</Badge>} />
    <Card padded={false}>
      <div style={{ padding: '19px 20px 0' }}>
        <SectionHeading
          title="Patients directory"
          subtitle={`${matches.length} ${matches.length === 1 ? 'patient' : 'patients'} registered in system`}
        />
      </div>
      <div className="schedule-date-toolbar">
        <div className="date-navigation">
          <Button
            variant="secondary"
            size="small"
            aria-label="Previous day"
            onClick={() => dateMove(-1)}
            icon={<ArrowLeft size={14} />}
          >
            Previous
          </Button>
          <label className="date-display">
            <CalendarDays size={15} />
            <input
              aria-label="Choose patient date"
              type="date"
              value={dateFilter}
              onChange={(event) => { setDateFilter(event.target.value); setPage(1); }}
            />
            <Clock3 size={14} />
            <strong>{dateFilter ? dateLabel(`${dateFilter}T00:00:00`) : 'All dates'}</strong>
          </label>
          <Button
            variant="secondary"
            size="small"
            aria-label="Next day"
            onClick={() => dateMove(1)}
            icon={<ArrowRight size={14} />}
          >
            Next
          </Button>
          <Button
            variant={dateFilter === format(new Date(), 'yyyy-MM-dd') ? 'secondary' : 'ghost'}
            size="small"
            onClick={() => { setDateFilter(format(new Date(), 'yyyy-MM-dd')); setPage(1); }}
          >
            Today
          </Button>
          {dateFilter && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => { setDateFilter(''); setPage(1); }}
              title="Clear date filter to view all patients"
            >
              All dates
            </Button>
          )}
        </div>
        <div className="toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search patients"
              placeholder="Name, patient ID, phone or email"
              value={query}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            aria-label="Filter patients by department"
            className="select-field"
            value={department}
            onChange={(event) => { setDepartment(event.target.value); setPage(1); }}
          >
            <option value="all">All departments</option>
            <option value="skin">Skin</option>
            <option value="orthopaedics">Orthopaedics</option>
          </select>
          <select
            aria-label="Filter by date activity"
            className="select-field"
            value={dateMode}
            onChange={(event) => { setDateMode(event.target.value as 'activity' | 'registered' | 'visit'); setPage(1); }}
          >
            <option value="activity">Active / Visited / Reg</option>
            <option value="registered">Registered on date</option>
            <option value="visit">Visited on date</option>
          </select>
          <span className="result-count">{matches.length} {matches.length === 1 ? 'patient' : 'patients'}</span>
        </div>
      </div>
      {matches.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Patient</th><th>Phone</th><th>Departments</th><th>Latest visit</th><th>Registered</th><th className="actions-col" style={{ textAlign: 'center', width: 140 }}>Actions</th></tr></thead><tbody>{visible.map((patient, index) => { const serialNo = (page - 1) * pageSize + index + 1; return <tr key={patient.id}><td className="serial-cell">{serialNo}</td><td><button className="patient-link" type="button" onClick={() => setSelectedPatient(patient)}><span className="patient-cell"><PatientAvatar name={patient.fullName} small /><span><strong>{patient.fullName}</strong><span>{patient.id}</span></span></span></button></td><td>{patient.phone}</td><td><div className="department-tags">{patient.departments.map((dept) => <Badge key={dept} tone="info">{dept === 'skin' ? 'Skin' : 'Orthopaedics'}</Badge>)}</div></td><td>{patient.latestVisitAt ? dateLabel(patient.latestVisitAt) : 'No visit yet'}</td><td>{dateLabel(patient.registeredAt)}</td><td className="actions-cell" style={{ textAlign: 'center' }}><Button variant="ghost" size="small" onClick={() => setSelectedPatient(patient)}>View profile</Button></td></tr>; })}</tbody></table></div>
        <div className="patient-card-list directory-card-list">{visible.map((patient, index) => { const serialNo = (page - 1) * pageSize + index + 1; return <article className="patient-card" key={patient.id}><div className="patient-card-head"><div className="patient-card-name"><span className="serial-cell" style={{ marginRight: 6 }}>#{serialNo}</span><PatientAvatar name={patient.fullName} /><div><strong>{patient.fullName}</strong><span>{patient.id}</span></div></div><Button variant="ghost" size="small" onClick={() => setSelectedPatient(patient)}>Details</Button></div><div className="patient-card-meta"><div><small>Phone</small><strong>{patient.phone}</strong></div><div><small>Latest visit</small><strong>{patient.latestVisitAt ? dateLabel(patient.latestVisitAt) : 'No visit yet'}</strong></div></div><div className="department-tags" style={{ marginTop: 12 }}>{patient.departments.map((dept) => <Badge key={dept} tone="info">{dept === 'skin' ? 'Skin' : 'Orthopaedics'}</Badge>)}</div></article>; })}</div>
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </> : <EmptyState title="No patients found" message="Try another search term or choose a different date filter." icon={<UserRound size={18} />} action={dateFilter ? <Button size="small" onClick={() => { setDateFilter(''); setPage(1); }}>Show all dates</Button> : undefined} />}
    </Card>
    <ProfileModal patient={selectedPatient} onClose={() => setSelectedPatient(null)} />
  </>;
}

function ProfileModal({ patient, onClose }: { patient: Patient | null; onClose: () => void }) {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [tab, setTab] = useState<ProfileTab>('Overview');
  const [previewDoc, setPreviewDoc] = useState<PatientDocument | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => { if (patient) setTab('Overview'); }, [patient?.id]);
  if (!patient) return null;

  const appointments = state.appointments.filter((item) => item.patientId === patient.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const visits = state.consultations.filter((item) => item.patientId === patient.id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
  const invoices = state.invoices.filter((item) => item.patientId === patient.id);
  const followups = state.followUps.filter((item) => item.patientId === patient.id);

  const patientDocs = visits.flatMap((visit) =>
    visit.documents.map((doc) => ({
      ...doc,
      department: visit.department,
      visitedAt: visit.visitedAt,
      visitId: visit.id,
    }))
  ).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const removeDoc = (docId: string, visitId: string) => {
    if (!window.confirm('Remove this document from the patient record?')) return;
    try {
      repository.removeDocument(patient.id, undefined, docId, visitId);
      toast.push('Document removed from record.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not remove document.', 'error');
    }
  };

  const tabs: ProfileTab[] = ['Overview', 'Appointments', 'Visit history', 'Prescriptions & Documents', 'Invoices and payments', 'Follow-ups'];

  return <>
    <Modal open title={patient.fullName} subtitle={`${patient.id} · Registered ${dateLabel(patient.registeredAt)}`} onClose={onClose} wide>
      <div className="profile-intro">
        <PatientAvatar name={patient.fullName} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{patient.fullName}</strong>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {patient.gender} · {patient.dateOfBirth ? `${new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} years` : 'Age not recorded'} · {patient.phone}
          </span>
          <div className="department-tags" style={{ marginTop: 4 }}>
            {patient.departments.map((dept) => <Badge key={dept} tone="info">{departmentLabel(dept)}</Badge>)}
          </div>
        </div>
      </div>
      <Tabs idPrefix="profile" ariaLabel="Patient profile sections" items={tabs.map((label) => ({ id: label, label: label === 'Prescriptions & Documents' ? `Prescriptions & Docs (${patientDocs.length})` : label }))} selected={tab} onChange={setTab} />
      <TabPanel idPrefix="profile" selected={tab} className="profile-tab-panel">
        {tab === 'Overview' && <div className="profile-grid"><div className="profile-info"><span>Patient ID</span><strong>{patient.id}</strong></div><div className="profile-info"><span>Phone</span><strong>{patient.phone}</strong></div><div className="profile-info"><span>Email</span><strong>{patient.email || 'Not provided'}</strong></div><div className="profile-info"><span>Address</span><strong>{patient.address}</strong></div><div className="profile-info"><span>Emergency contact</span><strong>{patient.emergencyContact || 'Not provided'}</strong></div><div className="profile-info"><span>Latest visit</span><strong>{patient.latestVisitAt ? formatDistanceToNow(new Date(patient.latestVisitAt), { addSuffix: true }) : 'No visits yet'}</strong></div></div>}
        {tab === 'Appointments' && <HistoryList items={appointments.map((item) => ({ title: dateLabel(item.startsAt, 'd MMM yyyy · h:mm a'), detail: `${departmentLabel(item.department)} · ${item.visitType} · ${item.doctor}`, status: item.status }))} empty="No appointments recorded for this patient." />}
        {tab === 'Visit history' && (visits.length ? (
          <div className="profile-history">
            {visits.map((visit) => (
              <div className="list-row" key={visit.id} style={{ alignItems: 'flex-start' }}>
                <div className="list-row-main">
                  <strong>{departmentLabel(visit.department)} consultation</strong>
                  <span>{dateLabel(visit.visitedAt)} · {visit.diagnosis || 'Diagnosis not entered'}{visit.assessment ? ` · ${visit.assessment}` : ''}</span>
                  {visit.documents.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {visit.documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#EAF4F6',
                            border: '1px solid #C4DDE2',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '11px',
                            color: '#0B5351',
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={11} /> {doc.category}: {doc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Badge tone={statusTone(visit.status)}>{visit.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing to show yet" message="No consultation notes in the demo record." icon={<FileText size={18} />} />
        ))}
        {tab === 'Prescriptions & Documents' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {patientDocs.length} total document{patientDocs.length === 1 ? '' : 's'} across all visits and queue check-ins
              </span>
              <Button size="small" onClick={() => setShowUploadModal(true)} icon={<Plus size={14} />}>
                Upload document
              </Button>
            </div>
            {patientDocs.length ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {patientDocs.map((doc) => {
                  const isImage = doc.mimeType.startsWith('image/');
                  const isPdf = doc.mimeType === 'application/pdf';
                  return (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        border: '1px solid #E2ECF0',
                        borderRadius: '8px',
                        background: '#FAFDFE',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: isImage ? '#EEF5F7' : '#FDF0EE',
                            border: '1px solid #DCE6EA',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                            cursor: resolveDocumentUrl(doc) ? 'pointer' : 'default',
                          }}
                          onClick={() => resolveDocumentUrl(doc) && setPreviewDoc(doc)}
                        >
                          {isImage && resolveDocumentUrl(doc) ? (
                            <img src={resolveDocumentUrl(doc)} alt={doc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : isPdf ? (
                            <FileText size={18} color="#C83E4D" />
                          ) : (
                            <ImageIcon size={18} color="#177E89" />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{doc.name}</strong>
                            <Badge tone={doc.category.toLowerCase().includes('prescription') ? 'success' : 'info'}>{doc.category}</Badge>
                            <Badge tone="neutral">{departmentLabel(doc.department)}</Badge>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                            Uploaded {dateLabel(doc.uploadedAt, 'd MMM yyyy · h:mm a')} · {(doc.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {resolveDocumentUrl(doc) && (
                          <Button variant="secondary" size="small" onClick={() => setPreviewDoc(doc)} icon={<Eye size={13} />}>
                            Preview
                          </Button>
                        )}
                        {resolveDocumentUrl(doc) && (
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => downloadFile(resolveDocumentUrl(doc), doc.name)}
                            icon={<Download size={13} />}
                          >
                            Download
                          </Button>
                        )}
                        <Button variant="ghost" size="small" onClick={() => removeDoc(doc.id, doc.visitId)} icon={<Trash2 size={13} />}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No documents attached"
                message="Prescription photos or PDFs uploaded from the Queue or during consultation will appear here."
                icon={<FileUp size={18} />}
                action={<Button size="small" onClick={() => setShowUploadModal(true)}>Upload first document</Button>}
              />
            )}
          </div>
        )}
        {tab === 'Invoices and payments' && (invoices.length ? invoices.map((invoice) => { const totals = patientInvoiceTotals(invoice); return <div className="list-row" key={invoice.id}><div className="list-row-main"><strong>{invoice.id} · {money(totals.total)}</strong><span>{invoice.visitLabel} · {dateLabel(invoice.date)}</span></div><div className="profile-payment"><Badge tone={statusTone(totals.status)}>{totals.status}</Badge><small>{money(totals.balance)} balance</small></div></div>; }) : <EmptyState title="No invoices" message="Billing records will appear here after a visit is created." icon={<Wallet size={18} />} />)}
        {tab === 'Follow-ups' && <HistoryList items={followups.map((item) => ({ title: dateLabel(item.date), detail: `${departmentLabel(item.department)} · ${item.doctor} · Reminder ${item.reminderStatus}`, status: item.status }))} empty="No follow-ups recorded." />}
      </TabPanel>
      <div className="profile-modal-actions"><Button variant="secondary" size="small" onClick={() => { navigator.clipboard?.writeText(patient.id).then(() => toast.push('Patient ID copied.')).catch(() => toast.push(patient.id, 'info')); }}>Copy patient ID</Button><Button variant="primary" size="small" onClick={() => window.print()} icon={<FileText size={14} />}>Print profile</Button></div>
    </Modal>

    {/* Preview Modal for selected document */}
    {previewDoc && (
      <Modal
        open={Boolean(previewDoc)}
        title={previewDoc.name}
        subtitle={`${previewDoc.category} · Local browser preview`}
        onClose={() => setPreviewDoc(null)}
        wide
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {resolveDocumentUrl(previewDoc) && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => downloadFile(resolveDocumentUrl(previewDoc), previewDoc.name)}
                  icon={<Download size={14} />}
                >
                  Download file
                </Button>
              )}
              {resolveDocumentUrl(previewDoc) && (
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    const win = window.open();
                    if (win) {
                      win.document.write(
                        `<iframe src="${resolveDocumentUrl(previewDoc)}" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`
                      );
                    }
                  }}
                  icon={<ExternalLink size={14} />}
                >
                  Open in new tab
                </Button>
              )}
            </div>
            <Button onClick={() => setPreviewDoc(null)}>Close</Button>
          </div>
        }
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '380px',
            background: '#0B171B',
            borderRadius: '8px',
            padding: '12px',
          }}
        >
          {previewDoc.mimeType.startsWith('image/') && resolveDocumentUrl(previewDoc) ? (
            <img src={resolveDocumentUrl(previewDoc)} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
          ) : previewDoc.mimeType === 'application/pdf' && resolveDocumentUrl(previewDoc) ? (
            <iframe src={resolveInlineDocumentUrl(previewDoc)} title={`Preview of ${previewDoc.name}`} style={{ width: '100%', height: '65vh', border: 'none', background: '#FFF' }} />
          ) : (
            <p style={{ color: '#FFF' }}>This file type has no inline preview.</p>
          )}
        </div>
      </Modal>
    )}

    {/* Upload modal when clicked from patient profile */}
    {showUploadModal && (
      <PatientDocumentsModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        patient={patient}
      />
    )}
  </>;
}

function HistoryList({ items, empty }: { items: { title: string; detail: string; status: string }[]; empty: string }) {
  return items.length ? <div className="profile-history">{items.map((item, index) => <div className="list-row" key={`${item.title}-${index}`}><div className="list-row-main"><strong>{item.title}</strong><span>{item.detail}</span></div><Badge tone={statusTone(item.status)}>{item.status}</Badge></div>)}</div> : <EmptyState title="Nothing to show yet" message={empty} icon={<FileText size={18} />} />;
}
