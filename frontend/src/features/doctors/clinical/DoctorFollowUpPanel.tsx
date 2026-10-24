import { useMemo, useState } from 'react';
import { CalendarPlus, Check, MessageCircle } from 'lucide-react';
import type { Consultation, Department } from '../../../types/domain';
import { useHospitalData } from '../../../services/mock/DemoProvider';
import { useToast } from '../../../components/ui/Toast';
import { dateLabel, departmentLabel } from '../../../utils/format';
import { Badge, statusTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { Field, TextAreaField } from '../../../components/ui/Field';

export function DoctorFollowUpPanel({
  patientId,
  department,
  doctor,
  consultation,
  onChange,
}: {
  patientId: string;
  department: Department;
  doctor: string;
  consultation: Consultation;
  onChange: (patch: Partial<Consultation>) => void;
}) {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [date, setDate] = useState(consultation.followUpDate ?? '');
  const [note, setNote] = useState('');

  const followups = useMemo(
    () =>
      state.followUps
        .filter((item) => item.patientId === patientId && item.department === department)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [department, patientId, state.followUps],
  );

  const add = async () => {
    if (!date) {
      toast.push('Please select a follow-up date before clicking Add follow-up.', 'error');
      return;
    }
    try {
      await repository.addFollowUp({
        patientId,
        department,
        doctor,
        date,
        note: note.trim() || undefined,
      });
      // Apply follow-up date to consultation ONLY when "Add follow-up" button is clicked
      onChange({ followUpDate: date });
      toast.push(`Follow-up scheduled for ${dateLabel(`${date}T00:00:00`)} and applied to consultation.`, 'success');
      setNote('');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not add follow-up.', 'error');
    }
  };

  const clearFollowUp = () => {
    setDate('');
    onChange({ followUpDate: undefined });
    toast.push('Follow-up date cleared from consultation.', 'info');
  };

  return (
    <div className="stack">
      <Card>
        <SectionHeading
          title="Plan a follow-up"
          subtitle="Choose a date and click 'Add follow-up' to apply it to this consultation and Reception schedule."
        />
        <div className="form-grid">
          <Field
            id="doctor-followup-date"
            label="Follow-up date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextAreaField
            id="doctor-followup-note"
            label="Clinician-entered instructions (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Doctor-entered follow-up note"
          />
        </div>

        {consultation.followUpDate ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              color: '#166534',
              fontSize: 13,
              marginTop: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={16} />
              <span>
                Applied consultation follow-up: <strong>{dateLabel(`${consultation.followUpDate}T00:00:00`)}</strong>
              </span>
            </div>
            <Button
              variant="ghost"
              size="small"
              onClick={clearFollowUp}
              style={{ color: '#DC2626', height: 26, padding: '0 8px' }}
            >
              Clear
            </Button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              color: '#64748B',
              fontSize: 13,
              marginTop: 12,
            }}
          >
            <CalendarPlus size={15} />
            <span>
              Follow-up not yet applied. Click <strong>Add follow-up</strong> to apply and schedule.
            </span>
          </div>
        )}

        <div className="button-row" style={{ marginTop: 14 }}>
          <Button onClick={add} icon={<CalendarPlus size={14} />}>
            Add follow-up
          </Button>
        </div>

        <div className="hint-banner" style={{ marginTop: 13 }}>
          <MessageCircle size={15} />
          <span>
            Follow-up dates will appear in the Reception follow-up list once added using the button above. Finalizing
            the consultation will not automatically create follow-ups.
          </span>
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Patient follow-up history"
          subtitle={`${departmentLabel(department)} · shared records`}
        />
        {followups.length ? (
          followups.map((item) => (
            <div className="list-row" key={item.id}>
              <div className="list-row-main">
                <strong>{dateLabel(`${item.date}T00:00:00`)}</strong>
                <span>
                  {item.note || 'No note'} · Reminder {item.reminderStatus}
                </span>
              </div>
              <Badge tone={statusTone(item.status)}>{item.status}</Badge>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h3>No follow-up scheduled</h3>
            <p>Choose a date above and click "Add follow-up" to create a scheduled follow-up.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
