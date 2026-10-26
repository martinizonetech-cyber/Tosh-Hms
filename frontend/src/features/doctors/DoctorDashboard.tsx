import { isSameDay, startOfDay, addDays } from 'date-fns';
import { Activity, ArrowRight, CalendarDays, CheckCheck, Clock3, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useAuth } from '../../services/auth/AuthContext';
import { timeLabel } from '../../utils/format';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { PageHeading, PatientCell } from '../../components/shared/Primitives';

export function DoctorDashboard({ department }: { department: Department }) {
  const { state } = useHospitalData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  const appointments = state.appointments.filter((item) => item.department === department && isSameDay(new Date(item.startsAt), today));
  const queue = state.queue.filter((item) => item.department === department);
  const waiting = queue.filter((item) => item.status === 'Waiting').length;
  const consulting = queue.filter((item) => item.status === 'Consulting').length;
  const completed = queue.filter((item) => item.status === 'Completed').length;
  const due = state.followUps.filter((item) => item.department === department && item.status === 'Upcoming' && new Date(`${item.date}T00:00:00`) <= addDays(today, 2)).length;
  const deptTitle = department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics';
  const doctorName = user?.displayName || (department === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash');
  const rows = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const { page, setPage, pageSize, setPageSize, pagedItems: pagedRows, total } = usePagination(rows, 5);
  const cards = [
    { label: "Today's appointments", value: appointments.length, hint: 'Booked for today', icon: <CalendarDays size={16} /> },
    { label: 'Waiting patients', value: waiting, hint: 'Ready for your review', icon: <Clock3 size={16} /> },
    { label: 'In consultation', value: consulting, hint: 'Currently with a clinician', icon: <Activity size={16} /> },
    { label: 'Completed visits', value: completed, hint: 'Visits completed today', icon: <CheckCheck size={16} /> },
  ];
  return <>
    <PageHeading
      eyebrow={`${deptTitle} · Clinical workspace`}
      title={`Welcome, ${doctorName}`}
      description="Your appointments and patient work, in one place."
      actions={<Button onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/consultation`)} icon={<Users size={15} />}>Open consultation</Button>}
    />
    <div className="stats-grid">
      {cards.map((item) => <StatCard key={item.label} {...item} />)}
      <StatCard label="Follow-ups due" value={due} hint="Due today or in two days" icon={<Users size={16} />} />
    </div>

    <div className="content-grid doctor-dashboard-grid">
      {/* Primary Left Column: Today's Appointments */}
      <Card padded={false} className="dashboard-main-card">
        <div style={{ padding: '19px 20px 0' }}>
          <SectionHeading
            title="Today's appointments"
            subtitle="Your department schedule"
            action={<Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/appointments`)} icon={<ArrowRight size={14} />}>Full schedule</Button>}
          />
        </div>
        {rows.length ? (
          <>
            <div className="table-wrap responsive-cards">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Time</th>
                  <th>Visit</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((item) => {
                  const patient = state.patients.find((person) => person.id === item.patientId);
                  return (
                    <tr key={item.id}>
                      <td><PatientCell name={patient?.fullName ?? 'Patient'} id={patient?.id ?? item.patientId} /></td>
                      <td><span className="appointment-time">{timeLabel(item.startsAt)}</span></td>
                      <td>{item.visitType}</td>
                      <td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                      <td>
                        <Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/consultation/${item.patientId}`)}>Open</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
          <div className="empty-state">
            <h3>No appointments scheduled</h3>
            <p>New visits added by reception will appear here.</p>
          </div>
        )}
      </Card>

      {/* Aligned Right Sidebar Stack: Waiting Room & Follow-up Reminders */}
      <div className="dashboard-sidebar-stack">
        {/* Box 1: Waiting Room */}
        <Card className="dashboard-waiting-card">
          <SectionHeading
            title="Waiting room"
            subtitle={`${waiting} waiting · ${consulting} in progress`}
            action={<Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/consultation`)} icon={<Users size={13} />}>Live queue</Button>}
          />
          {queue.filter((item) => item.status !== 'Completed').length > 0 ? (
            <div className="dashboard-card-list">
              {queue.filter((item) => item.status !== 'Completed').slice(0, 5).map((entry) => {
                const patient = state.patients.find((person) => person.id === entry.patientId);
                return (
                  <div className="dashboard-queue-card" key={entry.id}>
                    <div className="dashboard-tile-left">
                      <span className="queue-token-pill">{entry.token}</span>
                      <div className="dashboard-tile-info">
                        <strong>{patient?.fullName ?? 'Patient'}</strong>
                        <span><Clock3 size={11} /> {timeLabel(entry.arrivalAt)} · {entry.visitType}</span>
                      </div>
                    </div>
                    <div className="dashboard-tile-right">
                      <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
                      <Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/consultation/${entry.patientId}`)} icon={<ArrowRight size={13} />}>Review</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-tile">
              <Users size={18} color="#94A3B8" />
              <span>No patients currently waiting in queue.</span>
            </div>
          )}
        </Card>

        {/* Box 2: Follow-up Reminders (Aligned width, generous 20px vertical gap) */}
        <Card className="dashboard-followup-card-box">
          <SectionHeading
            title="Follow-up reminders"
            subtitle="Upcoming clinical review dates"
            action={<Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/follow-ups`)} icon={<ArrowRight size={13} />}>View all</Button>}
          />
          {state.followUps.filter((item) => item.department === department).length > 0 ? (
            <div className="dashboard-card-list">
              {state.followUps.filter((item) => item.department === department).slice(0, 4).map((item) => {
                const patient = state.patients.find((person) => person.id === item.patientId);
                return (
                  <div className="dashboard-followup-card" key={item.id}>
                    <div className="dashboard-tile-left">
                      <span className="followup-date-pill"><CalendarDays size={11} /> {item.date}</span>
                      <div className="dashboard-tile-info">
                        <strong>{patient?.fullName ?? 'Patient'}</strong>
                        <span>{item.doctor} · {item.note || 'Clinical follow-up'}</span>
                      </div>
                    </div>
                    <div className="dashboard-tile-right">
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <Button variant="ghost" size="small" onClick={() => navigate(`/${department === 'skin' ? 'skin' : 'ortho'}/consultation/${item.patientId}`)}>Review</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-tile">
              <CalendarDays size={18} color="#94A3B8" />
              <span>No pending follow-ups for this department.</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  </>;
}
