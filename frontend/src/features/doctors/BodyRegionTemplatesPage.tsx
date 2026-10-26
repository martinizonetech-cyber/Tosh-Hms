import { useEffect, useState } from 'react';
import { Bone, Edit2, Pill, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { BodyRegionDefinition, BodyRegionMedication } from './clinical/bodyRegionTemplates';
import {
  DEFAULT_BODY_REGION_TEMPLATES,
  fetchBodyRegionTemplates,
  readBodyRegionTemplates,
  saveBodyRegionTemplates,
  TEMPLATES_UPDATED_EVENT,
} from './clinical/bodyRegionTemplates';
import { useToast } from '../../components/ui/Toast';
import { PageHeading } from '../../components/shared/Primitives';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';


export function BodyRegionTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<BodyRegionDefinition[]>(() =>
    readBodyRegionTemplates().map((item) => ({
      ...item,
      fields: [...item.fields],
      medications: item.medications.map((m) => ({ ...m })),
    }))
  );
  const [selected, setSelected] = useState(templates[0]?.region ?? 'Knee');
  const [activeTab, setActiveTab] = useState<'fields' | 'meds'>('meds');
  const [saving, setSaving] = useState(false);

  // Sync templates from API on load
  useEffect(() => {
    let mounted = true;
    fetchBodyRegionTemplates().then((remoteTemplates) => {
      if (mounted && Array.isArray(remoteTemplates)) {
        setTemplates(remoteTemplates);
        if (remoteTemplates.length > 0) {
          setSelected((prev) => (remoteTemplates.some((t) => t.region === prev) ? prev : remoteTemplates[0].region));
        } else {
          setSelected('');
        }
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Listen for template update events across tabs
  useEffect(() => {
    const handler = (e: any) => {
      if (Array.isArray(e.detail)) {
        setTemplates(e.detail);
        if (e.detail.length > 0) {
          setSelected((prev) => (e.detail.some((t: any) => t.region === prev) ? prev : e.detail[0].region));
        } else {
          setSelected('');
        }
      }
    };
    window.addEventListener(TEMPLATES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(TEMPLATES_UPDATED_EVENT, handler);
  }, []);

  // Add new body region modal state
  const [addingRegion, setAddingRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionFields, setNewRegionFields] = useState<string[]>([]);

  // Add / Edit medication modal state
  const [editingMed, setEditingMed] = useState<{ isNew: boolean; data: BodyRegionMedication } | null>(null);

  const active = templates.find((item) => item.region === selected);

  // Field handlers
  const updateField = (index: number, value: string) => {
    setTemplates((items) =>
      items.map((item) =>
        item.region === selected
          ? {
              ...item,
              fields: item.fields.map((field, fieldIndex) => (fieldIndex === index ? value : field)),
            }
          : item
      )
    );
  };

  const addField = async () => {
    const next = templates.map((item) =>
      item.region === selected
        ? { ...item, fields: [...item.fields, 'New examination field'] }
        : item
    );
    setTemplates(next);
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
    } catch {
      // Saved locally
    } finally {
      setSaving(false);
    }
  };

  const removeField = async (index: number) => {
    const next = templates.map((item) =>
      item.region === selected
        ? { ...item, fields: item.fields.filter((_, fieldIndex) => fieldIndex !== index) }
        : item
    );
    setTemplates(next);
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
      toast.push('Field removed.');
    } catch {
      // Saved locally
    } finally {
      setSaving(false);
    }
  };

  // Region handlers
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

    const cleanFields = newRegionFields.map((f) => f.trim()).filter(Boolean);
    const newRegion: BodyRegionDefinition = {
      region: trimmed,
      fields: cleanFields,
      medications: [],
    };

    const next = [...templates, newRegion];
    setTemplates(next);
    setSelected(trimmed);
    setAddingRegion(false);
    setNewRegionName('');
    setNewRegionFields([]);
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
      toast.push(`Body region "${trimmed}" created successfully.`);
    } catch (err) {
      toast.push(`Body region "${trimmed}" added locally.`, 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRegion = async (regionName: string) => {
    if (templates.length <= 1) {
      toast.push('At least one body region must remain.', 'error');
      return;
    }
    if (!window.confirm(`Delete body region "${regionName}" and its templates?`)) return;
    const next = templates.filter((t) => t.region !== regionName);
    setTemplates(next);
    if (selected === regionName) {
      setSelected(next[0]?.region ?? '');
    }
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
      toast.push(`Body region "${regionName}" deleted.`);
    } catch {
      toast.push(`Body region "${regionName}" deleted locally.`, 'info');
    } finally {
      setSaving(false);
    }
  };

  // Medication handlers
  const openNewMed = () => {
    setEditingMed({
      isNew: true,
      data: {
        id: `med-${Date.now()}`,
        medicineName: '',
        strength: '',
        dosage: '1 Tab',
        route: 'Oral',
        frequency: 'Twice daily (BD)',
        duration: '5 Days',
        instructions: 'Take after meals',
      },
    });
  };

  const openEditMed = (med: BodyRegionMedication) => {
    setEditingMed({
      isNew: false,
      data: { ...med },
    });
  };

  const saveMed = async () => {
    if (!editingMed || !active) return;
    const { isNew, data } = editingMed;
    if (!data.medicineName.trim()) {
      toast.push('Please enter a medicine / tablet name.', 'error');
      return;
    }

    const next = templates.map((item) => {
      if (item.region !== selected) return item;
      const meds = isNew
        ? [...item.medications, data]
        : item.medications.map((m) => (m.id === data.id ? data : m));
      return { ...item, medications: meds };
    });

    setTemplates(next);
    setEditingMed(null);
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
      toast.push(isNew ? `Tablet "${data.medicineName}" added and saved.` : `Tablet "${data.medicineName}" saved.`);
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Tablet updated locally, but server sync failed.',
        'info'
      );
    } finally {
      setSaving(false);
    }
  };

  const removeMed = async (medId: string) => {
    if (!active) return;
    const target = active.medications.find((m) => m.id === medId);
    const medName = target?.medicineName || 'Tablet';

    const next = templates.map((item) =>
      item.region === selected
        ? { ...item, medications: item.medications.filter((m) => m.id !== medId) }
        : item
    );

    setTemplates(next);
    setSaving(true);
    try {
      await saveBodyRegionTemplates(next);
      toast.push(`Removed "${medName}".`);
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Tablet removed locally, but server sync failed.',
        'info'
      );
    } finally {
      setSaving(false);
    }
  };

  // Storage handlers
  const save = async () => {
    setSaving(true);
    try {
      await saveBodyRegionTemplates(templates);
      toast.push('Body-region templates & tablets saved successfully.');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save template settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Restore default body regions and their 10 standard tablets?')) return;
    const defaults = DEFAULT_BODY_REGION_TEMPLATES.map((item) => ({
      ...item,
      fields: [...item.fields],
      medications: item.medications.map((m) => ({ ...m })),
    }));
    setTemplates(defaults);
    setSelected('Knee');
    setSaving(true);
    try {
      await saveBodyRegionTemplates(defaults);
      toast.push('Built-in body regions & 10 tablets restored.');
    } catch {
      toast.push('Templates restored for this session.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Orthopaedics · Configuration"
        title="Body Region Templates"
        description="Manage body regions, examination fields, and standard 10 tablets for each condition. Clicking Knee or any region in Consultation automatically loads these tablets with one-click Select All selection."
        actions={
          <div className="button-row">
            <Button variant="secondary" onClick={() => setAddingRegion(true)} icon={<Plus size={15} />}>
              Add Body Region
            </Button>
            <Button onClick={save} disabled={saving} icon={<Save size={15} />}>
              {saving ? 'Saving...' : 'Save Templates'}
            </Button>
          </div>
        }
      />

      <div className="body-template-editor">
        {/* Regions List */}
        <Card>
          <SectionHeading
            title="Body Regions"
            subtitle="Choose a region to customize its examination prompts and default 10 tablets."
            action={
              <Button size="small" variant="secondary" onClick={() => setAddingRegion(true)} icon={<Plus size={14} />}>
                Add Region
              </Button>
            }
          />
          <div className="template-grid">
            {templates.map((item) => (
              <div
                key={item.region}
                className={`template-tile${selected === item.region ? ' selected' : ''}`}
                style={{ position: 'relative', cursor: 'pointer', padding: '14px 16px', minHeight: 76, borderRadius: 12 }}
                onClick={() => setSelected(item.region)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{item.region}</strong>
                  {templates.length > 1 && (
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'inline-flex',
                        borderRadius: 6,
                      }}
                      title={`Delete ${item.region}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRegion(item.region);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <span style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 13, color: '#64748B' }}>
                  <span style={{ color: '#177E89', fontWeight: 600 }}>{item.medications?.length ?? 0} tablets</span>
                  <span>·</span>
                  <span>{item.fields.length} fields</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Selected Region Editor */}
        <Card>
          <SectionHeading
            title={`${active?.region ?? 'Template'} Details`}
            subtitle="Configure examination field labels and the 10 standard tablets for this region."
          />

          {active && (
            <div className="template-tab-bar" style={{ display: 'flex', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
              <Button
                variant={activeTab === 'meds' ? 'primary' : 'secondary'}
                onClick={() => setActiveTab('meds')}
                icon={<Pill size={16} />}
                style={{ fontWeight: 600, fontSize: 13.5, padding: '8px 18px' }}
              >
                Tablets ({active.medications.length ?? 0})
              </Button>
              <Button
                variant={activeTab === 'fields' ? 'primary' : 'secondary'}
                onClick={() => setActiveTab('fields')}
                icon={<Bone size={16} />}
                style={{ fontWeight: 600, fontSize: 13.5, padding: '8px 18px' }}
              >
                Fields ({active.fields.length ?? 0})
              </Button>
            </div>
          )}

          {active ? (
            <div>
              {/* TAB 1: MEDICATIONS / TABLETS */}
              {activeTab === 'meds' && (
                <div className="stack" style={{ gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong style={{ fontSize: 16, color: 'var(--navy)' }}>
                        {active.region} Standard Tablets ({active.medications.length})
                      </strong>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                        In Consultation, selecting "{active.region}" auto-loads these tablets with a Select All checkbox.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={openNewMed} icon={<Plus size={15} />}>
                      Add Tablet
                    </Button>
                  </div>

                  {active.medications.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', border: '1px dashed #CBD5E1', borderRadius: 10, background: '#F8FAFC', marginBottom: 12 }}>
                      <Pill size={28} color="#94A3B8" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <strong style={{ fontSize: 14, color: 'var(--navy)' }}>No tablets configured for {active.region}</strong>
                      <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 12px' }}>
                        Tablets for this region are created manually. Click &ldquo;Add Tablet&rdquo; below to create your first tablet.
                      </p>
                      <Button variant="secondary" size="small" onClick={openNewMed} icon={<Plus size={14} />}>
                        Add Tablet
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 9 }}>
                      {active.medications.map((med, index) => (
                        <div
                          key={med.id}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            background: '#FAFCFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 14,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: '#E2F1F0',
                                color: '#177E89',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 700,
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            >
                              {index + 1}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: 15.5, color: 'var(--navy)' }}>{med.medicineName}</strong>
                                {med.strength && (
                                  <span
                                    style={{
                                      fontSize: 12.5,
                                      padding: '3px 9px',
                                      borderRadius: 6,
                                      background: '#EEF2F6',
                                      color: '#334155',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {med.strength}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 13.5, color: '#475569', flexWrap: 'wrap' }}>
                                <span><strong>Dosage:</strong> {med.dosage}</span>
                                <span>·</span>
                                <span><strong>Frequency:</strong> {med.frequency}</span>
                                <span>·</span>
                                <span><strong>Duration:</strong> {med.duration}</span>
                                <span>·</span>
                                <span><strong>Route:</strong> {med.route}</span>
                              </div>
                              {med.instructions && (
                                <div style={{ marginTop: 5, fontSize: 13, color: '#0F766E', fontStyle: 'italic', background: '#F0FDFA', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                                  Instructions: {med.instructions}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="button-row" style={{ flexShrink: 0 }}>
                            <Button size="small" variant="secondary" onClick={() => openEditMed(med)} icon={<Edit2 size={14} />}>
                              Edit
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() => removeMed(med.id)}
                              icon={<Trash2 size={14} color="#DC2626" />}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: 8 }}>
                    <Button variant="secondary" onClick={openNewMed} icon={<Plus size={14} />}>
                      Add Tablet
                    </Button>
                    <Button onClick={save} disabled={saving} icon={<Save size={14} />}>
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <Button variant="ghost" onClick={reset} disabled={saving} icon={<RotateCcw size={14} />}>
                      Restore Built-ins
                    </Button>
                  </div>
                </div>
              )}

              {/* TAB 2: EXAMINATION FIELDS */}
              {activeTab === 'fields' && (
                <div className="template-field-editor">
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: 14, color: 'var(--navy)' }}>
                      {active.region} Examination Prompts ({active.fields.length})
                    </strong>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      Add or edit labels for physical and clinical findings for {active.region}.
                    </p>
                  </div>

                  {active.fields.map((field, index) => (
                    <div className="template-field-row" key={`${active.region}-${index}`}>
                      <Field
                        id={`template-field-${index}`}
                        label={`Field ${index + 1}`}
                        value={field}
                        onChange={(event) => updateField(index, event.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="small"
                        aria-label={`Remove field ${field}`}
                        onClick={() => removeField(index)}
                        icon={<Trash2 size={14} />}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}

                  <div className="button-row">
                    <Button variant="secondary" onClick={addField} icon={<Plus size={14} />}>
                      Add Field
                    </Button>
                    <Button onClick={save} disabled={saving} icon={<Save size={14} />}>
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <Button variant="ghost" onClick={reset} disabled={saving} icon={<RotateCcw size={14} />}>
                      Restore Built-ins
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="No region selected" message="Select a region to edit its examination fields and tablets." />
          )}
        </Card>
      </div>

      {/* Add New Region Modal */}
      <Modal
        open={addingRegion}
        title="Add New Body Region"
        subtitle="Create a new orthopaedic region template with customizable examination fields and manually added tablets."
        onClose={() => {
          setAddingRegion(false);
          setNewRegionName('');
          setNewRegionFields([]);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddingRegion(false);
                setNewRegionName('');
                setNewRegionFields([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddRegion} icon={<Plus size={14} />}>
              Create Region
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="new-region-name">Body Region Name *</label>
            <input
              id="new-region-name"
              className="control"
              placeholder="e.g. Cervical Spine, Lumbar Spine, Sacroiliac Joint, Clavicle..."
              value={newRegionName}
              onChange={(e) => setNewRegionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRegion();
              }}
            />
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#FAFCFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: 'var(--navy)' }}>Customizable Examination Prompts</strong>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                  Add examination fields for this new region (optional).
                </p>
              </div>
              <Button
                size="small"
                variant="secondary"
                type="button"
                onClick={() => setNewRegionFields((prev) => [...prev, ''])}
                icon={<Plus size={13} />}
              >
                Add Field
              </Button>
            </div>
            {newRegionFields.length === 0 ? (
              <p style={{ fontSize: 11.5, color: '#64748B', margin: '6px 0 2px', fontStyle: 'italic' }}>
                No examination fields added yet. Click &ldquo;+ Add Field&rdquo; to add custom examination prompts.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
                {newRegionFields.map((field, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="control"
                      style={{ flex: 1, height: 32, fontSize: 12 }}
                      value={field}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewRegionFields((prev) => prev.map((f, i) => (i === idx ? val : f)));
                      }}
                      placeholder={`Examination field #${idx + 1} (e.g. Tenderness, Range of motion...)`}
                    />
                    <Button
                      size="small"
                      variant="ghost"
                      type="button"
                      onClick={() => setNewRegionFields((prev) => prev.filter((_, i) => i !== idx))}
                      icon={<Trash2 size={13} color="#DC2626" />}
                      aria-label="Remove field"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, background: '#F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Pill size={15} color="#64748B" />
              <strong style={{ fontSize: 13, color: 'var(--navy)' }}>Tablets (Created Manually)</strong>
            </div>
            <p style={{ fontSize: 11.5, color: '#64748B', margin: 0 }}>
              Tablets are not pre-configured. After creating this region, use the &ldquo;Add Tablet&rdquo; button in the Tablets tab to manually add tablets, dosages, and instructions.
            </p>
          </div>
        </div>
      </Modal>

      {/* Add / Edit Tablet Modal */}
      {editingMed && (
        <Modal
          open={Boolean(editingMed)}
          title={editingMed.isNew ? `Add Tablet for ${active?.region}` : `Edit Tablet - ${editingMed.data.medicineName}`}
          subtitle="Configure medicine name, dosage, frequency, route, and clinical instructions."
          onClose={() => setEditingMed(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingMed(null)}>
                Cancel
              </Button>
              <Button onClick={saveMed} icon={<Save size={14} />}>
                {editingMed.isNew ? 'Add Tablet' : 'Save Tablet'}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="med-name">Medicine / Tablet Name *</label>
              <input
                id="med-name"
                className="control"
                placeholder="e.g. Tab. Aceclofenac + Paracetamol, Tab. Pantoprazole..."
                value={editingMed.data.medicineName}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, medicineName: e.target.value },
                  })
                }
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="med-strength">Strength</label>
              <input
                id="med-strength"
                className="control"
                placeholder="e.g. 100mg / 325mg, 40mg..."
                value={editingMed.data.strength}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, strength: e.target.value },
                  })
                }
              />
            </div>

            <div className="field">
              <label htmlFor="med-dosage">Dosage</label>
              <input
                id="med-dosage"
                className="control"
                placeholder="e.g. 1 Tab, 1 Cap, 1 Sachet..."
                value={editingMed.data.dosage}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, dosage: e.target.value },
                  })
                }
              />
            </div>

            <div className="field">
              <label htmlFor="med-freq">Frequency</label>
              <select
                id="med-freq"
                className="control"
                value={editingMed.data.frequency}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, frequency: e.target.value },
                  })
                }
              >
                <option>Once daily (OD)</option>
                <option>Once daily in morning (OD - AM)</option>
                <option>Once daily at night (HS)</option>
                <option>Twice daily (BD)</option>
                <option>3 times daily (TDS)</option>
                <option>4 times daily (QDS)</option>
                <option>SOS (As needed)</option>
                <option>Once weekly</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="med-duration">Duration</label>
              <input
                id="med-duration"
                className="control"
                placeholder="e.g. 5 Days, 10 Days, 30 Days..."
                value={editingMed.data.duration}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, duration: e.target.value },
                  })
                }
              />
            </div>

            <div className="field">
              <label htmlFor="med-route">Route</label>
              <select
                id="med-route"
                className="control"
                value={editingMed.data.route}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, route: e.target.value },
                  })
                }
              >
                <option>Oral</option>
                <option>Topical</option>
                <option>Physical</option>
                <option>Sublingual</option>
                <option>Intramuscular (IM)</option>
                <option>Intra-articular</option>
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="med-instructions">Doctor Instructions / Precautions</label>
              <input
                id="med-instructions"
                className="control"
                placeholder="e.g. Take after food, Take on empty stomach, Apply without hard rubbing..."
                value={editingMed.data.instructions}
                onChange={(e) =>
                  setEditingMed({
                    ...editingMed,
                    data: { ...editingMed.data, instructions: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </Modal>
      )}

      <div className="hint-banner" style={{ marginTop: 14 }}>
        <Bone size={15} />
        <span>
          Template settings are stored locally in your browser. In Consultation, whenever you click a body region (like Knee), all 10 tablets appear ready for one-click selection and can be added directly to the prescription.
        </span>
      </div>
    </>
  );
}
