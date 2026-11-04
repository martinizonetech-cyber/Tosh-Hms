import { useMemo, useState } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { CalendarClock, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, departmentLabel } from '../../utils/format';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { WhatsAppIcon } from '../../components/ui/Icons';
import { format } from 'date-fns';



export function FollowUpsPage({ department: forcedDepartment }: { department?: Department } = {}) {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<Department | 'all'>(forcedDepartment ?? 'all');
  const department = forcedDepartment ?? departmentFilter;
  const [status, setStatus] = useState('all');
  const [dueWindow, setDueWindow] = useState('all');
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const today = startOfDay(new Date());

  const rows = useMemo(() => state.followUps.filter((item) => {
    const patient = state.patients.find((person) => person.id === item.patientId);
    const when = new Date(`${item.date}T00:00:00`);
    return (!query || `${patient?.fullName ?? ''} ${patient?.id ?? ''} ${item.doctor}`.toLowerCase().includes(query.toLowerCase()))
      && (department === 'all' || item.department === department)
      && (status === 'all' || item.status === status)
      && (dueWindow === 'all' || (dueWindow === 'overdue' && (when < today || item.status === 'Overdue')) || (dueWindow === 'today' && isSameDay(when, today)) || (dueWindow === '7days' && when >= today && when <= addDays(today, 7)));
  }).sort((a, b) => a.date.localeCompare(b.date)), [department, dueWindow, query, state.followUps, state.patients, status, today]);

  const { page, setPage, pageSize, setPageSize, pagedItems, total } = usePagination(rows, 6);
  const inDepartment = state.followUps.filter((item) => department === 'all' || item.department === department);
  const dueToday = inDepartment.filter((item) => isSameDay(new Date(`${item.date}T00:00:00`), today) && item.status === 'Upcoming').length;
  const overdue = inDepartment.filter((item) => item.status === 'Overdue').length;
  const upcoming = inDepartment.filter((item) => item.status === 'Upcoming').length;
  const whatsappSent = inDepartment.filter((item) => item.reminderStatus === 'Sent').length;
  const whatsappPending = inDepartment.filter((item) => item.reminderStatus === 'Not sent' || item.reminderStatus === 'Queued').length;

  const handleWhatsApp = async (id: string) => {
    const entry = state.followUps.find((item) => item.id === id);
    const patient = state.patients.find((person) => person.id === entry?.patientId);
    
    const patientName = patient?.fullName || 'Patient';
    const doctorName = entry?.doctor || 'our doctor';
    const dateFormatted = entry?.date ? format(new Date(`${entry.date}T00:00:00`), 'dd MMM yyyy') : 'the scheduled date';
    const clinicName = 'TOSH Foundation Hospital';
    const message = `Hello ${patientName},\n\nThis is a friendly reminder from ${clinicName} for your upcoming follow-up appointment with ${doctorName} on ${dateFormatted}.\n\nPlease let us know if you need to reschedule or have questions.\n\nWarm regards,\n${clinicName}`;

    const rawDigits = (patient?.phone || '').replace(/\D/g, '');
    let cleanPhone = rawDigits;
    if (rawDigits.length === 10) {
      cleanPhone = `91${rawDigits}`;
    }

    if (cleanPhone) {
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.push(`No phone number on record for ${patientName}. Marking reminder Sent.`, 'info');
    }

    try {
      await repository.updateFollowUp(id, { reminderAction: 'send', reminderStatus: 'Sent' });
      toast.push(`WhatsApp reminder opened & marked Sent for ${patientName}.`, 'success');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not send WhatsApp reminder.', 'error');
    }
  };

  const handleDispatchDue = async () => {
    const pendingDue = inDepartment.filter(
      (item) =>
        (item.status === 'Overdue' || (item.status === 'Upcoming' && isSameDay(new Date(`${item.date}T00:00:00`), today))) &&
        item.reminderStatus !== 'Sent'
    );
    if (pendingDue.length === 0) {
      toast.push('No pending reminders due for today or overdue.', 'info');
      return;
    }
    try {
      for (const item of pendingDue) {
        await repository.updateFollowUp(item.id, { reminderAction: 'send', reminderStatus: 'Sent' });
      }
      toast.push(`Marked ${pendingDue.length} due follow-up reminder(s) as Sent.`, 'success');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not dispatch reminders.', 'error');
    }
  };

  const update = (id: string, next: 'Completed' | 'Rescheduled' | 'Cancelled') => {
    if (next === 'Rescheduled') {
      const entry = state.followUps.find((item) => item.id === id);
      setRescheduleDate(entry?.date ?? '');
      setRescheduling(id);
      return;
    }
    if (next === 'Cancelled' && !window.confirm('Cancel this follow-up in demo data?')) return;
    try {
      repository.updateFollowUp(id, { status: next });
      toast.push(`Follow-up marked ${next.toLowerCase()}.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not update follow-up.', 'error');
    }
  };

  const saveReschedule = () => {
    if (!rescheduling || !rescheduleDate) {
      toast.push('Choose the updated follow-up date.', 'error');
      return;
    }
    try {
      repository.updateFollowUp(rescheduling, { date: rescheduleDate, status: 'Rescheduled' });
      toast.push('Follow-up date updated and marked rescheduled.');
      setRescheduling(null);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not reschedule follow-up.', 'error');
    }
  };

  return <>
    <PageHeading
      eyebrow={`${forcedDepartment ? departmentLabel(forcedDepartment) : 'Reception'} · Continuity of care`}
      title="Follow-ups"
      description="Keep upcoming reviews visible, queue WhatsApp reminders, and track patient care continuity."
    />
    <div className="stats-grid">
      <StatCard label="Upcoming" value={upcoming} hint="Open scheduled reviews" icon={<CalendarClock size={16} />} />
      <StatCard label="Due today" value={dueToday} hint="Follow-ups on today's date" icon={<CalendarClock size={16} />} />
      <StatCard label="Overdue" value={overdue} hint="Needs review or rescheduling" icon={<Clock size={16} />} />
      <StatCard label="WhatsApp reminders" value={whatsappSent} hint={`${whatsappPending} pending reminder notices`} icon={<WhatsAppIcon size={16} />} />
    </div>
    <Card padded={false}>
      <div style={{ padding: '18px 20px 0' }}>
        <SectionHeading
          title="Follow-up register"
          subtitle="Manage patient appointments, send WhatsApp reminders, and update follow-up statuses."
          action={
            <Button
              variant="secondary"
              size="small"
              onClick={handleDispatchDue}
              icon={<WhatsAppIcon size={13} />}
            >
              Dispatch due reminders ({inDepartment.filter(
                (item) => (item.status === 'Overdue' || (item.status === 'Upcoming' && isSameDay(new Date(`${item.date}T00:00:00`), today))) && item.reminderStatus !== 'Sent'
              ).length})
            </Button>
          }
        />
      </div>
      <div className="toolbar" style={{ padding: '0 20px' }}>
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search follow-ups"
            placeholder="Search patient, ID or doctor"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="select-field"
          aria-label="Filter follow-ups by department"
          value={department}
          disabled={Boolean(forcedDepartment)}
          onChange={(event) => setDepartmentFilter(event.target.value as Department | 'all')}
        >
          <option value="all">All departments</option>
          <option value="skin">Skin</option>
          <option value="orthopaedics">Orthopaedics</option>
        </select>
        <select
          className="select-field"
          aria-label="Filter follow-ups by due date"
          value={dueWindow}
          onChange={(event) => setDueWindow(event.target.value)}
        >
          <option value="all">All due dates</option>
          <option value="today">Today</option>
          <option value="7days">Next 7 days</option>
          <option value="overdue">Overdue</option>
        </select>
        <select
          className="select-field"
          aria-label="Filter follow-ups by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          {['Upcoming', 'Completed', 'Overdue', 'Rescheduled', 'Cancelled'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="result-count">{rows.length} records</span>
      </div>

      {rows.length ? (
        <>
          <div className="table-wrap responsive-cards">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="serial-col">S.No</th>
                  <th>Patient</th>
                  <th>Department / Doctor</th>
                  <th>Follow-up date</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Status</th>
                  <th style={{ textAlign: 'center', width: 110 }}>WhatsApp</th>
                  <th className="actions-col" style={{ textAlign: 'center', width: 250 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((item, index) => {
                  const patient = state.patients.find((person) => person.id === item.patientId);
                  const serialNo = (page - 1) * pageSize + index + 1;
                  return (
                    <tr key={item.id}>
                      <td className="serial-cell">{serialNo}</td>
                      <td>
                        <div className="patient-cell">
                          <PatientAvatar name={patient?.fullName ?? 'Patient'} small />
                          <div>
                            <strong>{patient?.fullName ?? 'Patient'}</strong>
                            <span>{patient?.id ?? item.patientId} · {patient?.phone ?? ''}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {departmentLabel(item.department)}
                        <span className="table-subtext">{item.doctor}</span>
                      </td>
                      <td>{dateLabel(`${item.date}T00:00:00`)}</td>
                      <td style={{ textAlign: 'center' }}><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                      <td style={{ textAlign: 'center' }}><Badge tone={statusTone(item.reminderStatus)}>{item.reminderStatus}</Badge></td>
                      <td className="actions-cell" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', justifyContent: 'center' }}>
                          <FollowUpActions
                            id={item.id}
                            status={item.status}
                            onWhatsApp={handleWhatsApp}
                            onUpdate={update}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="patient-card-list followup-card-list">
            {pagedItems.map((item, index) => {
              const patient = state.patients.find((person) => person.id === item.patientId);
              const serialNo = (page - 1) * pageSize + index + 1;
              return (
                <article className="patient-card" key={item.id}>
                  <div className="patient-card-head">
                    <div className="patient-card-name">
                      <span className="serial-cell" style={{ marginRight: 6 }}>#{serialNo}</span>
                      <PatientAvatar name={patient?.fullName ?? 'Patient'} />
                      <div>
                        <strong>{patient?.fullName ?? 'Patient'}</strong>
                        <span>{departmentLabel(item.department)} · {item.doctor}</span>
                      </div>
                    </div>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </div>
                  <div className="patient-card-meta">
                    <div>
                      <small>Follow-up date</small>
                      <strong>{dateLabel(`${item.date}T00:00:00`)}</strong>
                    </div>
                    <div>
                      <small>WhatsApp Status</small>
                      <Badge tone={statusTone(item.reminderStatus)}>{item.reminderStatus}</Badge>
                    </div>
                  </div>
                  <FollowUpActions
                    id={item.id}
                    status={item.status}
                    onWhatsApp={handleWhatsApp}
                    onUpdate={update}
                  />
                </article>
              );
            })}
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : (
        <EmptyState
          title="No follow-ups match"
          message="Adjust the department, due-date or status filter to see records."
          icon={<CalendarClock size={18} />}
        />
      )}
    </Card>

    <Modal
      open={Boolean(rescheduling)}
      title="Reschedule follow-up"
      subtitle="Choose a new date. The follow-up schedule will be updated in the system."
      onClose={() => setRescheduling(null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => setRescheduling(null)}>Cancel</Button>
          <Button onClick={saveReschedule}>Save new date</Button>
        </>
      }
    >
      <Field
        id="reschedule-followup-date"
        label="New follow-up date"
        type="date"
        value={rescheduleDate}
        onChange={(event) => setRescheduleDate(event.target.value)}
      />
    </Modal>
  </>;
}

function FollowUpActions({
  id,
  status,
  onWhatsApp,
  onUpdate,
}: {
  id: string;
  status: string;
  onWhatsApp: (id: string) => void;
  onUpdate: (id: string, status: 'Completed' | 'Rescheduled' | 'Cancelled') => void;
}) {
  const open = !['Completed', 'Cancelled'].includes(status);

  if (!open) {
    return (
      <div className="followup-resolved-status">
        {status === 'Completed' ? (
          <span className="followup-done-badge success">
            <CheckCircle2 size={12} /> Completed
          </span>
        ) : (
          <span className="followup-done-badge cancelled">
            <XCircle size={12} /> Cancelled
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="followup-actions">
      <Button
        variant="secondary"
        size="small"
        className="btn-action-whatsapp"
        onClick={() => onWhatsApp(id)}
        icon={<WhatsAppIcon size={13} />}
      >
        WhatsApp
      </Button>
      <Button
        variant="ghost"
        size="small"
        className="btn-action-complete"
        onClick={() => onUpdate(id, 'Completed')}
        icon={<CheckCircle2 size={13} />}
      >
        Complete
      </Button>
      <Button
        variant="ghost"
        size="small"
        className="btn-action-reschedule"
        onClick={() => onUpdate(id, 'Rescheduled')}
        icon={<CalendarClock size={13} />}
      >
        Reschedule
      </Button>
      <Button
        variant="ghost"
        size="small"
        className="btn-action-cancel"
        onClick={() => onUpdate(id, 'Cancelled')}
        icon={<XCircle size={13} />}
      >
        Cancel
      </Button>
    </div>
  );
}
