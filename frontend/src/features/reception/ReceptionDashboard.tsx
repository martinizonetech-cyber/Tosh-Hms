import { useMemo } from 'react';
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { Activity, ArrowRight, CalendarDays, CheckCheck, Clock3, CreditCard, Users, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useAuth } from '../../services/auth/AuthContext';
import { money, timeLabel } from '../../utils/format';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { PatientCell } from '../../components/shared/Primitives';
import { Button } from '../../components/ui/Button';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

export function ReceptionDashboard() {
  const { state } = useHospitalData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  const todayAppointments = state.appointments.filter((item) => isSameDay(new Date(item.startsAt), today));
  const waiting = state.queue.filter((item) => item.status === 'Waiting');
  const consulting = state.queue.filter((item) => item.status === 'Consulting');
  const completed = state.queue.filter((item) => item.status === 'Completed').length;
  const collections = state.invoices.reduce((sum, invoice) => sum + invoice.payments.filter((payment) => isSameDay(new Date(payment.paidAt), today)).reduce((value, payment) => value + payment.amount, 0), 0);
  const outstanding = state.invoices.reduce((sum, invoice) => {
    const total = invoice.consultationFee + invoice.charges.reduce((acc, charge) => acc + charge.amount, 0);
    const paid = invoice.payments.reduce((acc, payment) => acc + payment.amount, 0);
    return sum + Math.max(0, total - paid);
  }, 0);
  const followUpsDue = state.followUps.filter((item) => item.status === 'Upcoming' && new Date(`${item.date}T00:00:00`) <= addDays(today, 2)).length;
  const chartData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = subDays(today, 6 - index);
    const appts = state.appointments.filter((item) => isSameDay(new Date(item.startsAt), day));
    return { day: format(day, 'EEE'), skin: appts.filter((item) => item.department === 'skin').length, orthopaedics: appts.filter((item) => item.department === 'orthopaedics').length };
  }), [state.appointments]);
  const deptData = [
    { name: 'Skin', value: todayAppointments.filter((item) => item.department === 'skin').length, color: '#177E89' },
    { name: 'Orthopaedics', value: todayAppointments.filter((item) => item.department === 'orthopaedics').length, color: '#17324D' },
  ];
  const agenda = [...todayAppointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const { page, setPage, pageSize, setPageSize, pagedItems: pagedAgenda, total: agendaTotal } = usePagination(agenda, 5);
  const metrics = [
    { label: "Today's appointments", value: todayAppointments.length, hint: 'Across both departments', icon: <CalendarDays size={16} />, tone: 'mint' as const },
    { label: 'Waiting patients', value: waiting.length, hint: 'Current waiting queue', icon: <Clock3 size={16} />, tone: 'purple' as const },
    { label: 'Currently consulting', value: consulting.length, hint: 'Patients with a clinician', icon: <Activity size={16} />, tone: 'peach' as const },
    { label: 'Completed visits', value: completed, hint: 'Queue visits marked complete', icon: <CheckCheck size={16} />, tone: 'blue' as const },
    { label: "Today's collections", value: money(collections), hint: 'Recorded payments today', icon: <Wallet size={16} />, tone: 'teal' as const },
    { label: 'Outstanding balances', value: money(outstanding), hint: 'Across open invoices', icon: <CreditCard size={16} />, tone: 'amber' as const },
    { label: 'Follow-ups due soon', value: followUpsDue, hint: 'Due today or in the next two days', icon: <Users size={16} />, tone: 'indigo' as const },
    { label: 'Departments active', value: 2, hint: 'Skin and Orthopaedics', icon: <Activity size={16} />, tone: 'rose' as const },
  ];
  return <>
    <div className="clinical-hero-banner dept-reception">
      <div className="clinical-hero-main">
        <div className="clinical-hero-eyebrow">RECEPTION · CARE OPERATIONS</div>
        <h1 className="clinical-hero-title">Welcome, {user?.displayName || 'Reception'}</h1>
        <p className="clinical-hero-desc">Today’s appointments, queue and collections at a glance.</p>
        <div className="clinical-hero-action">
          <Button
            className="clinical-hero-btn"
            onClick={() => navigate('/reception/queue')}
            icon={<Users size={15} />}
          >
            Add to queue
          </Button>
        </div>
      </div>

      <div className="clinical-hero-quote dept-reception">
        <span className="clinical-quote-mark" aria-hidden="true">“</span>
        <p className="clinical-quote-text">Seamless care begins with a warm welcome and connected teams.</p>
      </div>

      <div className="clinical-hero-media dept-reception" aria-hidden="true">
        <img src="/images/reception-hero.png" alt="" className="clinical-hero-img dept-reception" />
        <div className="clinical-hero-fade" />
      </div>
    </div>
    <div className="stats-grid">{metrics.map((item) => <StatCard key={item.label} {...item} />)}</div>
    <div className="content-grid">
      <Card><SectionHeading title="Department activity" subtitle="Appointments scheduled across the last seven days" /><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}><CartesianGrid stroke="#EAF0F2" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 11 }} /><Bar dataKey="skin" name="Skin" fill="#177E89" radius={[5, 5, 0, 0]} /><Bar dataKey="orthopaedics" name="Orthopaedics" fill="#17324D" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-dot" style={{ background: '#177E89' }} />Skin</span><span><i className="legend-dot" style={{ background: '#17324D' }} />Orthopaedics</span></div></Card>
      <Card><SectionHeading title="Today by department" subtitle="Scheduled appointments" /><div className="chart-box" style={{ height: 188 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={deptData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>{deptData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 11 }} /></PieChart></ResponsiveContainer></div><div className="metric-list">{deptData.map((item) => <div className="metric-line" key={item.name}><span><i className="legend-dot" style={{ background: item.color }} />{item.name}</span><strong>{item.value} appointments</strong></div>)}</div></Card>
    </div>
    <div className="content-grid">
      <Card padded={false}><div style={{ padding: '19px 20px 0' }}><SectionHeading title="Today's appointments" subtitle="A quick look at who is expected next" action={<Button variant="ghost" size="small" onClick={() => navigate('/reception/appointments')} icon={<ArrowRight size={14} />}>View all</Button>} /></div>{agenda.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Patient</th><th>Time</th><th>Department / Doctor</th><th>Status</th></tr></thead><tbody>{pagedAgenda.map((item, index) => { const patient = state.patients.find((record) => record.id === item.patientId); const sno = (page - 1) * pageSize + index + 1; return <tr key={item.id}><td className="serial-cell">{sno}</td><td><PatientCell name={patient?.fullName ?? 'Unknown patient'} id={item.id} /></td><td><span className="appointment-time">{timeLabel(item.startsAt)}</span></td><td>{item.department === 'skin' ? 'Skin' : 'Orthopaedics'}<div style={{ color: '#64748B', fontSize: 10, marginTop: 3 }}>{item.doctor}</div></td><td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td></tr>; })}</tbody></table></div><TablePagination page={page} pageSize={pageSize} total={agendaTotal} onPageChange={setPage} onPageSizeChange={setPageSize} /></> : <div className="empty-state"><h3>No appointments yet</h3><p>Schedule a visit to build today's agenda.</p></div>}</Card>
      <Card><SectionHeading title="Queue now" subtitle={`${waiting.length} waiting · ${consulting.length} consulting`} action={<Button variant="ghost" size="small" onClick={() => navigate('/reception/queue')}>Manage</Button>} />{state.queue.slice(0, 4).map((item) => { const patient = state.patients.find((record) => record.id === item.patientId); return <div className="list-row" key={item.id}><div className="list-row-main"><strong>{item.token} · {patient?.fullName ?? 'Patient'}</strong><span>{item.department === 'skin' ? 'Skin' : 'Orthopaedics'} · {timeLabel(item.arrivalAt)}</span></div><Badge tone={statusTone(item.status)}>{item.status}</Badge></div>; })}</Card>
    </div>
  </>;
}
