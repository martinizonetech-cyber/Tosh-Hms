import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, Stethoscope, UserRound, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { dateLabel, getAge, isSameISODate, matchesDateSearch } from '../../utils/format';
import { matchesPatient } from '../../utils/patientSearch';
import { PageHeading, PatientAvatar, PatientCell } from '../../components/shared/Primitives';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

export function DoctorPatientsPage({ department }: { department: Department }) {
  const { state } = useHospitalData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (val.trim()) {
      setSearchParams({ q: val.trim() }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const role = department === 'skin' ? 'skin' : 'ortho';
  const departmentPatients = useMemo(
    () => state.patients.filter((patient) => patient.departments.includes(department)),
    [department, state.patients]
  );

  const patients = useMemo(() => {
    const q = query.trim().toLowerCase();

    return departmentPatients
      .filter((patient) => {
        // Patient's department consultations & appointments
        const patientConsultations = state.consultations.filter(
          (c) => c.patientId === patient.id && c.department === department
        );
        const patientAppointments = state.appointments.filter(
          (a) => a.patientId === patient.id && a.department === department
        );

        // 1. Filter by selected date picker
        if (selectedDate) {
          const hasConsultationOnDate = patientConsultations.some((c) =>
            isSameISODate(c.visitedAt, selectedDate)
          );
          const hasAppointmentOnDate = patientAppointments.some((a) =>
            isSameISODate(a.startsAt, selectedDate)
          );
          const hasLatestVisitOnDate = isSameISODate(patient.latestVisitAt, selectedDate);
          const hasRegistrationOnDate = isSameISODate(patient.registeredAt, selectedDate);

          if (!hasConsultationOnDate && !hasAppointmentOnDate && !hasLatestVisitOnDate && !hasRegistrationOnDate) {
            return false;
          }
        }

        // 2. Filter by search query (name, ID, phone, email, or date string like 'Oct 11')
        if (q) {
          const textMatches = matchesPatient(patient, q);

          const dateMatches =
            matchesDateSearch(patient.latestVisitAt, q) ||
            matchesDateSearch(patient.registeredAt, q) ||
            patientConsultations.some((c) => matchesDateSearch(c.visitedAt, q)) ||
            patientAppointments.some((a) => matchesDateSearch(a.startsAt, q));

          if (!textMatches && !dateMatches) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [department, departmentPatients, query, selectedDate, state.appointments, state.consultations]);

  const { page, setPage, pageSize, setPageSize, pagedItems: paginatedRows, total } = usePagination(patients, 5);

  return <>
    <PageHeading eyebrow={`${department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics'} · Records`} title="Patients" description="Open patient history and continue into a consultation workspace." actions={<Badge tone="info">{patients.length} records</Badge>} />
    <Card padded={false}>
      <div style={{ padding: '20px 24px 0' }}>
        <SectionHeading title="Department patients" subtitle="Patient records created at Reception appear here automatically. Filter by name, phone, or visit date." />
      </div>
      <div className="toolbar" style={{ padding: '0 24px' }}>
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search doctor patient list"
            placeholder="Search by patient name, ID, phone, or date (e.g. 'Oct 11')..."
            value={query}
            onChange={(event) => {
              handleQueryChange(event.target.value);
              setPage(1);
            }}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              style={{ width: 22, height: 22, marginLeft: 'auto', border: 0 }}
              onClick={() => {
                handleQueryChange('');
                setPage(1);
              }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <label className="date-control" title="Filter patients with visits or appointments on a specific date">
          <CalendarDays size={15} color="var(--teal)" />
          <span className="sr-only">Filter by date</span>
          <input
            aria-label="Filter patients by visit or appointment date"
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setPage(1);
            }}
          />
        </label>

        {selectedDate && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setSelectedDate('');
              setPage(1);
            }}
          >
            Clear date
          </Button>
        )}

        <span className="result-count">{patients.length} patients</span>
      </div>
      {paginatedRows.length ? (
        <>
          <div className="table-wrap responsive-cards">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 55, textAlign: 'center' }}>S.No</th>
                  <th>Patient</th>
                  <th>Age / gender</th>
                  <th>Phone</th>
                  <th>Latest visit</th>
                  <th>Clinical status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((patient, index) => {
                  const sno = (page - 1) * pageSize + index + 1;
                  const visit = state.consultations.find((item) => item.patientId === patient.id && item.department === department);
                  const matchingVisit = selectedDate
                    ? state.consultations.find(
                        (item) =>
                          item.patientId === patient.id &&
                          item.department === department &&
                          isSameISODate(item.visitedAt, selectedDate)
                      )
                    : null;
                  return (
                    <tr key={patient.id}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>{sno}</td>
                      <td><PatientCell name={patient.fullName} id={patient.id} /></td>
                      <td>{getAge(patient.dateOfBirth) ?? '—'} · {patient.gender}</td>
                      <td>{patient.phone}</td>
                      <td>
                        {matchingVisit ? (
                          <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
                            {dateLabel(matchingVisit.visitedAt)}
                          </span>
                        ) : patient.latestVisitAt ? (
                          dateLabel(patient.latestVisitAt)
                        ) : (
                          'No visit yet'
                        )}
                      </td>
                      <td><Badge tone={visit?.status === 'Finalized' ? 'success' : 'neutral'}>{visit?.status ?? 'No consultation'}</Badge></td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => navigate(`/${role}/consultation/${patient.id}`)}
                          icon={<Stethoscope size={13} />}
                        >
                          Open consultation
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="patient-card-list doctor-patient-cards">
            {paginatedRows.map((patient) => {
              const visit = state.consultations.find((item) => item.patientId === patient.id && item.department === department);
              return (
                <article className="patient-card" key={patient.id}>
                  <div className="patient-card-head">
                    <div className="patient-card-name">
                      <PatientAvatar name={patient.fullName} />
                      <div>
                        <strong>{patient.fullName}</strong>
                        <span>{patient.id} · {getAge(patient.dateOfBirth) ?? '—'} years · {patient.gender}</span>
                      </div>
                    </div>
                    <Badge tone={visit?.status === 'Finalized' ? 'success' : 'neutral'}>{visit?.status ?? 'No consultation'}</Badge>
                  </div>
                  <div className="patient-card-meta">
                    <div><small>Phone</small><strong>{patient.phone}</strong></div>
                    <div><small>Latest visit</small><strong>{patient.latestVisitAt ? dateLabel(patient.latestVisitAt) : 'No visit yet'}</strong></div>
                  </div>
                  <Button variant="secondary" size="small" className="btn-full" style={{ marginTop: 12 }} onClick={() => navigate(`/${role}/consultation/${patient.id}`)}>Open consultation</Button>
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
          title={query ? 'No matching patients found' : 'No patients in this department'}
          message={query ? `No patients matched "${query}". Try searching by another name, ID, or phone number.` : 'New records added by Reception will become visible in the shared demo data.'}
          icon={<UserRound size={18} />}
          action={query ? <Button variant="secondary" onClick={() => { handleQueryChange(''); setPage(1); }}>Clear search</Button> : undefined}
        />
      )}
    </Card>
  </>;
}
