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

function WhatsAppIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.19-.09-1.12-.55-1.3-.61-.17-.07-.3-.1-.43.1-.12.19-.49.61-.6.73-.11.12-.23.14-.42.05-.19-.09-.81-.3-1.54-.95-.57-.51-.96-1.14-1.07-1.33-.11-.19-.01-.3.08-.39.09-.08.19-.23.29-.34.1-.12.13-.19.19-.33.07-.13.03-.25-.02-.34-.05-.1-.43-1.04-.59-1.42-.16-.38-.32-.33-.44-.33h-.37c-.13 0-.34.05-.52.24-.18.19-.68.66-.68 1.62 0 .95.7 1.88.8 2.01.09.12 1.37 2.1 3.32 2.94.46.2.83.33 1.11.42.47.15.89.13 1.23.08.38-.06 1.12-.46 1.28-.9.16-.45.16-.83.11-.91-.04-.09-.16-.14-.35-.23z" />
    </svg>
  );
}

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
  const whatsappQueued = inDepartment.filter((item) => item.reminderStatus === 'Queued' || item.reminderStatus === 'Sent').length;

  const handleWhatsApp = async (id: string) => {
    const entry = state.followUps.find((item) => item.id === id);
    const patient = state.patients.find((person) => person.id === entry?.patientId);
    try {
      await repository.updateFollowUp(id, { reminderAction: 'send', reminderStatus: 'Queued' });
      toast.push(`WhatsApp reminder dispatched/queued for ${patient?.fullName ?? 'Patient'} (${patient?.phone ?? 'Clinic contact'}).`, 'success');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not send WhatsApp reminder.', 'error');
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
      <StatCard label="WhatsApp reminders" value={whatsappQueued} hint="WhatsApp notices queued" icon={<WhatsAppIcon size={16} />} />
    </div>
    <Card padded={false}>
      <div style={{ padding: '18px 20px 0' }}>
        <SectionHeading
          title="Follow-up register"
          subtitle="Manage patient appointments, send WhatsApp reminders, and update follow-up statuses."
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
