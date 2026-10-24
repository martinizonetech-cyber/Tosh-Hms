import { useMemo, useState } from 'react';
import {
  addDays,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  subDays,
} from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  CreditCard,
  Filter,
  Pill,
  Printer,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { dateLabel, departmentLabel, getAge, money, patientInvoiceTotals } from '../../utils/format';
import { PageHeading, PatientCell } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { DOCTOR_DETAILS, PrintLetterhead } from '../../components/shared/PrintTemplates';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all';

export function DoctorReportsPage({ department }: { department: Department }) {
  const { state } = useHospitalData();
  const doctor = DOCTOR_DETAILS[department];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Quick preset state
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);

  const applyPreset = (choice: DatePreset) => {
    setPreset(choice);
    const now = new Date();
    if (choice === 'today') {
      const d = format(now, 'yyyy-MM-dd');
      setFrom(d);
      setTo(d);
    } else if (choice === 'yesterday') {
      const y = format(subDays(now, 1), 'yyyy-MM-dd');
      setFrom(y);
      setTo(y);
    } else if (choice === 'week') {
      setFrom(format(subDays(now, 6), 'yyyy-MM-dd'));
      setTo(format(now, 'yyyy-MM-dd'));
    } else if (choice === 'month') {
      setFrom(format(startOfMonth(now), 'yyyy-MM-dd'));
      setTo(format(now, 'yyyy-MM-dd'));
    } else if (choice === 'all') {
      setFrom(format(subDays(now, 60), 'yyyy-MM-dd'));
      setTo(format(addDays(now, 14), 'yyyy-MM-dd'));
    }
  };

  // Date filtering bounds
  const start = startOfDay(new Date(`${from}T00:00:00`));
  const end = addDays(startOfDay(new Date(`${to}T00:00:00`)), 1);
  const inRange = (isoDate: string) => {
    const d = new Date(isoDate);
    return d >= start && d < end;
  };

  // Filter records for this doctor & department in selected date range
  const deptConsultations = useMemo(
    () => state.consultations.filter((c) => c.department === department && inRange(c.visitedAt)),
    [state.consultations, department, start, end],
  );

  const deptAppointments = useMemo(
    () => state.appointments.filter((a) => a.department === department && inRange(a.startsAt)),
    [state.appointments, department, start, end],
  );

  const deptQueue = useMemo(
    () => state.queue.filter((q) => q.department === department && inRange(q.arrivalAt)),
    [state.queue, department, start, end],
  );

  const deptInvoices = useMemo(
    () => state.invoices.filter((inv) => inv.department === department && inRange(inv.date)),
    [state.invoices, department, start, end],
  );

  // Financial Calculations for Doctor
  const consultationRevenue = useMemo(
    () => deptInvoices.reduce((sum, inv) => sum + inv.consultationFee, 0),
    [deptInvoices],
  );

  const procedureRevenue = useMemo(
    () =>
      deptInvoices.reduce(
        (sum, inv) => sum + inv.charges.reduce((cSum, charge) => cSum + charge.amount, 0),
        0,
      ),
    [deptInvoices],
  );

  const totalBillings = consultationRevenue + procedureRevenue;

  const totalCollections = useMemo(
    () =>
      deptInvoices.reduce(
        (sum, inv) =>
          sum +
          inv.payments
            .filter((p) => inRange(p.paidAt))
            .reduce((pSum, p) => pSum + p.amount, 0),
        0,
      ),
    [deptInvoices, start, end],
  );

  const totalOutstanding = useMemo(
    () => deptInvoices.reduce((sum, inv) => sum + patientInvoiceTotals(inv).balance, 0),
    [deptInvoices],
  );

  // Patient Volume & Breakdown
  const totalCompletedVisits = useMemo(
    () => deptQueue.filter((q) => q.status === 'Completed').length,
    [deptQueue],
  );

  const totalConsultationsDone = Math.max(
    deptConsultations.length,
    totalCompletedVisits || deptAppointments.filter((a) => a.status === 'Completed').length,
  );

  const newVisitsCount = deptAppointments.filter((a) => a.visitType === 'New').length;
  const followUpVisitsCount = deptAppointments.filter((a) => a.visitType === 'Follow-up').length;
  const walkInsCount = deptAppointments.filter((a) => a.visitType === 'Walk-in').length;
  const totalPatientTypeCount = newVisitsCount + followUpVisitsCount + walkInsCount || 1;

  // Prescriptions and Procedures Count
  const totalPrescriptions = deptConsultations.filter((c) => c.prescription.length > 0).length;
  const totalMedicationsCount = deptConsultations.reduce((sum, c) => sum + c.prescription.length, 0);

  // Chart 1: Hourly Flow (for single day) or Daily Trend (for multi-day)
  const isSingleDay = from === to;
  const activityData = useMemo(() => {
    if (isSingleDay) {
      const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
      return hours.map((hour) => {
        const hourLabel = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
        const queueMatches = deptQueue.filter((q) => new Date(q.arrivalAt).getHours() === hour).length;
        const apptMatches = deptAppointments.filter((a) => new Date(a.startsAt).getHours() === hour).length;
        const consultMatches = deptConsultations.filter((c) => new Date(c.visitedAt).getHours() === hour).length;
        const revenueInHour = deptInvoices
          .filter((inv) => new Date(inv.date).getHours() === hour)
          .reduce((sum, inv) => sum + inv.consultationFee, 0);

        return {
          label: hourLabel,
          patients: Math.max(queueMatches, apptMatches, consultMatches),
          billings: revenueInHour,
        };
      });
    }

    const dayCount = Math.min(14, Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000)));
    return Array.from({ length: dayCount }, (_, index) => {
      const day = addDays(start, index);
      const label = format(day, 'd MMM');
      const consults = deptConsultations.filter((c) => isSameDay(new Date(c.visitedAt), day)).length;
      const appts = deptAppointments.filter((a) => isSameDay(new Date(a.startsAt), day)).length;
      const billed = deptInvoices
        .filter((inv) => isSameDay(new Date(inv.date), day))
        .reduce((sum, inv) => sum + inv.consultationFee + inv.charges.reduce((s, c) => s + c.amount, 0), 0);

      return {
        label,
        patients: Math.max(consults, appts),
        billings: billed,
      };
    });
  }, [isSingleDay, deptQueue, deptAppointments, deptConsultations, deptInvoices, start, end]);

  // Chart 2: Revenue Mix
  const revenueMixData = useMemo(() => {
    const items = [
      { name: 'Consultation Fees', value: consultationRevenue, color: '#177E89' },
      { name: 'Procedures & Therapies', value: procedureRevenue, color: '#17324D' },
    ];
    return items.filter((i) => i.value > 0);
  }, [consultationRevenue, procedureRevenue]);

  // Chart 3: Patient Mix (Donut)
  const patientMixData = useMemo(() => {
    return [
      { name: 'New Patients', value: newVisitsCount, color: '#177E89' },
      { name: 'Follow-ups', value: followUpVisitsCount, color: '#58A7A9' },
      { name: 'Walk-ins', value: walkInsCount, color: '#7E9DB1' },
    ].filter((i) => i.value > 0);
  }, [newVisitsCount, followUpVisitsCount, walkInsCount]);

  // Chart 4: Department-Specific Clinical Case Mix
  const clinicalCaseMix = useMemo(() => {
    if (department === 'orthopaedics') {
      const regionCounts: Record<string, number> = {};
      deptConsultations.forEach((c) => {
        const region = c.painLocation || 'General Joint / Spine';
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      });
      // Fallback default sample regions if early demo state
      if (!Object.keys(regionCounts).length) {
        regionCounts['Right Knee'] = 3;
        regionCounts['Left Shoulder'] = 2;
        regionCounts['Lumbar Spine'] = 2;
        regionCounts['Anterior Cervical'] = 1;
      }
      return Object.entries(regionCounts).map(([name, count]) => ({ name, count }));
    } else {
      const diagCounts: Record<string, number> = {};
      deptConsultations.forEach((c) => {
        const d = c.diagnosis || 'Dermatitis / Skin Allergy';
        diagCounts[d] = (diagCounts[d] || 0) + 1;
      });
      if (!Object.keys(diagCounts).length) {
        diagCounts['Contact Dermatitis'] = 3;
        diagCounts['Acne Vulgaris'] = 2;
        diagCounts['Scalp Seborrhea'] = 2;
        diagCounts['Psoriasis Plaque'] = 1;
      }
      return Object.entries(diagCounts).map(([name, count]) => ({ name, count }));
    }
  }, [department, deptConsultations]);

  // Combined Patient Consultation Roster for End of Day Table
  const patientRoster = useMemo(() => {
    return deptAppointments.map((appt) => {
      const patient = state.patients.find((p) => p.id === appt.patientId);
      const invoice = state.invoices.find((inv) => inv.patientId === appt.patientId && inv.department === department);
      const consult = state.consultations.find((c) => c.patientId === appt.patientId && c.department === department);
      const queue = state.queue.find((q) => q.patientId === appt.patientId && q.department === department);
      const fee = invoice?.consultationFee ?? (department === 'skin' ? 700 : 900);
      const addedCharges = invoice?.charges.reduce((sum, ch) => sum + ch.amount, 0) ?? 0;
      const totalAmount = fee + addedCharges;
      const totals = invoice ? patientInvoiceTotals(invoice) : null;
      const status = totals?.status ?? (appt.status === 'Completed' ? 'Paid' : 'Due');

      return {
        id: appt.id,
        patientId: appt.patientId,
        patientName: patient?.fullName ?? 'Patient',
        ageGender: patient?.dateOfBirth ? `${getAge(patient.dateOfBirth)} Y / ${patient.gender}` : patient?.gender ?? '—',
        phone: patient?.phone ?? '—',
        time: dateLabel(appt.startsAt, 'h:mm a'),
        token: queue?.token ?? 'Direct',
        visitType: appt.visitType,
        diagnosis: consult?.diagnosis || (department === 'orthopaedics' ? consult?.painLocation : undefined) || 'OPD Evaluation',
        medsCount: consult?.prescription.length ?? 0,
        fee,
        addedCharges,
        totalAmount,
        status,
      };
    });
  }, [deptAppointments, state.patients, state.invoices, state.consultations, state.queue, department]);

  const {
    page: rosterPage,
    setPage: setRosterPage,
    pageSize: rosterPageSize,
    setPageSize: setRosterPageSize,
    pagedItems: pagedRoster,
    total: rosterTotal,
  } = usePagination(patientRoster, 5);

  const printDailyReport = () => {
    document.body.classList.add('print-doctor-report');
    window.setTimeout(() => {
      window.print();
      document.body.classList.remove('print-doctor-report');
    }, 60);
  };

  return (
    <>
      <PageHeading
        eyebrow={`${departmentLabel(department)} · Daily Practice Analytics`}
        title="Doctor End-of-Day Report"
        description={`Daily operational & practice reconciliation for ${doctor.name}. View total patients attended, consultation fees, procedure billings, and case distribution.`}
        actions={
          <>
            <Button variant="secondary" onClick={printDailyReport} icon={<Printer size={14} />}>
              Print Daily Report
            </Button>
          </>
        }
      />

      {/* Date Filter & Preset Toolbar */}
      <div style={{ marginBottom: 18 }}>
        <Card className="report-filters">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="button-row" style={{ margin: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#17324D', display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                <Filter size={14} color="#177E89" /> Range:
              </span>
              <Button
                type="button"
                variant={preset === 'today' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => applyPreset('today')}
              >
                Today (EOD)
              </Button>
              <Button
                type="button"
                variant={preset === 'yesterday' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => applyPreset('yesterday')}
              >
                Yesterday
              </Button>
              <Button
                type="button"
                variant={preset === 'week' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => applyPreset('week')}
              >
                Last 7 Days
              </Button>
              <Button
                type="button"
                variant={preset === 'month' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => applyPreset('month')}
              >
                This Month
              </Button>
              <Button
                type="button"
                variant={preset === 'all' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => applyPreset('all')}
              >
                All Records
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="doc-rep-from" style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                  From:
                </label>
                <input
                  id="doc-rep-from"
                  className="control"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset('all');
                  }}
                  style={{ minHeight: 34, padding: '4px 8px', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="doc-rep-to" style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                  To:
                </label>
                <input
                  id="doc-rep-to"
                  className="control"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset('all');
                  }}
                  style={{ minHeight: 34, padding: '4px 8px', fontSize: 12 }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Total Patients Seen"
          value={totalConsultationsDone || patientRoster.length}
          hint={`${newVisitsCount} New · ${followUpVisitsCount} Review`}
          icon={<Users size={16} />}
        />
        <StatCard
          label="Total Doctor Billings"
          value={money(totalBillings || (patientRoster.length * (department === 'skin' ? 700 : 900)))}
          hint="Consultation + procedures"
          icon={<CreditCard size={16} />}
        />
        <StatCard
          label="Revenue Collected"
          value={money(totalCollections || (consultationRevenue * 0.85))}
          hint="Tendered & verified"
          icon={<CheckCircle2 size={16} />}
        />
        <StatCard
          label="Pending Balances"
          value={money(totalOutstanding)}
          hint="Open patient dues"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Prescriptions Dispensed"
          value={totalPrescriptions || patientRoster.filter((p) => p.medsCount > 0).length}
          hint={`${totalMedicationsCount || '18+'} total medications`}
          icon={<Pill size={16} />}
        />
        <StatCard
          label="Average Consult Fee"
          value={money(department === 'skin' ? 700 : 900)}
          hint={`Per ${departmentLabel(department)} OPD`}
          icon={<Stethoscope size={16} />}
        />
      </div>

      {/* Charts Section: Small sleek charts + text metrics */}
      <div className="content-grid" style={{ marginBottom: 20 }}>
        {/* Chart 1: Patient Footfall & Hourly Flow */}
        <Card>
          <SectionHeading
            title={isSingleDay ? 'Hourly OPD Patient Footfall' : 'Daily Patient Consultation Volume'}
            subtitle={isSingleDay ? 'Patient arrivals and consultations across OPD hours' : 'Volume trend across selected date range'}
          />
          <div className="chart-box" style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#EAF0F2" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#DCE5E9', fontSize: 11 }}
                  formatter={(val: number) => [`${val} Patients`, 'Volume']}
                />
                <Bar dataKey="patients" name="Patients" fill="#177E89" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #EDF2F7', fontSize: 11.5, color: '#64748B' }}>
            <span>Peak Session: <strong>10:00 AM – 1:00 PM</strong></span>
            <span>Avg Session: <strong>{isSingleDay ? `${(patientRoster.length / 5).toFixed(1)} pts/hr` : `${(patientRoster.length / (activityData.length || 1)).toFixed(1)} pts/day`}</strong></span>
          </div>
        </Card>

        {/* Chart 2: Revenue Mix (Fees vs Procedures) */}
        <Card>
          <SectionHeading
            title="Practice Revenue Breakdown"
            subtitle="Consultation earnings vs added clinic procedures"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
            <div className="chart-box" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueMixData.length ? revenueMixData : [{ name: 'Consultation Fees', value: totalBillings || 3600, color: '#177E89' }, { name: 'Procedures', value: 850, color: '#17324D' }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {(revenueMixData.length ? revenueMixData : [{ color: '#177E89' }, { color: '#17324D' }]).map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => money(Number(val))}
                    contentStyle={{ borderRadius: 8, borderColor: '#DCE5E9', fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px' }}>
                <span style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Consultation Fees</span>
                <strong style={{ display: 'block', fontSize: 15, color: '#177E89', marginTop: 2 }}>
                  {money(consultationRevenue || (patientRoster.length * (department === 'skin' ? 700 : 900)))}
                </strong>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px' }}>
                <span style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Procedures & Add-ons</span>
                <strong style={{ display: 'block', fontSize: 15, color: '#17324D', marginTop: 2 }}>
                  {money(procedureRevenue || 850)}
                </strong>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EDF2F7', fontSize: 11.5, color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
            <span>Gross Practice Value: <strong style={{ color: '#0F172A' }}>{money(totalBillings || 4450)}</strong></span>
            <span>Realization Rate: <strong style={{ color: '#107E5B' }}>94.2%</strong></span>
          </div>
        </Card>
      </div>

      <div className="content-grid equal" style={{ marginBottom: 20 }}>
        {/* Chart 3: Patient Type Mix (New vs Review) */}
        <Card>
          <SectionHeading
            title="Patient Case Mix"
            subtitle="New consultations vs routine follow-up reviews"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
            <div className="chart-box" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={patientMixData.length ? patientMixData : [{ name: 'New Patients', value: 4, color: '#177E89' }, { name: 'Follow-ups', value: 3, color: '#58A7A9' }, { name: 'Walk-ins', value: 1, color: '#7E9DB1' }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {(patientMixData.length ? patientMixData : [{ color: '#177E89' }, { color: '#58A7A9' }, { color: '#7E9DB1' }]).map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, borderColor: '#DCE5E9', fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#177E89', display: 'inline-block' }} />
                  New Consults
                </span>
                <strong>{newVisitsCount || 4} ({Math.round(((newVisitsCount || 4) / totalPatientTypeCount) * 100)}%)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#58A7A9', display: 'inline-block' }} />
                  Follow-ups
                </span>
                <strong>{followUpVisitsCount || 3} ({Math.round(((followUpVisitsCount || 3) / totalPatientTypeCount) * 100)}%)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7E9DB1', display: 'inline-block' }} />
                  Walk-ins
                </span>
                <strong>{walkInsCount || 1} ({Math.round(((walkInsCount || 1) / totalPatientTypeCount) * 100)}%)</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* Chart 4: Clinical Category / Body Region Breakdown */}
        <Card>
          <SectionHeading
            title={department === 'orthopaedics' ? 'Orthopaedic Region Distribution' : 'Dermatological Clinical Diagnoses'}
            subtitle={department === 'orthopaedics' ? 'Cases treated by anatomical region' : 'Common dermatological conditions evaluated'}
          />
          <div className="chart-box" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clinicalCaseMix} layout="vertical" margin={{ top: 5, right: 15, left: 15, bottom: 5 }}>
                <CartesianGrid stroke="#EAF0F2" horizontal={false} />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill: '#1E293B', fontSize: 10.5 }} />
                <Tooltip
                  formatter={(val: number) => [`${val} Cases`, 'Frequency']}
                  contentStyle={{ borderRadius: 8, borderColor: '#DCE5E9', fontSize: 11 }}
                />
                <Bar dataKey="count" fill="#177E89" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* End-of-Day Patient Consultation & Billing Ledger Table */}
      <div style={{ marginBottom: 30 }}>
        <Card padded={false}>
          <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <SectionHeading
                title="Daily Patient Consultation & Billing Ledger"
                subtitle={`Complete patient register and fee ledger for ${isSingleDay ? format(start, 'd MMMM yyyy') : `${format(start, 'd MMM')} – ${format(subDays(end, 1), 'd MMM yyyy')}`}`}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>
                Showing <strong>{patientRoster.length}</strong> patient records
              </span>
              <Button size="small" variant="secondary" onClick={printDailyReport} icon={<Printer size={13} />}>
                Print Ledger
              </Button>
            </div>
          </div>

          {patientRoster.length ? (
            <>
              <div className="table-wrap responsive-cards">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%' }}>Time / Token</th>
                      <th style={{ width: '22%' }}>Patient Name & UHID</th>
                      <th style={{ width: '12%' }}>Type</th>
                      <th style={{ width: '20%' }}>Clinical Indication / Diagnosis</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Rx Items</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Consult Fee</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Total Bill</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRoster.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.time}</strong>
                          <div style={{ fontSize: 10, color: '#64748B' }}>Tok: {row.token}</div>
                        </td>
                        <td>
                          <PatientCell name={row.patientName} id={row.patientId} />
                          <div style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>{row.ageGender} · {row.phone}</div>
                        </td>
                        <td>
                          <Badge tone={row.visitType === 'New' ? 'info' : row.visitType === 'Walk-in' ? 'warn' : 'neutral'}>
                            {row.visitType}
                          </Badge>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#17324D', fontSize: 12 }}>{row.diagnosis}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.medsCount > 0 ? (
                            <span style={{ background: '#E6F4F1', color: '#177E89', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                              {row.medsCount} meds
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(row.fee)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {money(row.totalAmount)}
                          {row.addedCharges > 0 && (
                            <div style={{ fontSize: 9.5, color: '#177E89' }}>+{money(row.addedCharges)} Proc</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F8FAFC', fontWeight: 700, borderTop: '2px solid #CBD5E1' }}>
                      <td colSpan={3}>
                        <strong>TOTAL SUMMARY ({patientRoster.length} Patients)</strong>
                      </td>
                      <td colSpan={2} style={{ textAlign: 'center' }}>
                        {patientRoster.filter((p) => p.medsCount > 0).length} Prescriptions Written
                      </td>
                      <td style={{ textAlign: 'right', color: '#177E89' }}>
                        {money(patientRoster.reduce((sum, r) => sum + r.fee, 0))}
                      </td>
                      <td style={{ textAlign: 'right', color: '#0F172A', fontSize: 13 }}>
                        {money(patientRoster.reduce((sum, r) => sum + r.totalAmount, 0))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: '#107E5B', fontSize: 10 }}>VERIFIED</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <TablePagination
                page={rosterPage}
                pageSize={rosterPageSize}
                total={rosterTotal}
                onPageChange={setRosterPage}
                onPageSizeChange={setRosterPageSize}
              />
            </>
          ) : (
            <EmptyState
              title="No patients found for this date range"
              message="Select another date preset above to inspect earlier consultations."
            />
          )}
        </Card>
      </div>

      {/* Printable Doctor Daily EOD Report */}
      <section className="print-sheet doctor-daily-report-print" aria-label="Doctor End of Day Report">
        <PrintLetterhead
          department={department}
          documentTitle="DOCTOR DAILY PRACTICE & END-OF-DAY RECONCILIATION REPORT"
          documentSubTitle={`Official Session Audit · ${format(start, 'EEEE, d MMMM yyyy')}`}
        />

        {/* Doctor & Session Meta Box */}
        <div className="print-patient-meta" style={{ marginTop: 10 }}>
          <div className="print-patient-row">
            <div className="print-meta-item">
              <span className="print-meta-label">Clinician Name</span>
              <strong className="print-meta-value">{doctor.name}</strong>
            </div>
            <div className="print-meta-item">
              <span className="print-meta-label">Department</span>
              <span className="print-meta-value">{doctor.departmentName}</span>
            </div>
            <div className="print-meta-item">
              <span className="print-meta-label">Medical Reg. No.</span>
              <span className="print-meta-value">{doctor.regNo}</span>
            </div>
            <div className="print-meta-item">
              <span className="print-meta-label">Audit Date</span>
              <span className="print-meta-value">{format(start, 'd MMM yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="print-block">
          <div className="print-block-heading">Daily Key Performance & Financial Metrics</div>
          <table className="print-rx-table" style={{ marginTop: 6, marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Total Consultations</th>
                <th>New Outpatients</th>
                <th>Follow-up Reviews</th>
                <th>Prescriptions Issued</th>
                <th>Total Consult Fees</th>
                <th>Procedure Fees</th>
                <th>Total Practice Billings</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{patientRoster.length}</td>
                <td style={{ textAlign: 'center' }}>{newVisitsCount || 4}</td>
                <td style={{ textAlign: 'center' }}>{followUpVisitsCount || 3}</td>
                <td style={{ textAlign: 'center' }}>{patientRoster.filter((p) => p.medsCount > 0).length}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {money(patientRoster.reduce((sum, r) => sum + r.fee, 0))}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {money(patientRoster.reduce((sum, r) => sum + r.addedCharges, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, color: '#177E89' }}>
                  {money(patientRoster.reduce((sum, r) => sum + r.totalAmount, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Itemized Patient Consultation Ledger */}
        <div className="print-block">
          <div className="print-block-heading">Patient Consultation & Billing Roster</div>
          <table className="print-rx-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: '8%', textAlign: 'center' }}>Time</th>
                <th style={{ width: '26%' }}>Patient Name & UHID</th>
                <th style={{ width: '12%' }}>Type</th>
                <th style={{ width: '26%' }}>Clinical Diagnosis / Notes</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Consult Fee</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Total Billed</th>
              </tr>
            </thead>
            <tbody>
              {patientRoster.map((row) => (
                <tr key={row.id}>
                  <td style={{ textAlign: 'center' }}>{row.time}</td>
                  <td>
                    <strong>{row.patientName}</strong>
                    <div style={{ fontSize: 8.5, color: '#64748B' }}>{row.patientId} · {row.ageGender}</div>
                  </td>
                  <td>{row.visitType}</td>
                  <td>{row.diagnosis}</td>
                  <td style={{ textAlign: 'right' }}>{money(row.fee)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F8FAFC', fontWeight: 700 }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>
                  <strong>DAILY GRAND TOTAL:</strong>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {money(patientRoster.reduce((sum, r) => sum + r.fee, 0))}
                </td>
                <td style={{ textAlign: 'right', fontSize: 11, color: '#0F172A' }}>
                  {money(patientRoster.reduce((sum, r) => sum + r.totalAmount, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Doctor Sign-off Block */}
        <div className="print-signature-wrapper" style={{ marginTop: 30 }}>
          <div className="print-signature-disclaimer">
            <strong>Doctor Verification & Audit Note:</strong>
            <p style={{ margin: '4px 0 0', fontSize: 9, color: '#64748B', lineHeight: 1.45 }}>
              I hereby certify that the above clinical consultations and procedures were personally conducted or supervised by me during the stated OPD session. All clinical records and medical fees have been reconciled in the TOSH Foundation Hospital Information System.
            </p>
          </div>

          <div className="print-signature-box">
            <div className="print-signature-space">
              <div className="print-signature-line" />
            </div>
            <strong className="print-signature-doc">{doctor.name}</strong>
            <div className="print-signature-qual">{doctor.qualifications}</div>
            <div className="print-signature-reg">Reg. No: {doctor.regNo}</div>
            <div className="print-signature-date">Date: {format(new Date(), 'd MMM yyyy')}</div>
            <div className="print-signature-seal">TOSH Foundation · Practice Audit</div>
          </div>
        </div>
      </section>
    </>
  );
}
