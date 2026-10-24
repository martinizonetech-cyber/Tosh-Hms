import { useMemo, useState } from 'react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { CalendarDays, Search, Stethoscope, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, timeLabel } from '../../utils/format';
import { PageHeading, PatientCell } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

export function DoctorAppointmentsPage({ department }: { department: Department }) {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const navigate = useNavigate();
  const role = department === 'skin' ? 'skin' : 'ortho';
  const title = department === 'skin' ? 'Skin appointments' : 'Orthopaedic appointments';

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showAllDates, setShowAllDates] = useState(false);

  const rows = useMemo(() => {
    return state.appointments
      .filter((item) => {
        const patient = state.patients.find((person) => person.id === item.patientId);
        return (
          item.department === department &&
          (!query ||
            `${patient?.fullName ?? ''} ${patient?.id ?? ''} ${patient?.phone ?? ''}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (status === 'all' || item.status === status) &&
          (showAllDates || isSameDay(new Date(item.startsAt), startOfDay(new Date(`${date}T00:00:00`))))
        );
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [date, department, query, showAllDates, state.appointments, state.patients, status]);

  const { page, setPage, pageSize, setPageSize, pagedItems: paginatedRows, total } = usePagination(rows, 5);

  const updateStatus = (id: string, next: 'In progress' | 'Completed') => {
    try {
      repository.updateAppointment(id, { status: next });
      toast.push(next === 'In progress' ? 'Consultation started; queue state updated.' : 'Visit completed in shared demo data.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not update appointment.', 'error');
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={`${department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics'} · Schedule`}
        title={title}
        description="Reception appointment and check-in changes appear in this shared demo schedule."
      />
      <Card padded={false}>
        <div style={{ padding: '20px 24px 0' }}>
          <SectionHeading title="Department schedule" subtitle="Choose a date or view all dates in the demo record." />
        </div>

        <div className="toolbar" style={{ padding: '0 24px' }}>
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search department appointments"
              placeholder="Search patient name, ID, or phone..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
            {query && (
              <button
                type="button"
                className="icon-button"
                style={{ width: 22, height: 22, border: 0 }}
                onClick={() => setQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <label className="date-control">
            <CalendarDays size={15} color="var(--teal)" />
            <span className="sr-only">Appointment date</span>
            <input
              aria-label="Appointment date"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setShowAllDates(false);
                setPage(1);
              }}
            />
          </label>

          <select
            className="select-field"
            aria-label="Filter appointments by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {['Scheduled', 'Checked-in', 'In progress', 'Completed', 'Cancelled', 'No-show'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <Button
            variant={showAllDates ? 'primary' : 'secondary'}
            size="small"
            onClick={() => {
              setShowAllDates((value) => !value);
              setPage(1);
            }}
          >
            {showAllDates ? 'All dates' : 'Today only'}
          </Button>

          <span className="result-count">{rows.length} visits</span>
        </div>

        {paginatedRows.length ? (
          <>
            <div className="table-wrap responsive-cards">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 55, textAlign: 'center' }}>S.No</th>
                    <th>Patient</th>
                    <th>Time & Date</th>
                    <th>Visit / Note</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((item, index) => {
                    const sno = (page - 1) * pageSize + index + 1;
                    const patient = state.patients.find((person) => person.id === item.patientId);
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>{sno}</td>
                        <td>
                          <PatientCell name={patient?.fullName ?? 'Patient'} id={patient?.id ?? item.patientId} />
                        </td>
                        <td>
                          <span className="appointment-time">{timeLabel(item.startsAt)}</span>
                          <span className="table-subtext">{dateLabel(item.startsAt)}</span>
                        </td>
                        <td>
                          <strong>{item.visitType}</strong>
                          <span className="table-subtext">{item.note || 'No scheduling note'}</span>
                        </td>
                        <td>
                          <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div className="appointment-actions" style={{ justifyContent: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                            {!['Completed', 'Cancelled', 'No-show'].includes(item.status) && (
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={() => updateStatus(item.id, 'In progress')}
                                icon={<Stethoscope size={13} />}
                              >
                                Start
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => navigate(`/${role}/consultation/${item.patientId}`)}
                            >
                              Open
                            </Button>
                            {item.status !== 'Completed' && !['Cancelled', 'No-show'].includes(item.status) && (
                              <Button variant="ghost" size="small" onClick={() => updateStatus(item.id, 'Completed')}>
                                Complete
                              </Button>
                            )}
                          </div>
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
          <EmptyState
            title="No appointments found"
            message="Choose a different date or check that Reception has scheduled a visit for this department."
            icon={<CalendarDays size={18} />}
          />
        )}
      </Card>
    </>
  );
}
