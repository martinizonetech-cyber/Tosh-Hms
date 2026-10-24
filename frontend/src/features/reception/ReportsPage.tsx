import { useMemo, useState } from 'react';
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, CalendarDays, CreditCard, Users } from 'lucide-react';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { money, patientInvoiceTotals } from '../../utils/format';
import { PageHeading, PatientCell } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

export function ReportsPage() {
  const { state } = useHospitalData();
  const [department, setDepartment] = useState<'all' | Department>('all');
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const start = startOfDay(new Date(`${from}T00:00:00`));
  const end = addDays(startOfDay(new Date(`${to}T00:00:00`)), 1);
  const inRange = (value: string) => { const date = new Date(value); return date >= start && date < end; };
  const patients = state.patients.filter((patient) => inRange(patient.registeredAt) && (department === 'all' || patient.departments.includes(department)));
  const appointments = state.appointments.filter((item) => inRange(item.startsAt) && (department === 'all' || item.department === department));
  const completedVisits = state.queue.filter((item) => item.status === 'Completed' && inRange(item.arrivalAt) && (department === 'all' || item.department === department)).length;
  const walkIns = state.appointments.filter((item) => item.visitType === 'Walk-in' && inRange(item.startsAt) && (department === 'all' || item.department === department)).length;
  const invoices = state.invoices.filter((invoice) => inRange(invoice.date) && (department === 'all' || invoice.department === department));
  const collections = invoices.reduce((sum, invoice) => sum + invoice.payments.filter((payment) => inRange(payment.paidAt)).reduce((subtotal, payment) => subtotal + payment.amount, 0), 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + patientInvoiceTotals(invoice).balance, 0);
  const followups = state.followUps.filter((item) => inRange(`${item.date}T00:00:00`) && (department === 'all' || item.department === department));
  const followupCompletion = followups.length ? Math.round(followups.filter((item) => item.status === 'Completed').length / followups.length * 100) : 0;
  const trend = useMemo(() => {
    const days = Math.min(14, Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000)));
    return Array.from({ length: days }, (_, index) => {
      const day = addDays(start, index); const label = format(day, 'd MMM');
      const registrations = state.patients.filter((item) => isSameDay(new Date(item.registeredAt), day) && (department === 'all' || item.departments.includes(department))).length;
      const scheduled = state.appointments.filter((item) => isSameDay(new Date(item.startsAt), day) && (department === 'all' || item.department === department)).length;
      const collected = state.invoices.flatMap((invoice) => department === 'all' || invoice.department === department ? invoice.payments : []).filter((item) => isSameDay(new Date(item.paidAt), day)).reduce((sum, item) => sum + item.amount, 0);
      return { day: label, registrations, appointments: scheduled, collections: collected };
    });
  }, [department, end, start, state.appointments, state.invoices, state.patients]);
  const methodData = useMemo(() => {
    const methods = ['Cash', 'UPI', 'GPay', 'PhonePe', 'Card', 'Other'] as const;
    const palette = ['#17324D', '#177E89', '#58A7A9', '#7E9DB1', '#BED9DB', '#D9E4E7'];
    return methods.map((method, index) => ({ name: method, value: invoices.flatMap((invoice) => invoice.payments).filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0), color: palette[index] })).filter((item) => item.value > 0);
  }, [invoices]);
  const deptActivity = ['skin', 'orthopaedics'].map((dept) => ({ name: dept === 'skin' ? 'Skin' : 'Orthopaedics', appointments: appointments.filter((item) => item.department === dept).length, completed: state.queue.filter((item) => item.department === dept && item.status === 'Completed' && inRange(item.arrivalAt)).length }));
  const openInvoices = useMemo(() => invoices.filter((invoice) => patientInvoiceTotals(invoice).balance > 0), [invoices]);
  const { page, setPage, pageSize, setPageSize, pagedItems, total } = usePagination(openInvoices, 5);
  return <>
    <PageHeading eyebrow="Reception · Insights" title="Reports" description="Operational summaries are derived from shared demo records and never represent live clinical or financial data." />
    <Card className="report-filters"><div className="report-filter-grid"><div className="field"><label htmlFor="report-from">From</label><input id="report-from" className="control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label htmlFor="report-to">To</label><input id="report-to" className="control" type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></div><div className="field"><label htmlFor="report-department">Department</label><select id="report-department" className="control" value={department} onChange={(event) => setDepartment(event.target.value as 'all' | Department)}><option value="all">All departments</option><option value="skin">Skin</option><option value="orthopaedics">Orthopaedics</option></select></div><div className="report-range-label"><CalendarDays size={14} /> {from} — {to}</div></div></Card>
    <div className="stats-grid"><StatCard label="Patient registrations" value={patients.length} hint="In selected period" icon={<Users size={16} />} /><StatCard label="Appointments" value={appointments.length} hint={`${walkIns} walk-ins`} icon={<CalendarDays size={16} />} /><StatCard label="Completed visits" value={completedVisits} hint="Queue entries completed" icon={<Activity size={16} />} /><StatCard label="Collections" value={money(collections)} hint="Payments in selected period" icon={<CreditCard size={16} />} /><StatCard label="Outstanding invoices" value={money(outstanding)} hint="Balance within date range" icon={<CreditCard size={16} />} /><StatCard label="Follow-up completion" value={`${followupCompletion}%`} hint={`${followups.filter((item) => item.status === 'Completed').length} completed in period`} icon={<Activity size={16} />} /></div>
    <div className="content-grid">
      <Card><SectionHeading title="Registrations & appointments" subtitle="Daily activity within the selected date range" /><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 7, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#EAF0F2" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} /><Tooltip contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey="registrations" stroke="#177E89" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="appointments" stroke="#17324D" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Card>
      <Card><SectionHeading title="Collections over time" subtitle="Captured mock payments by day" /><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 7, right: 5, left: -15, bottom: 0 }}><CartesianGrid stroke="#EAF0F2" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 10 }} /><Bar dataKey="collections" name="Collected" fill="#177E89" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
    </div>
    <div className="content-grid equal">
      <Card><SectionHeading title="Department activity" subtitle="Appointments and completed queue visits" /><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={deptActivity} margin={{ top: 5, right: 5, left: -16, bottom: 0 }}><CartesianGrid stroke="#EAF0F2" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} /><Tooltip contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="appointments" fill="#177E89" radius={[5, 5, 0, 0]} /><Bar dataKey="completed" fill="#17324D" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card><SectionHeading title="Payment methods" subtitle="Amount recorded by mock tender type" />{methodData.length ? <><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={methodData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={2}>{methodData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 10, borderColor: '#DCE5E9', fontSize: 10 }} /></PieChart></ResponsiveContainer></div><div className="chart-legend">{methodData.map((item) => <span key={item.name}><i className="legend-dot" style={{ background: item.color }} />{item.name} · {money(item.value)}</span>)}</div></> : <EmptyState title="No payments in this period" message="Recorded payment methods will appear when dates include a demo payment." />}</Card>
    </div>
    <Card padded={false}><div style={{ padding: '18px 20px 0' }}><SectionHeading title="Outstanding invoices" subtitle="Open balances from the selected period" /></div>{openInvoices.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Invoice</th><th>Patient</th><th>Department</th><th>Balance</th><th style={{ textAlign: 'center', width: 110 }}>Status</th></tr></thead><tbody>{pagedItems.map((invoice, index) => { const patient = state.patients.find((person) => person.id === invoice.patientId); const totals = patientInvoiceTotals(invoice); const serialNo = (page - 1) * pageSize + index + 1; return <tr key={invoice.id}><td className="serial-cell">{serialNo}</td><td>{invoice.id}</td><td><PatientCell name={patient?.fullName ?? 'Patient'} id={patient?.id ?? invoice.patientId} /></td><td>{invoice.department === 'skin' ? 'Skin' : 'Orthopaedics'}</td><td>{money(totals.balance)}</td><td style={{ textAlign: 'center' }}><Badge tone={statusTone(totals.status)}>{totals.status}</Badge></td></tr>; })}</tbody></table></div>
    <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </> : <EmptyState title="No outstanding invoices" message="No unpaid balances fall within the selected date range." />}</Card>
  </>;
}
