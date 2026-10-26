import { useMemo } from 'react';
import type { Consultation, Department } from '../../../types/domain';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { TextAreaField } from '../../../components/ui/Field';
import { readBodyRegionTemplates } from './bodyRegionTemplates';

export function ClinicalNotesPanel({ department, consultation, onChange }: { department: Department; consultation: Consultation; onChange: (patch: Partial<Consultation>) => void }) {
  const regionOptions = useMemo(() => {
    const configured = readBodyRegionTemplates().map((t) => t.region);
    const defaults = ['Knee', 'Shoulder', 'Hip', 'Spine', 'Elbow', 'Wrist', 'Ankle', 'Foot', 'Other'];
    return Array.from(new Set([...configured, ...defaults]));
  }, []);

  return <div className="stack">
    <Card><SectionHeading title="Patient-reported symptoms" subtitle="Enter the patient’s own report in the clinician’s words." /><TextAreaField id="clinical-symptoms" label="Symptoms / reason for visit" value={consultation.symptoms} onChange={(event) => onChange({ symptoms: event.target.value })} placeholder="Doctor-entered symptoms" rows={3} /></Card>
    <Card><SectionHeading title="Patient history" subtitle="Only information reviewed and entered by the clinician is stored." /><div className="form-grid"><TextAreaField id="medical-history" label="Medical history" value={consultation.medicalHistory} onChange={(event) => onChange({ medicalHistory: event.target.value })} placeholder="Doctor-entered history" rows={3} /><TextAreaField id="allergies" label="Allergies" value={consultation.allergies} onChange={(event) => onChange({ allergies: event.target.value })} placeholder="Doctor-entered allergies or 'Not reported'" rows={3} /></div></Card>
    {department === 'orthopaedics' && <Card><SectionHeading title="Pain location and side" subtitle="Select a body region and laterality where applicable." /><div className="form-grid"><div className="field"><label htmlFor="pain-location">Pain location / body region</label><select id="pain-location" className="control" value={consultation.painLocation ?? ''} onChange={(event) => onChange({ painLocation: event.target.value })}><option value="">Choose a region</option>{regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}</select></div><div className="field"><label htmlFor="pain-side">Side</label><select id="pain-side" className="control" value={consultation.side ?? 'Not applicable'} onChange={(event) => onChange({ side: event.target.value as Consultation['side'] })}>{['Left', 'Right', 'Bilateral', 'Not applicable'].map((side) => <option key={side}>{side}</option>)}</select></div></div></Card>}
    <Card><SectionHeading title="Assessment and plan" subtitle="Complete only what the clinician has reviewed and approved." /><div className="form-grid"><TextAreaField id="clinical-assessment" label="Assessment" value={consultation.assessment} onChange={(event) => onChange({ assessment: event.target.value })} placeholder="Clinician-entered assessment" rows={3} /><TextAreaField id="clinical-diagnosis" label="Diagnosis" value={consultation.diagnosis} onChange={(event) => onChange({ diagnosis: event.target.value })} placeholder="Doctor-entered diagnosis" rows={3} /><TextAreaField id="treatment-plan" label="Treatment plan / advice" value={consultation.treatmentPlan} onChange={(event) => onChange({ treatmentPlan: event.target.value })} placeholder="Doctor-entered treatment plan" rows={4} className="span-2" /></div></Card>
  </div>;
}
