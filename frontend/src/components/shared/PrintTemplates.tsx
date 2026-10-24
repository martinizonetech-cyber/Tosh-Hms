import type { Department, PrescriptionItem, Vitals } from '../../types/domain';
import { dateLabel, getAge } from '../../utils/format';

export const DOCTOR_DETAILS: Record<Department, { name: string; title: string; qualifications: string; regNo: string; departmentName: string }> = {
  skin: {
    name: 'Dr. Sangamitra',
    title: 'Consultant Dermatologist & Cosmetologist',
    qualifications: 'MBBS, MD (Dermatology, Venereology & Leprosy)',
    regNo: 'MMC-2015/07/2190',
    departmentName: 'Department of Dermatology & Skin Care',
  },
  orthopaedics: {
    name: 'Dr. Sundarprakash',
    title: 'Consultant Orthopaedic & Joint Replacement Surgeon',
    qualifications: 'MBBS, MS (Orthopaedics), DNB (Ortho)',
    regNo: 'MMC-2012/04/1082',
    departmentName: 'Department of Orthopaedics & Joint Surgery',
  },
};

/**
 * Official TOSH Foundation hospital letterhead for all printed documents
 */
export function PrintLetterhead({
  department,
  documentTitle,
  documentSubTitle,
}: {
  department?: Department;
  documentTitle: string;
  documentSubTitle?: string;
}) {
  const doc = department ? DOCTOR_DETAILS[department] : undefined;

  return (
    <div className="print-letterhead">
      <div className="print-letterhead-top">
        <div className="print-letterhead-brand">
          <img src="/tosh-icon-circle.png" alt="TOSH Foundation Logo" className="print-letterhead-logo" />
          <div className="print-letterhead-info">
            <h1 className="print-letterhead-title">TOSH FOUNDATION</h1>
            <p className="print-letterhead-tagline">Multispeciality Hospital & Research Center</p>
            <p className="print-letterhead-dept">
              {doc ? doc.departmentName : 'Department of Outpatient & Surgical Services'}
            </p>
          </div>
        </div>

        <div className="print-letterhead-contacts">
          <div>Plot 14, Senapati Bapat Road, Pune - 411016</div>
          <div>Tel: +91 20 6700 8000 · OPD Desk: ext. 102 / 104</div>
          <div>Emergency: 1066 · care@toshfoundation.org</div>
          <div className="print-letterhead-reg">Hosp. Reg. No: MAH/PUN/HOSP/2018/4891</div>
        </div>
      </div>

      {doc && (
        <div className="print-letterhead-doctor">
          <div className="print-doc-primary">
            <strong>{doc.name}</strong>
            <span className="print-doc-qual">{doc.qualifications}</span>
          </div>
          <div className="print-doc-secondary">
            <span>{doc.title}</span>
            <span className="print-doc-reg">Reg. No: {doc.regNo}</span>
          </div>
        </div>
      )}

      <div className="print-letterhead-bar">
        <div className="print-doc-heading">
          <h2>{documentTitle}</h2>
          {documentSubTitle && <span>{documentSubTitle}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Standard Patient Information Box
 */
export function PrintPatientMeta({
  patient,
  visitedAt,
  doctorName,
  tokenOrVisitLabel,
}: {
  patient: { id: string; fullName: string; dateOfBirth?: string; gender: string; phone?: string; address?: string };
  visitedAt: string;
  doctorName?: string;
  tokenOrVisitLabel?: string;
}) {
  const age = patient.dateOfBirth ? `${getAge(patient.dateOfBirth)} Yrs` : '—';

  return (
    <div className="print-patient-meta">
      <div className="print-patient-row">
        <div className="print-meta-item">
          <span className="print-meta-label">Patient Name</span>
          <strong className="print-meta-value">{patient.fullName}</strong>
        </div>
        <div className="print-meta-item">
          <span className="print-meta-label">UHID / Patient ID</span>
          <strong className="print-meta-value">{patient.id}</strong>
        </div>
        <div className="print-meta-item">
          <span className="print-meta-label">Age / Gender</span>
          <span className="print-meta-value">{age} / {patient.gender}</span>
        </div>
        <div className="print-meta-item">
          <span className="print-meta-label">Date & Time</span>
          <span className="print-meta-value">{dateLabel(visitedAt, 'd MMM yyyy, h:mm a')}</span>
        </div>
      </div>

      <div className="print-patient-row secondary">
        <div className="print-meta-item">
          <span className="print-meta-label">Contact No.</span>
          <span className="print-meta-value">{patient.phone || '—'}</span>
        </div>
        {doctorName && (
          <div className="print-meta-item">
            <span className="print-meta-label">Consulting Clinician</span>
            <span className="print-meta-value">{doctorName}</span>
          </div>
        )}
        <div className="print-meta-item">
          <span className="print-meta-label">Visit Type</span>
          <span className="print-meta-value">{tokenOrVisitLabel || 'OPD Consultation'}</span>
        </div>
        <div className="print-meta-item">
          <span className="print-meta-label">Address</span>
          <span className="print-meta-value">{patient.address || 'Pune, Maharashtra'}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean Vitals Panel
 */
export function PrintVitalsPanel({ vitals }: { vitals: Vitals }) {
  const items = [
    { label: 'Blood Pressure', val: vitals.bloodPressure ? `${vitals.bloodPressure} mmHg` : null },
    { label: 'Pulse Rate', val: vitals.pulse ? `${vitals.pulse} bpm` : null },
    { label: 'Temperature', val: vitals.temperature ? `${vitals.temperature} °F` : null },
    { label: 'Oxygen Saturation (SpO2)', val: vitals.oxygenSaturation ? `${vitals.oxygenSaturation} %` : null },
    { label: 'Height', val: vitals.height ? `${vitals.height} cm` : null },
    { label: 'Weight', val: vitals.weight ? `${vitals.weight} kg` : null },
  ];

  const recorded = items.filter((i) => i.val !== null);

  if (!recorded.length) {
    return (
      <div className="print-block vitals-block">
        <div className="print-block-heading">Vitals & Triage Examination</div>
        <p className="print-block-content print-muted">Triage vitals recorded within standard outpatient parameters.</p>
      </div>
    );
  }

  return (
    <div className="print-block vitals-block">
      <div className="print-block-heading">Recorded Vitals</div>
      <div className="print-vitals-grid">
        {items.map((item) => (
          <div key={item.label} className="print-vital-tile">
            <span className="print-vital-tile-label">{item.label}</span>
            <strong className="print-vital-tile-value">{item.val || '—'}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Standard Rx Medication Table
 */
export function PrintRxTable({ items }: { items: PrescriptionItem[] }) {
  if (!items.length) {
    return (
      <div className="print-block">
        <p className="print-muted">No oral or topical medications prescribed in this consultation.</p>
      </div>
    );
  }

  return (
    <div className="print-rx-section">
      <div className="print-rx-symbol">℞</div>
      <table className="print-rx-table">
        <thead>
          <tr>
            <th style={{ width: '4%' }}>#</th>
            <th style={{ width: '32%' }}>Medicine Name & Strength</th>
            <th style={{ width: '14%' }}>Dosage & Route</th>
            <th style={{ width: '16%' }}>Frequency</th>
            <th style={{ width: '12%' }}>Duration</th>
            <th style={{ width: '22%' }}>Instructions / Food</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="print-cell-center">{idx + 1}</td>
              <td>
                <div className="print-med-name">{item.medicineName}</div>
                <div className="print-med-strength">{item.strength}</div>
              </td>
              <td>
                <div>{item.dosage}</div>
                <span className="print-med-sub">{item.route}</span>
              </td>
              <td>
                <strong className="print-freq">{item.frequency}</strong>
              </td>
              <td>
                <span className="print-duration">{item.duration}</span>
              </td>
              <td className="print-med-instructions">
                {item.instructions || 'As advised'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Clinician Signature Section
 */
export function PrintDoctorSignatureBlock({
  doctorName,
  department,
  date,
}: {
  doctorName?: string;
  department: Department;
  date: string;
}) {
  const doc = DOCTOR_DETAILS[department];
  const name = doctorName || doc.name;

  return (
    <div className="print-signature-wrapper">
      <div className="print-signature-disclaimer">
        <strong>Important Medical Advice:</strong>
        <ul>
          <li>Take medicines exactly as prescribed with sufficient water.</li>
          <li>Do not discontinue medications abruptly without consulting your doctor.</li>
          <li>Review in OPD after course completion or SOS if pain/symptoms aggravate.</li>
        </ul>
      </div>

      <div className="print-signature-box">
        <div className="print-signature-space">
          <div className="print-signature-line" />
        </div>
        <strong className="print-signature-doc">{name}</strong>
        <div className="print-signature-qual">{doc.qualifications}</div>
        <div className="print-signature-reg">Reg. No: {doc.regNo}</div>
        <div className="print-signature-date">Date: {dateLabel(date, 'd MMM yyyy')}</div>
        <div className="print-signature-seal">TOSH Foundation · OPD Clinic</div>
      </div>
    </div>
  );
}
