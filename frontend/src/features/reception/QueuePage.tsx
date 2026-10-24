import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, FileUp, Plus, Search, UserRoundPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientSchema } from '../../schemas/forms';
import type { Department, Gender, QueueEntry, VisitType, Vitals } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel } from '../../utils/format';
import { matchesPatient } from '../../utils/patientSearch';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { PatientDocumentsModal } from '../../components/shared/PatientDocumentsModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, TextAreaField } from '../../components/ui/Field';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { fetchDoctors, getDoctorsByDepartment } from '../../services/doctors/doctorService';
import { requestJson } from '../../services/api/httpClient';
import type { Patient } from '../../types/domain';
const defaults = { fullName: '', dateOfBirth: '', gender: 'Prefer not to say' as Gender, phone: '', email: '', address: '', emergencyContact: '' };
const blankVitals = (): Vitals => ({ bloodPressure: '', pulse: '', temperature: '', height: '', weight: '', oxygenSaturation: '' });
const vitalFields: { key: keyof Vitals; label: string; placeholder: string }[] = [
  { key: 'bloodPressure', label: 'Blood pressure', placeholder: 'e.g. 118/76' },
  { key: 'pulse', label: 'Pulse', placeholder: 'e.g. 72 bpm' },
  { key: 'temperature', label: 'Temperature', placeholder: 'e.g. 36.8 °C' },
  { key: 'height', label: 'Height', placeholder: 'e.g. 168 cm' },
  { key: 'weight', label: 'Weight', placeholder: 'e.g. 64 kg' },
  { key: 'oxygenSaturation', label: 'Oxygen saturation', placeholder: 'e.g. 98%' },
];

