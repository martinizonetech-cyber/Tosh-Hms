import { useEffect, useMemo, useState } from 'react';
import { Bone, CheckSquare, Pill, Plus, Printer, Save, Square } from 'lucide-react';
import type { BodyRegionTemplateData, Consultation, PrescriptionItem } from '../../../types/domain';
import type { BodyRegionDefinition } from './bodyRegionTemplates';
import { fetchBodyRegionTemplates, readBodyRegionTemplates, saveBodyRegionTemplates } from './bodyRegionTemplates';
import { useToast } from '../../../components/ui/Toast';
import { dateLabel } from '../../../utils/format';
import { Button } from '../../../components/ui/Button';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { Field, TextAreaField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';

const emptyTemplate = (region: string, side: BodyRegionTemplateData['side']): BodyRegionTemplateData => ({
  region,
  side,
  examinationFields: {},
  findings: '',
  treatmentAdvice: '',
  prescription: '',
  followUpInstructions: '',
});

export function BodyRegionTemplatesPanel({
  consultation,
  onChange,
  onPrintPrescription,
  onSelectTab,
}: {
  consultation: Consultation;
  onChange: (patch: Partial<Consultation>) => void;
  onPrintPrescription?: () => void;
  onSelectTab?: (tab: string) => void;
}) {
  const toast = useToast();
  const [templates, setTemplates] = useState<BodyRegionDefinition[]>(() => readBodyRegionTemplates());
  const [preview, setPreview] = useState(false);
  const [addingRegion, setAddingRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');

  // Fetch latest templates from API or local storage
  useEffect(() => {
    let mounted = true;
    fetchBodyRegionTemplates().then((data) => {
      if (mounted && data && data.length > 0) {
        setTemplates(data);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const selectedRegion = consultation.bodyRegionTemplate?.region ?? '';
  const definition = useMemo(() => templates.find((item) => item.region === selectedRegion), [selectedRegion, templates]);
  const current = consultation.bodyRegionTemplate;

  // Selected tablet IDs for the active region
  const [selectedMedIds, setSelectedMedIds] = useState<Set<string>>(new Set());

  // Whenever the active region changes, select all its tablets by default
  useEffect(() => {
    if (definition?.medications) {
      setSelectedMedIds(new Set(definition.medications.map((m) => m.id)));
    } else {
      setSelectedMedIds(new Set());
    }
  }, [definition]);

  const chooseRegion = (region: string) => {
    if (current && Object.values(current.examinationFields).some(Boolean) && !window.confirm('Switch region and start a new template section? Unsaved template field values will be replaced.')) return;
    const side = consultation.side ?? 'Not applicable';
    const chosenDef = templates.find((t) => t.region === region);
    onChange({ painLocation: region, bodyRegionTemplate: emptyTemplate(region, side) });
    if (chosenDef?.medications) {
      setSelectedMedIds(new Set(chosenDef.medications.map((m) => m.id)));
    }
  };

  const handleAddRegion = async () => {
    const trimmed = newRegionName.trim();
    if (!trimmed) {
      toast.push('Please enter a body region name.', 'error');
      return;
    }
    if (templates.some((t) => t.region.toLowerCase() === trimmed.toLowerCase())) {
      toast.push(`Body region "${trimmed}" already exists.`, 'error');
      return;
    }

    const cleanId = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newRegionDef: BodyRegionDefinition = {
      region: trimmed,
      fields: ['Range of motion', 'Stability & alignment', 'Swelling & tenderness', 'Functional movements'],
      medications: [
        { id: `${cleanId}-1`, medicineName: 'Tab. Aceclofenac + Paracetamol', strength: '100mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals' },
        { id: `${cleanId}-2`, medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take in morning before food' },
        { id: `${cleanId}-3`, medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for muscle relaxation' },
        { id: `${cleanId}-4`, medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner' },
        { id: `${cleanId}-5`, medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for swelling' },
        { id: `${cleanId}-6`, medicineName: 'Gel. Diclofenac Diethylamine', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Apply gently over painful area' },
        { id: `${cleanId}-7`, medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take as needed for pain' },
        { id: `${cleanId}-8`, medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '8 Weeks', instructions: 'Take weekly with warm milk' },
        { id: `${cleanId}-9`, medicineName: 'Tab. Methylcobalamin', strength: '1500mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for nerve health' },
        { id: `${cleanId}-10`, medicineName: 'Tab. Tramadol + Paracetamol', strength: '37.5mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '3 Days', instructions: 'Take in case of severe pain only' },
      ],
    };

    const next = [...templates, newRegionDef];
    setTemplates(next);
    setAddingRegion(false);
    setNewRegionName('');
    chooseRegion(trimmed);
    try {
      await saveBodyRegionTemplates(next);
      toast.push(`Body region "${trimmed}" added with 10 standard tablets.`);
    } catch {
      toast.push(`Body region "${trimmed}" added locally.`, 'info');
    }
  };

  const updateTemplate = (patch: Partial<BodyRegionTemplateData>) => {
    if (!current) return;
    onChange({ bodyRegionTemplate: { ...current, ...patch }, ...(patch.side ? { side: patch.side } : {}) });
  };

  const updateField = (field: string, value: string) => {
    if (!current) return;
    updateTemplate({ examinationFields: { ...current.examinationFields, [field]: value } });
  };

  const toggleMed = (medId: string) => {
    setSelectedMedIds((prev) => {
      const next = new Set(prev);
      if (next.has(medId)) {
        next.delete(medId);
      } else {
        next.add(medId);
      }
      return next;
    });
  };

  const toggleSelectAllMeds = () => {
    if (!definition?.medications) return;
    if (selectedMedIds.size === definition.medications.length) {
      // Deselect all
      setSelectedMedIds(new Set());
    } else {
      // Select all
      setSelectedMedIds(new Set(definition.medications.map((m) => m.id)));
    }
  };

  const addSelectedMedsToPrescription = () => {
    if (!definition?.medications || selectedMedIds.size === 0) {
      toast.push('Please select at least one tablet to add to prescription.', 'info');
      return;
    }

    const selectedList = definition.medications.filter((m) => selectedMedIds.has(m.id));
    const newItems: PrescriptionItem[] = selectedList.map((m) => ({
      id: `RX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      medicineName: m.medicineName,
      strength: m.strength,
      dosage: m.dosage,
      route: m.route,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    }));

    onChange({ prescription: [...consultation.prescription, ...newItems] });
    toast.push(`Added ${newItems.length} tablet${newItems.length > 1 ? 's' : ''} to prescription for ${current?.region}.`);
    if (onSelectTab) {
      onSelectTab('Prescription');
    }
  };

  const print = () => {
    if (!current) {
      toast.push('Choose a body region before previewing instructions.', 'error');
      return;
    }
    setPreview(true);
  };

  const allMedsSelected = definition?.medications && definition.medications.length > 0 && selectedMedIds.size === definition.medications.length;

  return (
    <>
      <Card>
        <SectionHeading
          title="Body-region template"
          subtitle="Select a region to load examination prompts and standard 10 tablets."
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setAddingRegion(true)}
                icon={<Plus size={14} />}
              >
                Add Region
              </Button>
              <span className="template-draft-status" title="Changes are included in the consultation draft">
                <Bone size={17} color="#177E89" />
                <Save size={13} color="#64748B" />
              </span>
            </div>
          }
        />

        <div className="body-region-grid">
          {templates.map((item) => (
            <button
              type="button"
              key={item.region}
              className={`template-tile${selectedRegion === item.region ? ' selected' : ''}`}
              onClick={() => chooseRegion(item.region)}
            >
              <strong>{item.region}</strong>
              <span>
                {item.medications?.length ?? 0} tablets · {item.fields.length} fields
              </span>
            </button>
          ))}
          <button
            type="button"
            className="template-tile add-tile"
            style={{
              border: '1.5px dashed #177E89',
              background: '#F0F8F9',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              color: '#177E89',
              minHeight: 64,
            }}
            onClick={() => setAddingRegion(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Plus size={15} />
              <span>Add Region</span>
            </div>
            <span style={{ fontSize: 10, color: '#64748B' }}>New body region template</span>
          </button>
        </div>

        {current && (
          <div className="body-region-form">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="template-side">Side</label>
                <select
                  id="template-side"
                  className="control"
                  value={current.side}
                  onChange={(event) => updateTemplate({ side: event.target.value as BodyRegionTemplateData['side'] })}
                >
                  {['Left', 'Right', 'Bilateral', 'Not applicable'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Selected region</label>
                <div className="field-static">{current.region}</div>
              </div>
            </div>

            {/* Standard Tablets for this Region */}
            {definition?.medications && definition.medications.length > 0 && (
              <div
                style={{
                  border: '1px solid #B6D8DC',
                  borderRadius: 10,
                  padding: 11,
                  background: '#F0F8F9',
                  display: 'grid',
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Pill size={16} color="#177E89" />
                    <strong style={{ fontSize: 13, color: 'var(--navy)' }}>
                      {current.region} Standard Tablets ({definition.medications.length})
                    </strong>
                  </div>

                  <div className="button-row">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={toggleSelectAllMeds}
                      icon={allMedsSelected ? <CheckSquare size={14} color="#177E89" /> : <Square size={14} />}
                    >
                      {allMedsSelected ? 'Deselect All' : 'Select All (10)'}
                    </Button>
                    <Button
                      size="small"
                      disabled={selectedMedIds.size === 0}
                      onClick={addSelectedMedsToPrescription}
                      icon={<Pill size={14} />}
                    >
                      Add Selected ({selectedMedIds.size}) to Prescription
                    </Button>
                    {onPrintPrescription && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={consultation.prescription.length === 0}
                        onClick={onPrintPrescription}
                        icon={<Printer size={14} />}
                      >
                        Print Rx
                      </Button>
                    )}
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>
                  Use the checkboxes below to keep or remove specific tablets before adding to prescription:
                </p>

                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                    maxHeight: 280,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {definition.medications.map((med, idx) => {
                    const isChecked = selectedMedIds.has(med.id);
                    return (
                      <label
                        key={med.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 9,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: isChecked ? '#ffffff' : '#F6F9FA',
                          border: isChecked ? '1px solid #177E89' : '1px solid #E2E8F0',
                          cursor: 'pointer',
                          transition: 'background 0.15s, border-color 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMed(med.id)}
                          style={{ marginTop: 3, cursor: 'pointer', accentColor: '#177E89' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>#{idx + 1}</span>
                            <strong style={{ fontSize: 12.5, color: isChecked ? 'var(--navy)' : '#64748B' }}>
                              {med.medicineName}
                            </strong>
                            {med.strength && (
                              <span style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>
                                {med.strength}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                            {med.dosage} · {med.frequency} · {med.duration} · {med.route}
                            {med.instructions ? ` · (${med.instructions})` : ''}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="body-region-fields">
              {(definition?.fields ?? []).map((field, index) => (
                <Field
                  key={`${current.region}-${field}-${index}`}
                  id={`region-${current.region}-${index}`}
                  label={field}
                  value={current.examinationFields[field] ?? ''}
                  onChange={(event) => updateField(field, event.target.value)}
                  placeholder="Doctor-entered examination"
                />
              ))}
            </div>

            <TextAreaField
              id="region-findings"
              label="Doctor findings"
              value={current.findings}
              onChange={(event) => updateTemplate({ findings: event.target.value })}
              placeholder="Findings entered by clinician"
              rows={3}
            />
            <TextAreaField
              id="region-advice"
              label="Treatment / advice"
              value={current.treatmentAdvice}
              onChange={(event) => updateTemplate({ treatmentAdvice: event.target.value })}
              placeholder="Clinician-entered treatment and advice"
              rows={3}
            />
            <TextAreaField
              id="region-prescription"
              label="Prescription notes & clinical instructions"
              value={current.prescription}
              onChange={(event) => updateTemplate({ prescription: event.target.value })}
              placeholder="Doctor-entered clinical notes and special precautions"
              rows={3}
            />
            <TextAreaField
              id="region-followup"
              label="Follow-up instructions"
              value={current.followUpInstructions}
              onChange={(event) => updateTemplate({ followUpInstructions: event.target.value })}
              placeholder="Clinician-entered review instructions"
              rows={3}
            />

            <div className="button-row">
              <Button variant="secondary" onClick={print} icon={<Printer size={14} />}>
                Preview printable instructions
              </Button>
              {onPrintPrescription && (
                <Button
                  onClick={onPrintPrescription}
                  disabled={consultation.prescription.length === 0}
                  icon={<Printer size={14} />}
                >
                  Print prescription
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={preview}
        title={`${current?.region ?? 'Body region'} instructions`}
        subtitle="Review the clinician-entered body-region details before printing."
        onClose={() => setPreview(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                document.body.classList.add('print-body-template');
                window.setTimeout(() => {
                  window.print();
                  document.body.classList.remove('print-body-template');
                }, 60);
              }}
              icon={<Printer size={14} />}
            >
              Print
            </Button>
          </>
        }
      >
        {current && (
          <article className="body-template-print">
            <div className="print-brand">
              <strong>TOSH Foundation</strong>
              <span>Orthopaedics · Pune</span>
            </div>
            <h2>
              {current.region} · {current.side}
            </h2>
            <p>
              Patient consultation · {dateLabel(consultation.visitedAt)}
            </p>
            {Object.entries(current.examinationFields).map(([label, value]) => (
              <div className="print-block" key={label}>
                <h3>{label}</h3>
                <p>{value || '—'}</p>
              </div>
            ))}
            <div className="print-block">
              <h3>Doctor findings</h3>
              <p>{current.findings || '—'}</p>
            </div>
            <div className="print-block">
              <h3>Treatment / advice</h3>
              <p>{current.treatmentAdvice || '—'}</p>
            </div>
            <div className="print-block">
              <h3>Prescription details</h3>
              <p>{current.prescription || '—'}</p>
            </div>
            <div className="print-block">
              <h3>Follow-up instructions</h3>
              <p>{current.followUpInstructions || '—'}</p>
            </div>
            <div className="print-signature">
              Clinician entered · demo only
              <span>No medication or quantity is automatically selected.</span>
            </div>
          </article>
        )}
      </Modal>

      {/* Add New Region Modal */}
      <Modal
        open={addingRegion}
        title="Add New Body Region"
        subtitle="Create a new orthopaedic region template with customizable fields and 10 default tablets."
        onClose={() => setAddingRegion(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddingRegion(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRegion} icon={<Plus size={14} />}>
              Create Region
            </Button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="consultation-new-region-name">Body Region Name *</label>
          <input
            id="consultation-new-region-name"
            className="control"
            placeholder="e.g. Cervical Spine, Lumbar Spine, Sacroiliac Joint, Clavicle..."
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddRegion();
            }}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
