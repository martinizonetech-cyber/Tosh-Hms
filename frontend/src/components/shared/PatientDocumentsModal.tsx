import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  UploadCloud,
  ExternalLink,
  FileUp,
  FolderOpen,
} from 'lucide-react';
import type { Department, Patient, PatientDocument, QueueEntry } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, departmentLabel, downloadFile, fetchPdfBlobUrl, resolveDocumentUrl, resolveInlineDocumentUrl } from '../../utils/format';
import { PatientAvatar } from './Primitives';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { createBrowserDemoDocuments } from '../../services/documents/browserDocumentService';

const documentCategories = [
  'Prescription',
  'Clinical photo',
  'Lab report',
  'Imaging / Scan',
  'Referral',
  'Consent',
  'Other',
];

interface PatientDocumentsModalProps {
  open: boolean;
  onClose: () => void;
  patient: Patient | null;
  queueEntry?: QueueEntry | null;
  department?: Department;
  defaultCategory?: string;
}

export function PatientDocumentsModal({
  open,
  onClose,
  patient,
  queueEntry,
  department: propDepartment,
  defaultCategory = 'Prescription',
}: PatientDocumentsModalProps) {
  const { state, repository, mode } = useHospitalData();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState(defaultCategory);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PatientDocument | null>(null);
  const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<'all' | 'prescription' | 'other'>('all');

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!preview) {
      setPdfPreviewBlobUrl(null);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }

    const isPdf =
      preview.mimeType === 'application/pdf' ||
      preview.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setPdfPreviewBlobUrl(null);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }

    setPdfLoading(true);
    setPdfError(null);

    fetchPdfBlobUrl(preview)
      .then((url) => {
        if (!active) {
          if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        if (url && url.startsWith('blob:')) {
          createdUrl = url;
        }
        setPdfPreviewBlobUrl(url);
        setPdfLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        const fallback = resolveInlineDocumentUrl(preview);
        setPdfPreviewBlobUrl(fallback);
        setPdfError(err instanceof Error ? err.message : 'Could not prepare inline PDF preview.');
        setPdfLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [preview]);

  if (!open || !patient) return null;

  const department: Department =
    propDepartment ?? queueEntry?.department ?? patient.departments[0] ?? 'skin';

  // Find all consultations for this patient
  const patientConsultations = state.consultations.filter((c) => c.patientId === patient.id);

  // Identify current visit if opened for a queue entry
  const queueVisit = queueEntry?.visitId
    ? patientConsultations.find((c) => c.id === queueEntry.visitId)
    : patientConsultations.find((c) => c.department === department);

  const currentVisitId = queueEntry?.visitId ?? queueVisit?.id;

  // Gather documents across this patient
  // Attach visit info for context
  const allDocuments: Array<PatientDocument & { visitId: string; visitDate: string; isCurrentVisit: boolean }> = [];
  for (const consultation of patientConsultations) {
    const isCurrent = currentVisitId ? consultation.id === currentVisitId : consultation.department === department;
    for (const doc of consultation.documents) {
      allDocuments.push({
        ...doc,
        visitId: consultation.id,
        visitDate: consultation.visitedAt,
        isCurrentVisit: isCurrent,
      });
    }
  }

  // Sort newest uploaded first
  allDocuments.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const filteredDocuments = allDocuments.filter((doc) => {
    if (viewFilter === 'prescription') return doc.category.toLowerCase().includes('prescription');
    if (viewFilter === 'other') return !doc.category.toLowerCase().includes('prescription');
    return true;
  });

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length || busy) return;

    setBusy(true);
    try {
      if (mode === 'api') {
        for (const file of files) {
          await repository.uploadDocument(patient.id, category, file, currentVisitId);
        }
      } else {
        const demoDocs = await createBrowserDemoDocuments(files, patient.id, category);
        repository.addDocuments(
          patient.id,
          department,
          demoDocs,
          queueEntry?.visitId,
          queueEntry?.id
        );
      }
      toast.push(
        `${files.length} document${files.length > 1 ? 's' : ''} uploaded and saved to patient record.`
      );
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not process files.', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) uploadFiles(event.target.files);
    event.currentTarget.value = '';
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files) uploadFiles(event.dataTransfer.files);
  };

  const removeDoc = (doc: PatientDocument & { visitId: string }) => {
    if (!window.confirm(`Are you sure you want to remove "${doc.name}" from patient record?`)) return;
    try {
      repository.removeDocument(patient.id, department, doc.id, doc.visitId);
      toast.push('Document removed from record.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not remove document.', 'error');
    }
  };

  const categoryTone = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower.includes('prescription')) return 'success';
    if (lower.includes('lab') || lower.includes('report')) return 'info';
    if (lower.includes('photo') || lower.includes('image') || lower.includes('scan')) return 'neutral';
    return 'warn';
  };

  return (
    <>
      <Modal
        open={open}
        title="Patient Prescriptions & Documents"
        subtitle={`${patient.fullName} (${patient.id}) · ${departmentLabel(department)}${
          queueEntry?.token ? ` · Token ${queueEntry.token}` : ''
        }`}
        onClose={onClose}
        wide
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {allDocuments.length} document{allDocuments.length === 1 ? '' : 's'} on record · Synced with Patient History & Doctor Workspace
            </span>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: '18px' }}>
          {/* Patient Quick Context */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              background: '#F7FAFB',
              borderRadius: '10px',
              border: '1px solid #E2ECF0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PatientAvatar name={patient.fullName} />
              <div>
                <strong style={{ fontSize: '14px', color: 'var(--navy)', display: 'block' }}>
                  {patient.fullName}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  ID: {patient.id} · Phone: {patient.phone} · Gender: {patient.gender}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <Badge tone="info">{departmentLabel(department)}</Badge>
              {queueEntry?.token && <Badge tone="warn">Token {queueEntry.token}</Badge>}
            </div>
          </div>

          {/* Upload Area */}
          <div
            style={{
              padding: '16px',
              border: '1px solid #E2ECF0',
              borderRadius: '12px',
              background: '#FFFFFF',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--navy)' }}>
                  Upload New Documents
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  Reception can upload prescription photos, scanned PDFs, lab reports, or referral letters.
                </p>
              </div>

              {/* Document Category Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="doc-cat-select" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--navy)' }}>
                  Category:
                </label>
                <select
                  id="doc-cat-select"
                  className="control"
                  style={{ width: 'auto', padding: '5px 10px', fontSize: '13px' }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {documentCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'Prescription' ? '💊 Prescription' : cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hidden File Input supporting multiple files */}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              style={{ display: 'none' }}
              onChange={onSelect}
              id="reception-doc-file-input"
            />

            {/* Drag & Drop Box */}
            <div
              className={`upload-drop${dragging ? ' dragging' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                cursor: busy ? 'wait' : 'pointer',
                borderColor: dragging ? 'var(--teal)' : '#B8D5DC',
                background: dragging ? '#EAF5F7' : '#F9FCFD',
                padding: '20px',
                textAlign: 'center',
                borderRadius: '10px',
                borderWidth: '2px',
                borderStyle: 'dashed',
              }}
            >
              <UploadCloud size={30} color={dragging ? '#177E89' : '#0B5351'} style={{ margin: '0 auto 6px' }} />
              <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>
                {busy
                  ? 'Processing & reading documents…'
                  : dragging
                  ? 'Drop documents here to upload'
                  : 'Click to browse or drop prescription & documents here'}
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Supports <strong>multiple files</strong>: Photos (JPG, PNG, WebP) or PDF documents · Up to 10 MB per file
              </span>
            </div>
          </div>

          {/* Documents Register & History */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '8px',
                borderBottom: '1px solid #E2ECF0',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderOpen size={17} color="#177E89" />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--navy)' }}>
                  Attached Documents & History ({allDocuments.length})
                </h4>
              </div>

              {/* View filter tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setViewFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid',
                    borderColor: viewFilter === 'all' ? 'var(--teal)' : '#DCE5E8',
                    background: viewFilter === 'all' ? 'var(--pale)' : '#FFF',
                    color: viewFilter === 'all' ? 'var(--navy)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontWeight: viewFilter === 'all' ? 600 : 400,
                  }}
                >
                  All ({allDocuments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewFilter('prescription')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid',
                    borderColor: viewFilter === 'prescription' ? 'var(--teal)' : '#DCE5E8',
                    background: viewFilter === 'prescription' ? 'var(--pale)' : '#FFF',
                    color: viewFilter === 'prescription' ? 'var(--navy)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontWeight: viewFilter === 'prescription' ? 600 : 400,
                  }}
                >
                  Prescriptions (
                  {allDocuments.filter((d) => d.category.toLowerCase().includes('prescription')).length}
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setViewFilter('other')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid',
                    borderColor: viewFilter === 'other' ? 'var(--teal)' : '#DCE5E8',
                    background: viewFilter === 'other' ? 'var(--pale)' : '#FFF',
                    color: viewFilter === 'other' ? 'var(--navy)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontWeight: viewFilter === 'other' ? 600 : 400,
                  }}
                >
                  Other (
                  {allDocuments.filter((d) => !d.category.toLowerCase().includes('prescription')).length}
                  )
                </button>
              </div>
            </div>

            {filteredDocuments.length ? (
              <div style={{ display: 'grid', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {filteredDocuments.map((doc) => {
                  const isImage = doc.mimeType.startsWith('image/');
                  const isPdf = doc.mimeType === 'application/pdf';

                  return (
                    <article
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #E5EDF0',
                        background: '#FAFDFE',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Thumbnail or icon */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: isImage ? '#EEF5F7' : '#FDF0EE',
                            border: '1px solid #DCE6EA',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                            cursor: resolveDocumentUrl(doc) ? 'pointer' : 'default',
                          }}
                          onClick={() => resolveDocumentUrl(doc) && setPreview(doc)}
                          title="Click to preview"
                        >
                          {isImage && resolveDocumentUrl(doc) ? (
                            <img
                              src={resolveDocumentUrl(doc)}
                              alt={doc.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : isPdf ? (
                            <FileText size={20} color="#C83E4D" />
                          ) : (
                            <ImageIcon size={20} color="#177E89" />
                          )}
                        </div>

                        {/* File Details */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong
                              style={{
                                fontSize: '13px',
                                color: 'var(--navy)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '280px',
                              }}
                              title={doc.name}
                            >
                              {doc.name}
                            </strong>
                            <Badge tone={categoryTone(doc.category)}>{doc.category}</Badge>
                            {doc.isCurrentVisit && (
                              <Badge tone="info">Current Queue Visit</Badge>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                            Uploaded {dateLabel(doc.uploadedAt, 'd MMM yyyy · h:mm a')} · {(doc.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {doc.dataUrl && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => setPreview(doc)}
                            icon={<Eye size={13} />}
                          >
                            Open / Preview
                          </Button>
                        )}
                        {resolveDocumentUrl(doc) && (
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => downloadFile(resolveDocumentUrl(doc), doc.name)}
                            icon={<Download size={13} />}
                            title={`Download ${doc.name}`}
                          >
                            Download
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => removeDoc(doc)}
                          aria-label={`Delete ${doc.name}`}
                          icon={<Trash2 size={13} />}
                        >
                          Remove
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No documents in this view"
                message="Upload patient prescriptions or medical photos using the upload area above."
                icon={<FileUp size={20} />}
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Document View / Preview Modal */}
      {preview && (
        <Modal
          open={Boolean(preview)}
          title={preview.name}
          subtitle={`${preview.category} · Uploaded ${dateLabel(preview.uploadedAt, 'd MMM yyyy · h:mm a')} (${(
            preview.size / 1024
          ).toFixed(0)} KB)`}
          onClose={() => setPreview(null)}
          wide
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {resolveDocumentUrl(preview) && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => downloadFile(resolveDocumentUrl(preview), preview.name)}
                    icon={<Download size={14} />}
                  >
                    Download file
                  </Button>
                )}
                {resolveDocumentUrl(preview) && (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      const win = window.open();
                      if (win) {
                        win.document.write(
                          `<iframe src="${resolveDocumentUrl(preview)}" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`
                        );
                      }
                    }}
                    icon={<ExternalLink size={14} />}
                  >
                    Open in new tab
                  </Button>
                )}
              </div>
              <Button onClick={() => setPreview(null)}>Close preview</Button>
            </div>
          }
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '380px',
              background: '#0B171B',
              borderRadius: '8px',
              padding: '12px',
              overflow: 'auto',
            }}
          >
            {preview.mimeType.startsWith('image/') && resolveDocumentUrl(preview) ? (
              <img
                src={resolveDocumentUrl(preview)}
                alt={preview.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              />
            ) : preview.mimeType === 'application/pdf' || preview.name.toLowerCase().endsWith('.pdf') ? (
              <div style={{ position: 'relative', width: '100%', height: '65vh', background: '#FFFFFF', borderRadius: '6px' }}>
                {pdfLoading && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(255, 255, 255, 0.92)',
                      zIndex: 10,
                      borderRadius: 6,
                    }}
                  >
                    <Loader2 size={36} className="animate-spin" style={{ color: '#13808D', marginBottom: 12 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>Preparing PDF preview...</span>
                  </div>
                )}
                {pdfPreviewBlobUrl ? (
                  <object
                    data={pdfPreviewBlobUrl}
                    type="application/pdf"
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: '6px', background: '#FFFFFF' }}
                  >
                    <iframe
                      src={pdfPreviewBlobUrl}
                      title={`Preview of ${preview.name}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        borderRadius: '6px',
                        background: '#FFFFFF',
                      }}
                    />
                  </object>
                ) : !pdfLoading && (
                  <div
                    style={{
                      padding: 30,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      background: '#F8FAFC',
                      borderRadius: 6,
                      color: 'var(--navy)',
                    }}
                  >
                    <FileText size={48} style={{ color: '#13808D', marginBottom: 12, opacity: 0.8 }} />
                    <p style={{ fontWeight: 600, marginBottom: 6 }}>{preview.name}</p>
                    <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                      {pdfError || 'Direct inline preview could not be loaded.'}
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() => window.open(pdfPreviewBlobUrl || resolveDocumentUrl(preview), '_blank', 'noopener,noreferrer')}
                        icon={<ExternalLink size={14} />}
                      >
                        Open in New Tab
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => downloadFile(pdfPreviewBlobUrl || resolveDocumentUrl(preview), preview.name)}
                        icon={<Download size={14} />}
                      >
                        Download PDF
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: '#FFFFFF', textAlign: 'center' }}>
                <FileText size={48} style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                <p>This file type cannot be previewed directly in the browser.</p>
                {resolveDocumentUrl(preview) && (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => downloadFile(resolveDocumentUrl(preview), preview.name)}
                    icon={<Download size={14} />}
                  >
                    Download to view
                  </Button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