export function QueuePage() {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const navigate = useNavigate();
  const [skinDoctors, setSkinDoctors] = useState<string[]>(() => getDoctorsByDepartment('skin'));
  const [orthoDoctors, setOrthoDoctors] = useState<string[]>(() => getDoctorsByDepartment('orthopaedics'));
  const doctors: Record<Department, string[]> = useMemo(() => ({
    skin: skinDoctors,
    orthopaedics: orthoDoctors,
  }), [skinDoctors, orthoDoctors]);

  const [flow, setFlow] = useState<'existing' | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [department, setDepartment] = useState<Department>('skin');
  const [doctor, setDoctor] = useState(() => getDoctorsByDepartment('skin')[0]);
  const [visitType, setVisitType] = useState<VisitType>('Follow-up');
  const [note, setNote] = useState('');
  const [vitals, setVitals] = useState<Vitals>(blankVitals);

  useEffect(() => {
    fetchDoctors().then(() => {
      setSkinDoctors(getDoctorsByDepartment('skin'));
      setOrthoDoctors(getDoctorsByDepartment('orthopaedics'));
      setDoctor(getDoctorsByDepartment(department)[0]);
    });
  }, [department]);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [documentQueueEntry, setDocumentQueueEntry] = useState<QueueEntry | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({ resolver: zodResolver(patientSchema), defaultValues: defaults });
  const possiblePatients = useMemo(() => state.patients.filter((patient) => matchesPatient(patient, patientSearch)), [state.patients, patientSearch]);
  const filtered = useMemo(() => state.queue.filter((item) => {
    const patient = state.patients.find((person) => person.id === item.patientId);
    const matchesQuery = !search || (patient ? matchesPatient(patient, search) : false) || item.token.toLowerCase().includes(search.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || item.department === departmentFilter;
    const matchesDoctor = doctorFilter === 'all' || item.doctor === doctorFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesDate = !dateFilter || isSameDay(new Date(item.arrivalAt), startOfDay(new Date(`${dateFilter}T00:00:00`)));
    return matchesQuery && matchesDepartment && matchesDoctor && matchesStatus && matchesDate;
  }), [dateFilter, departmentFilter, doctorFilter, search, state.patients, state.queue, statusFilter]);
  const { page, setPage, pageSize, setPageSize, pagedItems, total } = usePagination(filtered, 6);
  const allDoctors = [...new Set(state.queue.map((item) => item.doctor))];
  const changeDepartment = (value: Department) => { setDepartment(value); setDoctor(doctors[value][0]); };

  const phoneRegister = register('phone');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 13);
    e.target.value = digitsOnly;
    phoneRegister.onChange(e);
  };

  const handlePhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 13);
    const input = e.currentTarget;
    const currentVal = input.value || '';
    const start = input.selectionStart ?? currentVal.length;
    const end = input.selectionEnd ?? currentVal.length;
    const nextVal = (currentVal.slice(0, start) + pasted + currentVal.slice(end)).replace(/\D/g, '').slice(0, 13);
    input.value = nextVal;
    phoneRegister.onChange({
      target: { name: 'phone', value: nextVal },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const addExisting = async () => {
    if (!selectedPatient) { toast.push('Choose an existing patient before adding to the queue.', 'error'); return; }
    try {
      await repository.addQueueEntry({ patientId: selectedPatient, department, doctor, visitType, note, vitals });
      toast.push('Patient added to the queue.', 'success');
      setFlow(null); setSelectedPatient(''); setPatientSearch(''); setNote(''); setVitals(blankVitals());
    } catch (error) { toast.push(error instanceof Error ? error.message : 'Could not add patient.', 'error'); }
  };
  const addNew = handleSubmit(async (values) => {
    try {
      await repository.addPatientAndQueue({ ...values, email: values.email || undefined, department, doctor, visitType, note, vitals });
      toast.push(`Patient registered and added to the queue.`, 'success');
      reset(defaults); setFlow(null); setNote(''); setVitals(blankVitals());
    } catch (error: any) {
      if (error?.status === 409 && error?.code === 'POSSIBLE_DUPLICATE') {
        const confirmForce = window.confirm(
          `A patient with this phone or similar details already exists (${error.details?.existingPatient?.id || 'Existing patient'}). Register anyway?`
        );
        if (confirmForce) {
          try {
            const patient = await requestJson<Patient>('/patients?force=true', {
              method: 'POST',
              body: JSON.stringify({
                fullName: values.fullName,
                dateOfBirth: values.dateOfBirth,
                gender: values.gender,
                phone: values.phone,
                email: values.email || undefined,
                address: values.address,
                emergencyContact: values.emergencyContact || undefined,
                department,
              }),
            });
            await repository.addQueueEntry({
              patientId: patient.id,
              department,
              doctor,
              visitType,
              note,
              vitals,
            });
            toast.push(`Patient ${patient.id} registered and added to queue.`, 'success');
            reset(defaults); setFlow(null); setNote(''); setVitals(blankVitals());
            return;
          } catch (retryErr: any) {
            toast.push(retryErr?.message || 'Could not register patient.', 'error');
            return;
          }
        }
      } else {
        toast.push(error instanceof Error ? error.message : 'Could not register patient.', 'error');
      }
    }
  });
  const setStatus = async (id: string, status: 'Waiting' | 'Consulting' | 'Completed') => {
    try {
      await repository.updateQueueEntry(id, status);
      toast.push(`Queue status updated to ${status.toLowerCase()}.`, 'success');
    } catch (error: any) {
      if (error?.status === 409 || error?.code === 'INVALID_TRANSITION') {
        toast.push('Cannot transition queue entry: this status change is not allowed.', 'error');
      } else {
        toast.push(error instanceof Error ? error.message : 'Could not update queue.', 'error');
      }
    }
  };
  const dateMove = (days: number) => { const date = new Date(`${dateFilter}T00:00:00`); date.setDate(date.getDate() + days); setDateFilter(format(date, 'yyyy-MM-dd')); };

  return <>
    <PageHeading eyebrow="Reception · Patient flow" title="Manage the queue" description="Check in an existing patient or register a new visitor, then keep the care team in sync." actions={<Button variant="secondary" onClick={() => navigate('/reception/appointments')} icon={<Users size={15} />}>Appointments</Button>} />
    <div className="queue-actions"><button className={`queue-action${flow === 'existing' ? ' selected' : ''}`} onClick={() => setFlow(flow === 'existing' ? null : 'existing')} type="button"><span className="queue-action-icon"><Search size={18} /></span><span><strong>Existing patient</strong><small>Search by ID, name, or phone</small></span><ArrowRight size={16} /></button><button className={`queue-action${flow === 'new' ? ' selected' : ''}`} onClick={() => setFlow(flow === 'new' ? null : 'new')} type="button"><span className="queue-action-icon"><UserRoundPlus size={18} /></span><span><strong>New patient</strong><small>Register and add a queue entry</small></span><Plus size={17} /></button></div>
    {flow && <Card className="queue-flow mb-4"><SectionHeading title={flow === 'existing' ? 'Add an existing patient' : 'Register a new patient'} subtitle={flow === 'existing' ? 'The selected patient will be added to the shared department queue.' : 'Patient ID is generated only for this frontend demonstration.'} action={<button className="icon-button" aria-label="Close patient flow" type="button" onClick={() => setFlow(null)}>×</button>} />
      {flow === 'existing' ? <div className="form-grid">
        <div className="field span-2"><label htmlFor="patient-search">Search patients by ID, name, or phone</label><div className="search-field"><Search size={15} /><input id="patient-search" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setSelectedPatient(''); }} placeholder="Start typing a patient name, ID, or phone" /></div></div>
        <div className="patient-choice-list span-2">{possiblePatients.slice(0, 4).map((patient) => <button type="button" key={patient.id} className={`patient-choice${selectedPatient === patient.id ? ' active' : ''}`} onClick={() => setSelectedPatient(patient.id)}><PatientAvatar name={patient.fullName} /><span><strong>{patient.fullName}</strong><small>{patient.id} · {patient.phone}</small></span>{selectedPatient === patient.id && <Check size={17} />}</button>)}{!possiblePatients.length && <p className="field-hint">No matching demo patients found. Choose “New patient” to register a fictional demo record.</p>}</div>
      </div> : <div className="form-grid three">
        <Field id="fullName" label="Full name" required maxLength={60} placeholder="Patient's full name" error={errors.fullName?.message as string} {...register('fullName')} />
        <Field id="dateOfBirth" label="Date of birth" type="date" required max={format(new Date(), 'yyyy-MM-dd')} min="1900-01-01" error={errors.dateOfBirth?.message as string} {...register('dateOfBirth')} />
        <div className="field"><label htmlFor="gender">Gender</label><select id="gender" className="control" {...register('gender')}><option>Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></div>
        <Field
          id="phone"
          label="Phone number"
          required
          type="tel"
          inputMode="numeric"
          maxLength={13}
          placeholder="e.g. 9876543210"
          error={errors.phone?.message as string}
          {...phoneRegister}
          onChange={handlePhoneChange}
          onPaste={handlePhonePaste}
        />
        <Field id="email" label="Email (optional)" type="email" maxLength={80} placeholder="name@example.com" error={errors.email?.message as string} {...register('email')} />
        <Field id="emergencyContact" label="Emergency contact" type="text" maxLength={60} placeholder="Contact name or phone" {...register('emergencyContact')} />
        <Field id="address" label="Address" required maxLength={150} placeholder="Street address, locality, city" error={errors.address?.message as string} className="span-3" {...register('address')} />
      </div>}
      <hr className="divider" /><div className="form-grid three">
        <div className="field"><label htmlFor="queue-department">Department</label><select id="queue-department" className="control" value={department} onChange={(event) => changeDepartment(event.target.value as Department)}><option value="skin">Skin / Dermatology</option><option value="orthopaedics">Orthopaedics</option></select></div>
        <div className="field"><label htmlFor="queue-doctor">Doctor</label><select id="queue-doctor" className="control" value={doctor} onChange={(event) => setDoctor(event.target.value)}>{doctors[department].map((name) => <option key={name}>{name}</option>)}</select></div>
        <div className="field"><label htmlFor="queue-visit-type">Visit type</label><select id="queue-visit-type" className="control" value={visitType} onChange={(event) => setVisitType(event.target.value as VisitType)}><option>New</option><option>Follow-up</option><option>Walk-in</option></select></div>
        <TextAreaField id="queue-description" label="Description" placeholder="Enter description" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="span-3" />
        <div className="field span-3"><label>Reception-entered vitals (optional)</label><div className="vitals-entry-grid">{vitalFields.map(({ key, label, placeholder }) => <div className="field" key={key}><label htmlFor={`queue-vital-${key}`}>{label}</label><input id={`queue-vital-${key}`} className="control" value={vitals[key]} placeholder={placeholder} onChange={(event) => setVitals((current) => ({ ...current, [key]: event.target.value }))} /></div>)}</div><span className="field-hint">Demo measurements are shared with the selected department’s clinical workspace; verify all values in real care workflows.</span></div>
      </div>
      <div className="button-row" style={{ marginTop: 16 }}><Button onClick={flow === 'existing' ? addExisting : addNew} disabled={isSubmitting} icon={<Plus size={15} />}>{isSubmitting ? 'Saving…' : 'Add to queue'}</Button><Button variant="secondary" onClick={() => setFlow(null)}>Cancel</Button></div>
    </Card>}
    <Card padded={false}>
      <div style={{ padding: '19px 20px 0' }}><SectionHeading title="Queue overview" subtitle={`${filtered.length} ${filtered.length === 1 ? 'patient' : 'patients'} · demo state is shared with both doctor portals`} /></div>
      <div className="schedule-date-toolbar"><div className="date-navigation"><Button variant="secondary" size="small" aria-label="Previous day" onClick={() => dateMove(-1)} icon={<ArrowLeft size={14} />}>Previous</Button><label className="date-display"><CalendarDays size={15} /><input aria-label="Choose queue date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /><Clock3 size={14} /><strong>{dateLabel(`${dateFilter}T00:00:00`)}</strong></label><Button variant="secondary" size="small" aria-label="Next day" onClick={() => dateMove(1)} icon={<ArrowRight size={14} />}>Next</Button><Button variant="ghost" size="small" onClick={() => setDateFilter(format(new Date(), 'yyyy-MM-dd'))}>Today</Button></div>
        <div className="toolbar"><div className="search-field"><Search size={15} /><input aria-label="Search queue" placeholder="Search patient, phone, ID, or token" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Filter by department" className="select-field" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option><option value="skin">Skin</option><option value="orthopaedics">Orthopaedics</option></select><select aria-label="Filter by doctor" className="select-field" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}><option value="all">All doctors</option>{allDoctors.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filter by status" className="select-field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option>Waiting</option><option>Consulting</option><option>Completed</option></select><span className="result-count">{filtered.length} {filtered.length === 1 ? 'patient' : 'patients'}</span></div></div>
      {filtered.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Token / patient</th><th>Department & doctor</th><th>Arrival</th><th style={{ textAlign: 'center', width: 110 }}>Status</th><th style={{ textAlign: 'center', width: 110 }}>Payment</th><th className="actions-col" style={{ textAlign: 'center' }}>Actions</th></tr></thead><tbody>{pagedItems.map((entry, index) => { const patient = state.patients.find((person) => person.id === entry.patientId); const serialNo = (page - 1) * pageSize + index + 1; const entryVisit = entry.visitId ? state.consultations.find((v) => v.id === entry.visitId) : state.consultations.find((v) => v.patientId === entry.patientId && v.department === entry.department); const docCount = entryVisit?.documents.length ?? 0; return <tr key={entry.id}><td className="serial-cell">{serialNo}</td><td><div className="patient-cell"><span className="queue-token">{entry.token}</span><div><strong>{patient?.fullName ?? 'Patient'}</strong><span>{patient?.id ?? entry.patientId} · {patient?.phone ?? ''}</span></div></div></td><td>{entry.department === 'skin' ? 'Skin' : 'Orthopaedics'}<span className="table-subtext">{entry.doctor}</span></td><td>{new Date(entry.arrivalAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</td><td style={{ textAlign: 'center' }}><Badge tone={statusTone(entry.status)}>{entry.status}</Badge></td><td style={{ textAlign: 'center' }}><Badge tone={statusTone(entry.paymentStatus)}>{entry.paymentStatus}</Badge></td><td className="actions-cell" style={{ textAlign: 'center' }}><div className="table-actions" style={{ justifyContent: 'center' }}>{entry.status === 'Waiting' && <Button variant="secondary" size="small" onClick={() => setStatus(entry.id, 'Consulting')}>Call in</Button>}{entry.status === 'Consulting' && <Button variant="secondary" size="small" onClick={() => setStatus(entry.id, 'Completed')}>Complete</Button>}<Button variant={docCount > 0 ? 'secondary' : 'ghost'} size="small" onClick={() => setDocumentQueueEntry(entry)} icon={<FileUp size={14} />} title="Upload prescription or patient documents">{docCount > 0 ? `Docs (${docCount})` : 'Upload'}</Button><Button variant="ghost" size="small" onClick={() => navigate('/reception/billing')}>Billing</Button></div></td></tr>; })}</tbody></table></div>
        <div className="patient-card-list queue-card-list">{pagedItems.map((entry, index) => { const patient = state.patients.find((person) => person.id === entry.patientId); const serialNo = (page - 1) * pageSize + index + 1; const entryVisit = entry.visitId ? state.consultations.find((v) => v.id === entry.visitId) : state.consultations.find((v) => v.patientId === entry.patientId && v.department === entry.department); const docCount = entryVisit?.documents.length ?? 0; return <article className="patient-card" key={entry.id}><div className="patient-card-head"><div className="patient-card-name"><span className="serial-cell" style={{ marginRight: 6 }}>#{serialNo}</span><PatientAvatar name={patient?.fullName ?? 'Patient'} /><div><strong>{patient?.fullName ?? 'Patient'}</strong><span>{entry.token} · {patient?.id}</span></div></div><Badge tone={statusTone(entry.status)}>{entry.status}</Badge></div><div className="patient-card-meta"><div><small>Department / Doctor</small><strong>{entry.department === 'skin' ? 'Skin' : 'Orthopaedics'} · {entry.doctor}</strong></div><div><small>Arrival / Payment</small><strong>{new Date(entry.arrivalAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {entry.paymentStatus}</strong></div></div><div className="button-row" style={{ marginTop: 12 }}>{entry.status === 'Waiting' && <Button variant="secondary" size="small" onClick={() => setStatus(entry.id, 'Consulting')}>Call in</Button>}{entry.status === 'Consulting' && <Button variant="secondary" size="small" onClick={() => setStatus(entry.id, 'Completed')}>Complete</Button>}<Button variant={docCount > 0 ? 'secondary' : 'ghost'} size="small" onClick={() => setDocumentQueueEntry(entry)} icon={<FileUp size={14} />}>{docCount > 0 ? `Docs (${docCount})` : 'Upload docs'}</Button><Button variant="ghost" size="small" onClick={() => navigate('/reception/billing')}>Billing</Button></div></article>; })}</div>
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </> : <EmptyState title="No queue entries match" message="Change a filter or add a patient to the queue to get started." icon={<Clock3 size={18} />} action={<Button size="small" onClick={() => setFlow('existing')}>Add existing patient</Button>} />}
    </Card>
    <PatientDocumentsModal
      open={Boolean(documentQueueEntry)}
      onClose={() => setDocumentQueueEntry(null)}
      patient={state.patients.find((p) => p.id === documentQueueEntry?.patientId) ?? null}
      queueEntry={documentQueueEntry}
      department={documentQueueEntry?.department}
    />
  </>;
}
