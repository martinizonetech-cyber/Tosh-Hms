import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Plus, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, patientSchema } from '../../schemas/forms';
import type { Department, Gender, VisitType } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, localDateTimeInput, timeLabel } from '../../utils/format';
import { matchesPatient } from '../../utils/patientSearch';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, TextAreaField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

import { fetchDoctors, getDoctorsByDepartment } from '../../services/doctors/doctorService';

const blankPatient = { fullName: '', dateOfBirth: '', gender: 'Male' as Gender, phone: '', email: '', address: '', emergencyContact: '' };

export function AppointmentsPage() {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [skinDoctors, setSkinDoctors] = useState<string[]>(() => getDoctorsByDepartment('skin'));
  const [orthoDoctors, setOrthoDoctors] = useState<string[]>(() => getDoctorsByDepartment('orthopaedics'));
  const doctors: Record<Department, string[]> = useMemo(() => ({
    skin: skinDoctors,
    orthopaedics: orthoDoctors,
  }), [skinDoctors, orthoDoctors]);

  useEffect(() => {
    fetchDoctors().then(() => {
      setSkinDoctors(getDoctorsByDepartment('skin'));
      setOrthoDoctors(getDoctorsByDepartment('orthopaedics'));
    });
  }, []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [patientSearch, setPatientSearch] = useState('');
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const startAppointment = useMemo(() => ({
    patientId: '',
    department: 'skin' as Department,
    doctor: doctors.skin[0] || 'Dr. Sangamitra',
    startsAt: localDateTimeInput(addDays(new Date(), 1)),
    visitType: 'New' as VisitType,
    note: '',
  }), [doctors]);
  const appointmentForm = useForm({ resolver: zodResolver(appointmentSchema), defaultValues: startAppointment });
  const newPatientForm = useForm({ resolver: zodResolver(patientSchema), defaultValues: blankPatient });
  const selectedDepartment = appointmentForm.watch('department');
  const selectedPatientId = appointmentForm.watch('patientId');
  const selectedPatient = useMemo(
    () => state.patients.find((p) => p.id === selectedPatientId),
    [selectedPatientId, state.patients]
  );
  const matchesPatients = useMemo(() => {
    return state.patients.filter((patient) => matchesPatient(patient, patientSearch));
  }, [patientSearch, state.patients]);
  const filtered = useMemo(() => state.appointments.filter((item) => {
    const patient = state.patients.find((person) => person.id === item.patientId);
    const patientMatches = patient ? matchesPatient(patient, search) : false;
    const doctorMatches = item.doctor.toLowerCase().includes(search.toLowerCase());
    return (!search || patientMatches || doctorMatches)
      && (departmentFilter === 'all' || item.department === departmentFilter)
      && (statusFilter === 'all' || item.status === statusFilter)
      && (!dateFilter || isSameDay(new Date(item.startsAt), startOfDay(new Date(`${dateFilter}T00:00:00`))));
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [dateFilter, departmentFilter, search, state.appointments, state.patients, statusFilter]);
  const { page, setPage, pageSize, setPageSize, pagedItems, total } = usePagination(filtered, 6);

  const phoneRegister = newPatientForm.register('phone');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    e.target.value = digitsOnly;
    phoneRegister.onChange(e);
  };

  const handlePhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 10);
    const input = e.currentTarget;
    const currentVal = input.value || '';
    const start = input.selectionStart ?? currentVal.length;
    const end = input.selectionEnd ?? currentVal.length;
    const nextVal = (currentVal.slice(0, start) + pasted + currentVal.slice(end)).replace(/\D/g, '').slice(0, 10);
    input.value = nextVal;
    phoneRegister.onChange({
      target: { name: 'phone', value: nextVal },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const emergencyRegister = newPatientForm.register('emergencyContact');

  const handleEmergencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    e.target.value = digitsOnly;
    emergencyRegister.onChange(e);
  };

  const handleEmergencyPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 10);
    const input = e.currentTarget;
    const currentVal = input.value || '';
    const start = input.selectionStart ?? currentVal.length;
    const end = input.selectionEnd ?? currentVal.length;
    const nextVal = (currentVal.slice(0, start) + pasted + currentVal.slice(end)).replace(/\D/g, '').slice(0, 10);
    input.value = nextVal;
    emergencyRegister.onChange({
      target: { name: 'emergencyContact', value: nextVal },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const openCreate = () => { appointmentForm.reset({ ...startAppointment, startsAt: localDateTimeInput(addDays(new Date(), 1)) }); newPatientForm.reset(blankPatient); setPatientMode('existing'); setPatientSearch(''); setOpen(true); };
  const changeDepartment = (department: Department) => { appointmentForm.setValue('department', department); appointmentForm.setValue('doctor', doctors[department][0]); };
  const saveAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    appointmentForm.setValue('patientId', patientMode === 'new' ? 'new-patient-pending' : appointmentForm.getValues('patientId'));
    const appointmentValid = await appointmentForm.trigger();
    if (!appointmentValid) return;
    try {
      let patientId = appointmentForm.getValues('patientId');
      if (patientMode === 'new') {
        const patientValid = await newPatientForm.trigger();
        if (!patientValid) return;
        const values = newPatientForm.getValues();
        const res = await repository.createPatient({ ...values, email: values.email || undefined, department: selectedDepartment });
        patientId = typeof res === 'object' && res?.id ? res.id : res;
      }
      const doctor = appointmentForm.getValues('doctor') || doctors[selectedDepartment]?.[0] || (selectedDepartment === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash');
      await repository.addAppointment({ ...appointmentForm.getValues(), patientId, doctor, startsAt: new Date(appointmentForm.getValues('startsAt')).toISOString() });
      toast.push('Appointment successfully scheduled.', 'success');
      setOpen(false);
    } catch (error: any) {
      if (error?.status === 409 || error?.code === 'DOUBLE_BOOKING') {
        toast.push('Doctor already has an appointment scheduled at this time. Please choose another slot.', 'error');
      } else {
        toast.push(error?.message || 'Could not schedule appointment.', 'error');
      }
    }
  };
  const changeStatus = async (id: string, status: 'Checked-in' | 'No-show' | 'Cancelled' | 'Completed') => {
    if (status === 'Cancelled' && !window.confirm('Cancel this appointment?')) return;
    try {
      await repository.updateAppointment(id, { status });
      toast.push(`Appointment marked ${status.toLowerCase()}.`, 'success');
    } catch (error: any) {
      if (error?.status === 409 || error?.code === 'INVALID_TRANSITION') {
        toast.push('Cannot transition appointment: this status change is not allowed.', 'error');
      } else {
        toast.push(error instanceof Error ? error.message : 'Could not update appointment.', 'error');
      }
    }
  };
  const saveReschedule = async () => {
    if (!rescheduling || !rescheduleValue) return;
    try {
      await repository.updateAppointment(rescheduling, { startsAt: new Date(rescheduleValue).toISOString(), status: 'Scheduled' });
      toast.push('Appointment rescheduled successfully.', 'success');
      setRescheduling(null);
    } catch (error: any) {
      if (error?.status === 409) {
        toast.push('Conflict: Doctor already has an appointment scheduled at this time.', 'error');
      } else {
        toast.push(error instanceof Error ? error.message : 'Could not reschedule appointment.', 'error');
      }
    }
  };
  const dateMove = (days: number) => { const date = new Date(`${dateFilter}T00:00:00`); date.setDate(date.getDate() + days); setDateFilter(format(date, 'yyyy-MM-dd')); };

  return <>
    <PageHeading eyebrow="Reception · Scheduling" title="Appointments" description="Plan visits, check patients in, and keep the department teams aligned." actions={<Button onClick={openCreate} icon={<Plus size={15} />}>New appointment</Button>} />
    <Card padded={false}><div style={{ padding: '18px 20px 0' }}><SectionHeading title="Appointment schedule" subtitle="Date-based list adapts to smaller screens without a desktop-only calendar." /></div>
      <div className="schedule-date-toolbar"><div className="date-navigation"><Button variant="secondary" size="small" aria-label="Previous day" onClick={() => dateMove(-1)} icon={<ArrowLeft size={14} />}>Previous</Button><label className="date-display"><CalendarDays size={15} /><input aria-label="Choose appointment date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /><Clock3 size={14} /><strong>{dateLabel(`${dateFilter}T00:00:00`)}</strong></label><Button variant="secondary" size="small" aria-label="Next day" onClick={() => dateMove(1)} icon={<ArrowRight size={14} />}>Next</Button><Button variant="ghost" size="small" onClick={() => setDateFilter(format(new Date(), 'yyyy-MM-dd'))}>Today</Button></div>
      <div className="toolbar"><div className="search-field"><Search size={15} /><input aria-label="Search appointments" placeholder="Search patient or doctor" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="select-field" aria-label="Filter appointments by department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option><option value="skin">Skin</option><option value="orthopaedics">Orthopaedics</option></select><select className="select-field" aria-label="Filter appointments by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['Scheduled', 'Checked-in', 'In progress', 'Completed', 'Cancelled', 'No-show'].map((status) => <option key={status}>{status}</option>)}</select><span className="result-count">{filtered.length} visits</span></div></div>
      {filtered.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Time / Patient</th><th>Department / Doctor</th><th>Visit type</th><th style={{ textAlign: 'center', width: 120 }}>Status</th><th className="actions-col" style={{ textAlign: 'right', width: 260, paddingRight: 20 }}>Actions</th></tr></thead><tbody>{pagedItems.map((item, index) => { const patient = state.patients.find((person) => person.id === item.patientId); const serialNo = (page - 1) * pageSize + index + 1; return <tr key={item.id}><td className="serial-cell">{serialNo}</td><td><div className="patient-cell"><span className="appointment-time">{timeLabel(item.startsAt)}</span><div><strong>{patient?.fullName ?? 'Patient'}</strong><span>{patient?.id ?? item.patientId} · {item.id}</span></div></div></td><td>{item.department === 'skin' ? 'Skin' : 'Orthopaedics'}<span className="table-subtext">{item.doctor}</span></td><td>{item.visitType}</td><td style={{ textAlign: 'center' }}><Badge tone={statusTone(item.status)}>{item.status}</Badge></td><td className="actions-cell" style={{ textAlign: 'right', paddingRight: 20 }}><AppointmentActions appointmentId={item.id} status={item.status} onChange={changeStatus} onReschedule={() => { setRescheduling(item.id); setRescheduleValue(localDateTimeInput(new Date(item.startsAt))); }} /></td></tr>; })}</tbody></table></div>
      <div className="patient-card-list appointment-card-list">{pagedItems.map((item, index) => { const patient = state.patients.find((person) => person.id === item.patientId); const serialNo = (page - 1) * pageSize + index + 1; return <article className="patient-card" key={item.id}><div className="patient-card-head"><div className="patient-card-name"><span className="serial-cell" style={{ marginRight: 6 }}>#{serialNo}</span><PatientAvatar name={patient?.fullName ?? 'Patient'} /><div><strong>{patient?.fullName ?? 'Patient'}</strong><span>{patient?.id} · {timeLabel(item.startsAt)}</span></div></div><Badge tone={statusTone(item.status)}>{item.status}</Badge></div><div className="patient-card-meta"><div><small>Department / Doctor</small><strong>{item.department === 'skin' ? 'Skin' : 'Orthopaedics'} · {item.doctor}</strong></div><div><small>Visit type</small><strong>{item.visitType}</strong></div></div><AppointmentActions appointmentId={item.id} status={item.status} onChange={changeStatus} onReschedule={() => { setRescheduling(item.id); setRescheduleValue(localDateTimeInput(new Date(item.startsAt))); }} /></article>; })}</div>
      <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </> : <EmptyState title="No appointments on this date" message="Try another date or create a new appointment." icon={<CalendarDays size={18} />} action={<Button size="small" onClick={openCreate}>Schedule a visit</Button>} />}
    </Card>
    <Modal wide open={open} title="Schedule an appointment" subtitle="Select an existing patient or register a new patient." onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="appointment-form">Schedule appointment</Button></>}>
      <form id="appointment-form" onSubmit={saveAppointment} className="form-grid three">
        <div className="field span-3"><label>Patient</label><div className="segmented-control"><button type="button" className={patientMode === 'existing' ? 'active' : ''} onClick={() => { setPatientMode('existing'); appointmentForm.setValue('patientId', ''); }}>Existing patient</button><button type="button" className={patientMode === 'new' ? 'active' : ''} onClick={() => { setPatientMode('new'); appointmentForm.setValue('patientId', 'new-patient-pending'); }}>New patient</button></div></div>
        {patientMode === 'existing' ? <>
          <div className="field span-3">
            <label htmlFor="appointment-patient-search">Search patient by name, ID or phone</label>
            <div className="search-field">
              <Search size={14} />
              <input
                id="appointment-patient-search"
                value={patientSearch}
                onChange={(event) => {
                  const val = event.target.value;
                  setPatientSearch(val);
                  const matching = state.patients.filter((p) => matchesPatient(p, val));
                  if (matching.length === 1) {
                    appointmentForm.setValue('patientId', matching[0].id, { shouldValidate: true });
                  }
                }}
                placeholder="Find an existing patient (name, ID or phone)"
                maxLength={80}
              />
            </div>
          </div>
          {patientSearch.trim() && (
            <div className="patient-choice-list span-3" style={{ maxHeight: 180, overflowY: 'auto' }}>
              {matchesPatients.slice(0, 5).map((patient) => {
                const isSelected = selectedPatientId === patient.id;
                return (
                  <button
                    type="button"
                    key={patient.id}
                    className={`patient-choice${isSelected ? ' active' : ''}`}
                    onClick={() => {
                      appointmentForm.setValue('patientId', patient.id, { shouldValidate: true });
                    }}
                  >
                    <PatientAvatar name={patient.fullName} />
                    <span>
                      <strong>{patient.fullName}</strong>
                      <small>{patient.id} · {patient.phone}</small>
                    </span>
                    {isSelected && <Check size={17} />}
                  </button>
                );
              })}
              {!matchesPatients.length && (
                <p className="field-hint" style={{ padding: '6px 0', margin: 0 }}>
                  No matching patients found. Switch to "New patient" to register.
                </p>
              )}
            </div>
          )}
          {selectedPatient && (
            <div className="span-3" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, color: '#166534', fontSize: 13 }}>
              <Check size={16} />
              <span>Selected patient: <strong>{selectedPatient.fullName}</strong> ({selectedPatient.id} · {selectedPatient.phone})</span>
            </div>
          )}
          <div className="field span-3">
            <label htmlFor="appointment-patient">Patient</label>
            <select
              id="appointment-patient"
              className="control"
              {...appointmentForm.register('patientId')}
              value={selectedPatientId}
              onChange={(e) => appointmentForm.setValue('patientId', e.target.value, { shouldValidate: true })}
            >
              <option value="">Choose a patient</option>
              {matchesPatients.slice(0, 15).map((patient) => (
                <option value={patient.id} key={patient.id}>
                  {patient.fullName} · {patient.id} · {patient.phone}
                </option>
              ))}
            </select>
            {appointmentForm.formState.errors.patientId && (
              <span className="field-error">{appointmentForm.formState.errors.patientId.message}</span>
            )}
          </div>
        </> : <>
          <Field id="new-patient-name" label="Full name" required maxLength={60} placeholder="Patient's full name" error={newPatientForm.formState.errors.fullName?.message as string} {...newPatientForm.register('fullName')} />
          <Field id="new-patient-dob" label="Date of birth" type="date" required max={format(new Date(), 'yyyy-MM-dd')} min="1900-01-01" error={newPatientForm.formState.errors.dateOfBirth?.message as string} {...newPatientForm.register('dateOfBirth')} />
          <div className="field">
            <label htmlFor="new-patient-gender">Gender</label>
            <select id="new-patient-gender" className="control" {...newPatientForm.register('gender')}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            {newPatientForm.formState.errors.gender && (
              <span className="field-error">{newPatientForm.formState.errors.gender.message as string}</span>
            )}
          </div>
          <Field
            id="new-patient-phone"
            label="Mobile number"
            required
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile number"
            error={newPatientForm.formState.errors.phone?.message as string}
            {...phoneRegister}
            onChange={handlePhoneChange}
            onPaste={handlePhonePaste}
          />
          <Field id="new-patient-email" label="Email (optional)" type="email" maxLength={80} placeholder="name@example.com" error={newPatientForm.formState.errors.email?.message as string} {...newPatientForm.register('email')} />
          <Field
            id="new-patient-emergency"
            label="Emergency contact (optional)"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit emergency number"
            error={newPatientForm.formState.errors.emergencyContact?.message as string}
            {...emergencyRegister}
            onChange={handleEmergencyChange}
            onPaste={handleEmergencyPaste}
          />
          <Field id="new-patient-address" label="Address" required maxLength={150} placeholder="Street address, locality, city" className="span-3" error={newPatientForm.formState.errors.address?.message as string} {...newPatientForm.register('address')} />
        </>}
        <div className="field"><label htmlFor="appointment-department">Department</label><select id="appointment-department" className="control" value={selectedDepartment} onChange={(event) => changeDepartment(event.target.value as Department)}><option value="skin">Skin / Dermatology</option><option value="orthopaedics">Orthopaedics</option></select></div>
        <div className="field"><label htmlFor="appointment-visit-type">Visit type</label><select id="appointment-visit-type" className="control" {...appointmentForm.register('visitType')}><option>New</option><option>Follow-up</option><option>Walk-in</option></select></div>
        <Field id="appointment-date-time" label="Date and time" type="datetime-local" required {...appointmentForm.register('startsAt')} />
        <TextAreaField id="appointment-note" label="Note (optional)" placeholder="Short scheduling note" className="span-3" maxLength={240} {...appointmentForm.register('note')} />
      </form>
    </Modal>
    <Modal open={Boolean(rescheduling)} title="Reschedule appointment" subtitle="Choose the updated date and time." onClose={() => setRescheduling(null)} footer={<><Button variant="secondary" onClick={() => setRescheduling(null)}>Cancel</Button><Button onClick={saveReschedule}>Save new time</Button></>}><Field id="reschedule-time" label="New date and time" type="datetime-local" value={rescheduleValue} onChange={(event) => setRescheduleValue(event.target.value)} /></Modal>
  </>;
}

function AppointmentActions({ appointmentId, status, onChange, onReschedule }: { appointmentId: string; status: string; onChange: (id: string, status: 'Checked-in' | 'No-show' | 'Cancelled' | 'Completed') => void; onReschedule: () => void }) {
  return <div className="appointment-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>{status === 'Scheduled' && <Button variant="secondary" size="small" onClick={() => onChange(appointmentId, 'Checked-in')} icon={<Check size={13} />}>Check in</Button>}{!['Cancelled', 'No-show', 'Completed'].includes(status) && <Button variant="ghost" size="small" onClick={onReschedule}>Reschedule</Button>}{status === 'Scheduled' && <Button variant="ghost" size="small" onClick={() => onChange(appointmentId, 'No-show')}>No-show</Button>}{!['Cancelled', 'Completed', 'No-show'].includes(status) && <Button variant="ghost" size="small" onClick={() => onChange(appointmentId, 'Cancelled')}>Cancel</Button>}</div>;
}
