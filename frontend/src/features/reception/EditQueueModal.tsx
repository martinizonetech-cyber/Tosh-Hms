import { useEffect, useState } from 'react';
import { Activity, Check, Clock3, Stethoscope, User } from 'lucide-react';
import type { Department, Patient, QueueEntry, VisitType, Vitals } from '../../types/domain';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge, statusTone } from '../../components/ui/Badge';
import { TextAreaField } from '../../components/ui/Field';

interface EditQueueModalProps {
  open: boolean;
  entry: QueueEntry | null;
  patient: Patient | null;
  doctors: Record<Department, string[]>;
  onClose: () => void;
  onSave: (updatedData: {
    id: string;
    department: Department;
    doctor: string;
    visitType: VisitType;
    status: QueueEntry['status'];
    note?: string;
    vitals?: Vitals;
    patientPhone?: string;
    patientAddress?: string;
  }) => Promise<void>;
}

const vitalFields: { key: keyof Vitals; label: string; placeholder: string }[] = [
  { key: 'bloodPressure', label: 'Blood pressure', placeholder: 'e.g. 118/76' },
  { key: 'pulse', label: 'Pulse', placeholder: 'e.g. 72 bpm' },
  { key: 'temperature', label: 'Temperature', placeholder: 'e.g. 36.8 °C' },
  { key: 'height', label: 'Height', placeholder: 'e.g. 168 cm' },
  { key: 'weight', label: 'Weight', placeholder: 'e.g. 64 kg' },
  { key: 'oxygenSaturation', label: 'Oxygen saturation', placeholder: 'e.g. 98%' },
];

export function EditQueueModal({
  open,
  entry,
  patient,
  doctors,
  onClose,
  onSave,
}: EditQueueModalProps) {
  const [department, setDepartment] = useState<Department>('skin');
  const [doctor, setDoctor] = useState('');
  const [visitType, setVisitType] = useState<VisitType>('New');
  const [status, setStatus] = useState<QueueEntry['status']>('Waiting');
  const [note, setNote] = useState('');
  const [vitals, setVitals] = useState<Vitals>({
    bloodPressure: '',
    pulse: '',
    temperature: '',
    height: '',
    weight: '',
    oxygenSaturation: '',
  });
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setDepartment(entry.department || 'skin');
      setDoctor(entry.doctor || (doctors[entry.department || 'skin']?.[0] ?? ''));
      setVisitType(entry.visitType || 'New');
      setStatus(entry.status || 'Waiting');
      setNote(entry.note || '');
      setVitals({
        bloodPressure: entry.vitals?.bloodPressure || '',
        pulse: entry.vitals?.pulse || '',
        temperature: entry.vitals?.temperature || '',
        height: entry.vitals?.height || '',
        weight: entry.vitals?.weight || '',
        oxygenSaturation: entry.vitals?.oxygenSaturation || '',
      });
    }
    if (patient) {
      setPatientPhone(patient.phone || '');
      setPatientAddress(patient.address || '');
    }
  }, [entry, patient, doctors]);

  const handleDepartmentChange = (newDept: Department) => {
    setDepartment(newDept);
    const availableDocs = doctors[newDept] || [];
    if (!availableDocs.includes(doctor)) {
      setDoctor(availableDocs[0] || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;

    setSaving(true);
    try {
      await onSave({
        id: entry.id,
        department,
        doctor: doctor || (doctors[department]?.[0] ?? ''),
        visitType,
        status,
        note: note.trim() || undefined,
        vitals,
        patientPhone: patientPhone.trim() || undefined,
        patientAddress: patientAddress.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Queue Entry · Token ${entry.token}`}
      subtitle={`Modify check-in details, assigned doctor, vitals, or status for this visit.`}
      wide
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        {/* Patient overview header banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '14px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#13808D',
                color: '#FFFFFF',
              }}
            >
              {entry.token}
            </span>
            <div>
              <strong style={{ fontSize: '14px', color: 'var(--navy)', display: 'block' }}>
                {patient?.fullName ?? 'Patient'}
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {patient?.id ?? entry.patientId} · {patient?.gender} · {patientPhone || patient?.phone}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Clock3 size={13} />
              Arrived: {new Date(entry.arrivalAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </span>
            <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
          </div>
        </div>

        {/* Primary visit configuration */}
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="edit-queue-dept">
              <Stethoscope size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Department
            </label>
            <select
              id="edit-queue-dept"
              className="control"
              value={department}
              onChange={(e) => handleDepartmentChange(e.target.value as Department)}
            >
              <option value="skin">Skin / Dermatology</option>
              <option value="orthopaedics">Orthopaedics</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="edit-queue-doctor">Consulting Doctor</label>
            <select
              id="edit-queue-doctor"
              className="control"
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
            >
              {(doctors[department] || []).map((docName) => (
                <option key={docName} value={docName}>
                  {docName}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="edit-queue-visit-type">Visit Type</label>
            <select
              id="edit-queue-visit-type"
              className="control"
              value={visitType}
              onChange={(e) => setVisitType(e.target.value as VisitType)}
            >
              <option value="New">New</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Walk-in">Walk-in</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="edit-queue-status">Queue Status</label>
            <select
              id="edit-queue-status"
              className="control"
              value={status}
              onChange={(e) => setStatus(e.target.value as QueueEntry['status'])}
            >
              <option value="Waiting">Waiting</option>
              <option value="Consulting">Consulting</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Patient contact corrections */}
        <div style={{ background: '#FDFBF7', border: '1px solid #EFEAE0', borderRadius: '8px', padding: '12px 14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <User size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
            Patient Contact Corrections
          </span>
          <div className="form-grid two" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="edit-patient-phone">Mobile Number</label>
              <input
                id="edit-patient-phone"
                className="control"
                type="tel"
                maxLength={10}
                value={patientPhone}
                placeholder="10-digit mobile number"
                onChange={(e) => setPatientPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-patient-address">Address</label>
              <input
                id="edit-patient-address"
                className="control"
                maxLength={150}
                value={patientAddress}
                placeholder="Street address, city"
                onChange={(e) => setPatientAddress(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Description / Chief complaint */}
        <TextAreaField
          id="edit-queue-description"
          label="Description / Chief Complaint"
          placeholder="Enter reason for visit or chief complaint..."
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* Reception-entered vitals */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', display: 'block', marginBottom: '10px' }}>
            <Activity size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2, color: 'var(--teal)' }} />
            Reception-Entered Vitals
          </span>
          <div className="vitals-entry-grid">
            {vitalFields.map(({ key, label, placeholder }) => (
              <div className="field" key={key}>
                <label htmlFor={`edit-vital-${key}`} style={{ fontSize: '11px' }}>{label}</label>
                <input
                  id={`edit-vital-${key}`}
                  className="control"
                  value={vitals[key] || ''}
                  placeholder={placeholder}
                  onChange={(e) => setVitals((curr) => ({ ...curr, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Modal actions footer */}
        <div className="button-row" style={{ marginTop: '8px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} icon={<Check size={14} />}>
            {saving ? 'Saving changes…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
