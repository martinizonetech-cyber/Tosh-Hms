import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Pill,
  Plus,
  Stethoscope,
  Activity,
  X,
} from 'lucide-react';
import type { Consultation, Department, PrescriptionItem } from '../../../types/domain';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { dateLabel, departmentLabel, downloadFile, resolveDocumentUrl, resolveInlineDocumentUrl } from '../../../utils/format';
import { readBodyRegionTemplates } from './bodyRegionTemplates';

/** Parse the stored diagnosis string (newline-separated) into an array of tags */
function parseDiagnosisTags(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serialize tags back to newline-separated string */
function serializeDiagnosisTags(tags: string[]): string {
  return tags.join('\n');
}

interface ClinicalNotesPanelProps {
  department: Department;
  consultation: Consultation;
  onChange: (patch: Partial<Consultation>) => void;
  previousVisits?: Consultation[];
  onCopyPrescription?: (items: PrescriptionItem[]) => void;
}

export function ClinicalNotesPanel({
  department,
  consultation,
  onChange,
  previousVisits = [],
  onCopyPrescription,
}: ClinicalNotesPanelProps) {
  const [expandedVisits, setExpandedVisits] = useState<Record<string, boolean>>(() => {
    if (previousVisits.length > 0) {
      return { [previousVisits[0].id]: true };
    }
    return {};
  });

  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [copiedItemIds, setCopiedItemIds] = useState<Record<string, boolean>>({});

  // Diagnosis tag input state
  const [diagInput, setDiagInput] = useState('');
  const diagInputRef = useRef<HTMLInputElement>(null);
  const diagTags = parseDiagnosisTags(consultation.diagnosis ?? '');

  const regionOptions = useMemo(() => {
    const configured = readBodyRegionTemplates().map((t) => t.region);
    const defaults = ['Knee', 'Shoulder', 'Hip', 'Spine', 'Elbow', 'Wrist', 'Ankle', 'Foot', 'Other'];
    return Array.from(new Set([...configured, ...defaults]));
  }, []);

  const toggleVisit = (id: string) => {
    setExpandedVisits((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopySingleItem = (item: PrescriptionItem) => {
    if (!onCopyPrescription) return;
    onCopyPrescription([item]);
    setCopiedItemIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setCopiedItemIds((prev) => ({ ...prev, [item.id]: false }));
    }, 2000);
  };

  const handleCopyAllItems = (items: PrescriptionItem[]) => {
    if (!onCopyPrescription || !items.length) return;
    onCopyPrescription(items);
  };

  // Diagnosis tag handlers
  const addDiagTag = () => {
    const val = diagInput.trim();
    if (!val) return;
    if (diagTags.includes(val)) {
      setDiagInput('');
      return;
    }
    const updated = [...diagTags, val];
    onChange({ diagnosis: serializeDiagnosisTags(updated) });
    setDiagInput('');
    diagInputRef.current?.focus();
  };

  const removeDiagTag = (tag: string) => {
    const updated = diagTags.filter((t) => t !== tag);
    onChange({ diagnosis: serializeDiagnosisTags(updated) });
  };

  const handleDiagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDiagTag();
    } else if (e.key === 'Backspace' && diagInput === '' && diagTags.length > 0) {
      removeDiagTag(diagTags[diagTags.length - 1]);
    }
  };

  const isLocked = consultation.status === 'Finalized';

  return (
    <div className="stack" style={{ gap: '18px' }}>

      {/* ── 1. Chief Complaints / Reason for visit ── */}
      <Card>
        <SectionHeading
          title="Chief Complaints / Reason for visit"
          subtitle="Document the patient's presenting complaints and chief problem for this visit."
        />
        <div style={{ marginTop: '12px' }}>
          <textarea
            id="clinical-chief-complaints"
            className="control textarea"
            value={consultation.symptoms}
            onChange={(event) => onChange({ symptoms: event.target.value })}
            placeholder="Enter the patient's chief complaints, duration, and presenting problems..."
            rows={4}
            style={{ width: '100%', minHeight: 96 }}
          />
        </div>

        {department === 'orthopaedics' && (
          <div className="form-grid two" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed var(--line)' }}>
            <div className="field">
              <label htmlFor="pain-location">Pain location / body region</label>
              <select
                id="pain-location"
                className="control"
                value={consultation.painLocation ?? ''}
                onChange={(event) => onChange({ painLocation: event.target.value })}
              >
                <option value="">Choose a region</option>
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pain-side">Side</label>
              <select
                id="pain-side"
                className="control"
                value={consultation.side ?? 'Not applicable'}
                onChange={(event) => onChange({ side: event.target.value as Consultation['side'] })}
              >
                {['Left', 'Right', 'Bilateral', 'Not applicable'].map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* ── 2. Patient Clinical History & Previous Visits ── */}
      <Card>
        <SectionHeading
          title="Patient Clinical History & Previous Visits"
          subtitle="Review previous consultation history, assigned prescriptions, uploaded documents, and visit details."
          action={
            previousVisits.length > 0 ? (
              <Badge tone="neutral">
                {previousVisits.length} Previous Visit{previousVisits.length === 1 ? '' : 's'}
              </Badge>
            ) : null
          }
        />

        {previousVisits.length === 0 ? (
          <div style={{ padding: '16px 0' }}>
            <EmptyState
              title="First Visit · No Prior Consultation History"
              message="This patient has no previous consultations recorded in the clinic system. The symptoms and prescription documented today will begin their clinical history."
              icon={<Stethoscope size={20} />}
            />
          </div>
        ) : (
          <div className="stack" style={{ gap: '14px', marginTop: '12px' }}>
            {previousVisits.map((visit, index) => {
              const isExpanded = !!expandedVisits[visit.id];
              const isLatest = index === 0;
              const rxCount = visit.prescription?.length || 0;
              const imgCount = visit.prescriptionImages?.length || 0;
              const hasVitals = visit.vitals && Object.values(visit.vitals).some(Boolean);

              return (
                <div
                  key={visit.id}
                  className="past-visit-card"
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#FFFFFF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Collapsible Card Header */}
                  <div
                    onClick={() => toggleVisit(visit.id)}
                    style={{
                      padding: '12px 16px',
                      background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                      borderBottom: isExpanded ? '1px solid var(--line)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--navy)', fontSize: '13px' }}>
                        <Calendar size={14} color="var(--teal)" />
                        {dateLabel(visit.visitedAt, 'd MMM yyyy')}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {dateLabel(visit.visitedAt, 'h:mm a')}
                      </span>
                      <Badge tone={visit.department === 'skin' ? 'info' : 'neutral'}>
                        {departmentLabel(visit.department)}
                      </Badge>
                      <span style={{ fontSize: '11px', color: 'var(--ink)', fontWeight: 500 }}>
                        {visit.id}
                      </span>
                      {isLatest && (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#FEF3C7', color: '#92400E' }}>
                          Most Recent Visit
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {rxCount} meds · {imgCount} rx image{imgCount === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        style={{ width: 28, height: 28 }}
                        aria-label={isExpanded ? 'Collapse visit details' : 'Expand visit details'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Card Body */}
                  {isExpanded && (
                    <div style={{ padding: '16px', display: 'grid', gap: '16px' }}>
                      {/* Vitals Summary Strip if recorded */}
                      {hasVitals && (
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <Activity size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                            Vitals at this visit
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                            {visit.vitals.bloodPressure && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>BP: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.bloodPressure}</strong>
                              </div>
                            )}
                            {visit.vitals.pulse && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>Pulse: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.pulse}</strong>
                              </div>
                            )}
                            {visit.vitals.temperature && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>Temp: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.temperature}</strong>
                              </div>
                            )}
                            {visit.vitals.oxygenSaturation && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>SpO₂: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.oxygenSaturation}</strong>
                              </div>
                            )}
                            {visit.vitals.weight && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>Weight: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.weight}</strong>
                              </div>
                            )}
                            {visit.vitals.height && (
                              <div style={{ fontSize: '12px' }}>
                                <span style={{ color: 'var(--muted)' }}>Height: </span>
                                <strong style={{ color: 'var(--navy)' }}>{visit.vitals.height}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Symptoms & Diagnosis */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#92400E', marginBottom: '6px' }}>
                            <AlertCircle size={14} />
                            <span>Previous Chief Complaints</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '13px', color: '#78350F', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {visit.symptoms || 'No specific complaints logged.'}
                          </p>
                          {visit.department === 'orthopaedics' && (visit.painLocation || visit.side) && (
                            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#92400E' }}>
                              <strong>Location:</strong> {visit.painLocation || 'General'} · <strong>Side:</strong> {visit.side || 'N/A'}
                            </p>
                          )}
                        </div>

                        {visit.diagnosis && (
                          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                              <CheckCircle2 size={14} />
                              <span>Previous Diagnosis</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {parseDiagnosisTags(visit.diagnosis).map((tag, i) => (
                                <span
                                  key={i}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    background: '#DCFCE7',
                                    color: '#14532D',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            {visit.treatmentPlan && (
                              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#166534' }}>
                                <strong>Advice:</strong> {visit.treatmentPlan}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Assigned Prescriptions */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Pill size={15} color="var(--teal)" />
                            Assigned Prescriptions ({rxCount} medication{rxCount === 1 ? '' : 's'})
                          </span>
                          {rxCount > 0 && onCopyPrescription && (
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => handleCopyAllItems(visit.prescription)}
                              icon={<Copy size={13} />}
                            >
                              Copy all to today's prescription
                            </Button>
                          )}
                        </div>

                        {rxCount > 0 ? (
                          <div className="table-wrap" style={{ margin: 0 }}>
                            <table className="data-table" style={{ fontSize: '12px' }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                  <th>Medicine Name &amp; Strength</th>
                                  <th>Dosage &amp; Route</th>
                                  <th>Frequency &amp; Duration</th>
                                  <th>Instructions</th>
                                  {onCopyPrescription && <th style={{ textAlign: 'center', width: '90px' }}>Action</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {visit.prescription.map((rx, rxIdx) => {
                                  const isCopied = copiedItemIds[rx.id];
                                  return (
                                    <tr key={rx.id || rxIdx}>
                                      <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{rxIdx + 1}</td>
                                      <td>
                                        <strong style={{ color: 'var(--navy)' }}>{rx.medicineName}</strong>
                                        {rx.strength && <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>{rx.strength}</span>}
                                        {rx.appliedAreas && rx.appliedAreas.length > 0 && (
                                          <span style={{ color: '#047857', display: 'block', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                                            📍 Area: {rx.appliedAreas.join(', ')}
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <span>{rx.dosage || '—'}</span>
                                        {rx.route && <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>{rx.route}</span>}
                                      </td>
                                      <td>
                                        <span>{rx.frequency || '—'}</span>
                                        {rx.duration && <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>{rx.duration}</span>}
                                      </td>
                                      <td>
                                        <span style={{ color: 'var(--ink)' }}>{rx.instructions || 'As directed'}</span>
                                      </td>
                                      {onCopyPrescription && (
                                        <td style={{ textAlign: 'center' }}>
                                          <Button
                                            size="small"
                                            variant={isCopied ? 'primary' : 'ghost'}
                                            onClick={() => handleCopySingleItem(rx)}
                                            icon={isCopied ? <Check size={12} /> : <Copy size={12} />}
                                            style={{ fontSize: '11px', padding: '3px 8px' }}
                                          >
                                            {isCopied ? 'Copied' : 'Copy'}
                                          </Button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                            No digital medications were prescribed in this visit.
                          </p>
                        )}
                      </div>

                      {/* Uploaded Prescription / Scans */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                          <ImageIcon size={15} color="var(--teal)" />
                          Uploaded Prescription &amp; Attachments ({imgCount})
                        </span>

                        {imgCount > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                            {visit.prescriptionImages?.map((img, imgIdx) => {
                              const isPdf = img.mimeType === 'application/pdf' || img.name?.toLowerCase().endsWith('.pdf');
                              const url = resolveInlineDocumentUrl(img);

                              return (
                                <div
                                  key={img.id || imgIdx}
                                  onClick={() => setPreviewImage({ url, name: img.name })}
                                  style={{
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    background: '#F8FAFC',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                  }}
                                  title="Click to preview"
                                >
                                  {isPdf ? (
                                    <div style={{ height: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FEE2E2', color: '#DC2626' }}>
                                      <FileText size={28} />
                                      <span style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px' }}>PDF File</span>
                                    </div>
                                  ) : (
                                    <div style={{ height: '90px', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                      <img
                                        src={url}
                                        alt={img.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                  <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {img.name || `Scan ${imgIdx + 1}`}
                                    </span>
                                    <Eye size={13} color="var(--muted)" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                            No prescription images or scans attached for this visit.
                          </p>
                        )}
                      </div>

                      {/* Additional Documents or Procedures if any */}
                      {((visit.documents && visit.documents.length > 0) || (visit.procedures && visit.procedures.length > 0)) && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                          {visit.documents && visit.documents.length > 0 && (
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>
                                Attached Clinical Documents ({visit.documents.length})
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {visit.documents.map((doc) => (
                                  <a
                                    key={doc.id}
                                    href={resolveDocumentUrl(doc)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: '12px', color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                  >
                                    <FileText size={12} />
                                    <span>{doc.name}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {visit.procedures && visit.procedures.length > 0 && (
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>
                                Procedures &amp; Charges ({visit.procedures.length})
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {visit.procedures.map((p) => (
                                  <div key={p.id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--ink)' }}>{p.description}</span>
                                    <strong style={{ color: 'var(--navy)' }}>₹{p.amount}</strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── 3. Examination Findings ── */}
      <Card>
        <SectionHeading
          title="Examination Findings"
          subtitle="Record clinical observations, physical examination findings, and relevant signs noted during the visit."
        />
        <div style={{ marginTop: '12px' }}>
          <textarea
            id="clinical-examination"
            className="control textarea"
            value={consultation.examination}
            onChange={(event) => onChange({ examination: event.target.value })}
            placeholder="Document clinical findings, physical examination observations, and relevant signs..."
            rows={4}
            style={{ width: '100%', minHeight: 96 }}
          />
        </div>
      </Card>

      {/* ── 4. Diagnosis ── */}
      <Card>
        <SectionHeading
          title="Diagnosis"
          subtitle="Add one or more diagnoses for this visit. Type a diagnosis name and press Enter or Save."
        />

        {/* Tag display area */}
        <div style={{ marginTop: '12px' }}>
          {diagTags.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '14px',
                padding: '10px 12px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
              }}
            >
              {diagTags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px 4px 12px',
                    borderRadius: '999px',
                    background: '#DCFCE7',
                    border: '1px solid #86EFAC',
                    color: '#14532D',
                    fontSize: '13px',
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {tag}
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removeDiagTag(tag)}
                      aria-label={`Remove diagnosis: ${tag}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#86EFAC',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: '#14532D',
                        flexShrink: 0,
                      }}
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Input row */}
          {!isLocked && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  ref={diagInputRef}
                  id="diagnosis-input"
                  type="text"
                  className="control"
                  value={diagInput}
                  onChange={(e) => setDiagInput(e.target.value)}
                  onKeyDown={handleDiagKeyDown}
                  placeholder="Type a diagnosis name and press Enter or Save…"
                  autoComplete="off"
                />
              </div>
              <Button
                variant="primary"
                size="small"
                onClick={addDiagTag}
                disabled={!diagInput.trim()}
                icon={<Plus size={14} />}
                style={{ marginTop: '1px', whiteSpace: 'nowrap' }}
              >
                Save
              </Button>
            </div>
          )}

          {diagTags.length === 0 && (
            <div
              style={{
                padding: '10px 14px',
                marginTop: '14px',
                background: '#F8FAFC',
                border: '1px dashed #CBD5E1',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              No diagnosis added yet. Type below and press Enter or click Save.
            </div>
          )}
        </div>
      </Card>

      {/* Image Preview Modal */}
      {previewImage && (
        <Modal
          open={!!previewImage}
          onClose={() => setPreviewImage(null)}
          title={previewImage.name || 'Prescription Attachment Preview'}
          wide
        >
          <div style={{ textAlign: 'center', padding: '10px' }}>
            {previewImage.name?.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={previewImage.url}
                title={previewImage.name}
                style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: '6px' }}
              />
            ) : (
              <img
                src={previewImage.url}
                alt={previewImage.name}
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: '6px', border: '1px solid #E2E8F0' }}
              />
            )}
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <Button
                size="small"
                variant="secondary"
                onClick={() => downloadFile(previewImage.url, previewImage.name)}
                icon={<Download size={14} />}
              >
                Download File
              </Button>
              <Button size="small" variant="secondary" onClick={() => setPreviewImage(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
