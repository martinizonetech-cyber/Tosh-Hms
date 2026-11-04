import { useEffect, useState } from 'react';
import { Check, Edit2, User } from 'lucide-react';
import type { Department, Gender, Patient } from '../../types/domain';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, TextAreaField } from '../../components/ui/Field';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../services/auth/AuthContext';
import { getAge } from '../../utils/format';

interface EditPatientModalProps {
  open: boolean;
  patient: Patient | null;
  onClose: () => void;
  onSuccess?: (updated: Patient) => void;
}

const GENDER_OPTIONS: Gender[] = ['Female', 'Male', 'Other', 'Prefer not to say'];

export function EditPatientModal({
  open,
  patient,
  onClose,
  onSuccess,
}: EditPatientModalProps) {
  const { repository } = useHospitalData() as any;
  const { user } = useAuth();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender>('Female');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [departments, setDepartments] = useState<Department[]>(['skin']);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (patient) {
      setFullName(patient.fullName || '');
      setDateOfBirth(patient.dateOfBirth || '');
      setGender(patient.gender || 'Female');
      setPhone(patient.phone || '');
      setEmail(patient.email || '');
      setAddress(patient.address || '');
      setEmergencyContact(patient.emergencyContact || '');
      setDepartments(patient.departments && patient.departments.length ? patient.departments : ['skin']);
      setErrors({});
    }
  }, [patient, open]);

  if (!open || !patient) return null;

  const toggleDepartment = (dept: Department) => {
    if (departments.includes(dept)) {
      if (departments.length === 1) {
        toast.push('A patient must be enrolled in at least one department.', 'error');
        return;
      }
      setDepartments(departments.filter((d) => d !== dept));
    } else {
      setDepartments([...departments, dept]);
    }
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    const cleanName = fullName.trim();
    if (!cleanName || cleanName.length < 2) {
      nextErrors.fullName = 'Full name must be at least 2 characters.';
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.length > 13) {
      nextErrors.phone = 'Phone number must be between 7 and 13 digits.';
    }

    if (!dateOfBirth) {
      nextErrors.dateOfBirth = 'Date of birth is required.';
    } else {
      const dobDate = new Date(`${dateOfBirth}T00:00:00`);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
      }
    }

    const cleanAddress = address.trim();
    if (!cleanAddress || cleanAddress.length < 4) {
      nextErrors.address = 'Address must be at least 4 characters.';
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim();
      if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        nextErrors.email = 'Enter a valid email address.';
      }
    }

    if (!departments.length) {
      nextErrors.departments = 'Select at least one department.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user && user.role !== 'reception') {
      toast.push('Only reception desk staff can edit patient profiles.', 'error');
      return;
    }
    if (!validate()) return;

    setSaving(true);
    try {
      const patch = {
        fullName: fullName.trim(),
        dateOfBirth,
        gender,
        phone: phone.replace(/\D/g, ''),
        email: email.trim() || undefined,
        address: address.trim(),
        emergencyContact: emergencyContact.trim() || undefined,
        departments,
      };

      let updatedPatient: Patient;
      if (repository?.updatePatient) {
        updatedPatient = await repository.updatePatient(patient.id, patch);
      } else {
        // Fallback
        updatedPatient = { ...patient, ...patch };
      }

      toast.push(`Patient profile for ${updatedPatient.fullName} updated successfully.`, 'success');
      onSuccess?.(updatedPatient);
      onClose();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Failed to update patient profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const calculatedAge = dateOfBirth ? getAge(dateOfBirth) : null;

  return (
    <Modal
      open={open}
      title="Edit Patient Profile"
      subtitle={`${patient.id} · Registered ${patient.registeredAt?.split('T')[0] || ''}`}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSave} className="stack" style={{ gap: '16px' }}>
        {/* Section 1: Demographics */}
        <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <User size={16} color="var(--navy)" />
            <strong style={{ fontSize: '13.5px', color: 'var(--navy)' }}>Personal Information</strong>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <Field
              id="edit-patient-name"
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              error={errors.fullName}
              required
            />

            <div className="field">
              <label htmlFor="edit-patient-gender">
                Gender <span aria-hidden="true">*</span>
              </label>
              <select
                id="edit-patient-gender"
                className="control select-field"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="edit-patient-dob">
                Date of Birth <span aria-hidden="true">*</span>
                {calculatedAge !== null && (
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--teal)', fontWeight: 600 }}>
                    ({calculatedAge} yrs)
                  </span>
                )}
              </label>
              <input
                id="edit-patient-dob"
                type="date"
                className="control"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
              {errors.dateOfBirth && <span className="field-error">{errors.dateOfBirth}</span>}
            </div>
          </div>
        </div>

        {/* Section 2: Contact Information */}
        <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--navy)', marginBottom: '12px' }}>
            Contact & Address Details
          </strong>

          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <Field
              id="edit-patient-phone"
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              error={errors.phone}
              required
            />

            <Field
              id="edit-patient-email"
              label="Email Address (Optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. patient@gmail.com"
              error={errors.email}
            />

            <Field
              id="edit-patient-emergency"
              label="Emergency Contact (Optional)"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="e.g. Spouse: 9876500000"
            />
          </div>

          <TextAreaField
            id="edit-patient-address"
            label="Residential Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address, locality, city, pin code"
            error={errors.address}
            required
            rows={2}
          />
        </div>

        {/* Section 3: Departments Enrolled */}
        <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--navy)', marginBottom: '6px' }}>
            Enrolled Clinical Departments
          </strong>
          <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--muted)' }}>
            Select which specialties this patient visits at TOSH Foundation.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => toggleDepartment('skin')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: departments.includes('skin') ? '2px solid #0284C7' : '1px solid #CBD5E1',
                background: departments.includes('skin') ? '#EFF6FF' : '#FFFFFF',
                color: departments.includes('skin') ? '#0369A1' : '#475569',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  border: departments.includes('skin') ? '1px solid #0284C7' : '1px solid #94A3B8',
                  background: departments.includes('skin') ? '#0284C7' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                }}
              >
                {departments.includes('skin') && <Check size={12} strokeWidth={3} />}
              </span>
              Skin & Dermatology
            </button>

            <button
              type="button"
              onClick={() => toggleDepartment('orthopaedics')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: departments.includes('orthopaedics') ? '2px solid #0D9488' : '1px solid #CBD5E1',
                background: departments.includes('orthopaedics') ? '#F0FDFA' : '#FFFFFF',
                color: departments.includes('orthopaedics') ? '#0F766E' : '#475569',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  border: departments.includes('orthopaedics') ? '1px solid #0D9488' : '1px solid #94A3B8',
                  background: departments.includes('orthopaedics') ? '#0D9488' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                }}
              >
                {departments.includes('orthopaedics') && <Check size={12} strokeWidth={3} />}
              </span>
              Orthopaedics & Joint Surgery
            </button>
          </div>
          {errors.departments && <span className="field-error" style={{ marginTop: 6, display: 'block' }}>{errors.departments}</span>}
        </div>

        {/* Modal Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving} icon={<Edit2 size={14} />}>
            {saving ? 'Saving changes...' : 'Save Patient Profile'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

