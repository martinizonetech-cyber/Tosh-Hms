import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Download, Edit2, Eye, FileText, Image as ImageIcon, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import type { Department, PatientDocument } from '../../../types/domain';
import { useToast } from '../../../components/ui/Toast';
import { dateLabel, resolveDocumentUrl } from '../../../utils/format';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { createBrowserDemoDocument, isImageFile } from '../../../services/documents/browserDocumentService';
import { useHospitalData } from '../../../services/mock/DemoProvider';
import { DATA_MODE } from '../../../services/repositories/mode';

const categories = ['Clinical photo', 'Imaging', 'Lab report', 'Referral', 'Consent', 'Other'];

export function DocumentsPanel({
  patientId,
  department,
  documents,
  onChange,
}: {
  patientId: string;
  department: Department;
  documents: PatientDocument[];
  onChange: (documents: PatientDocument[]) => void;
}) {
  const toast = useToast();
  const { repository } = useHospitalData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState('Clinical photo');
  const [docName, setDocName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [preview, setPreview] = useState<PatientDocument | null>(null);

  // Rename state
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // When a file is chosen in single upload form, auto-suggest its name if blank
  const onSingleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        setDocName(cleanName);
      }
    }
  };

  // Add the named document from the entry form
  const handleAddNamedDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) {
      toast.push('Please choose a file to upload.', 'error');
      return;
    }
    setBusy(true);
    try {
      const finalName = docName.trim() || selectedFile.name;
      if (DATA_MODE === 'api') {
        const uploaded = await repository.uploadDocument(patientId, category, selectedFile, undefined, finalName);
        onChange([...documents, uploaded]);
      } else {
        const newDoc = await createBrowserDemoDocument(selectedFile, patientId, category, finalName);
        onChange([...documents, newDoc]);
      }
      toast.push(`Document attached to consultation.`);
      setSelectedFile(null);
      setDocName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not upload document.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Batch upload multiple files
  const handleBatchFiles = async (files: FileList | null) => {
    if (!files || !files.length || busy) return;
    setBusy(true);
    try {
      const newDocs: PatientDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (DATA_MODE === 'api') {
          const uploaded = await repository.uploadDocument(patientId, category, file);
          newDocs.push(uploaded);
        } else {
          const doc = await createBrowserDemoDocument(file, patientId, category);
          newDocs.push(doc);
        }
      }
      onChange([...documents, ...newDocs]);
      toast.push(`${newDocs.length} document${newDocs.length > 1 ? 's' : ''} added successfully.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not attach files.', 'error');
    } finally {
      setBusy(false);
      if (multiInputRef.current) multiInputRef.current.value = '';
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      handleBatchFiles(event.dataTransfer.files);
    }
  };

  const removeDoc = async (doc: PatientDocument) => {
    if (!window.confirm(`Remove "${doc.name}" from this consultation draft?`)) return;
    try {
      if (DATA_MODE === 'api' && repository.deleteDocument) {
        await repository.deleteDocument(doc.id);
      }
      onChange(documents.filter((item) => item.id !== doc.id));
      toast.push('Document removed.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not remove document.', 'error');
    }
  };

  const startRename = (doc: PatientDocument) => {
    setEditingDocId(doc.id);
    setEditNameValue(doc.name);
  };

  const saveRename = async (docId: string) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    try {
      if (DATA_MODE === 'api' && repository.renameDocument) {
        const updated = await repository.renameDocument(docId, trimmed);
        onChange(documents.map((d) => (d.id === docId ? updated : d)));
      } else if (repository.renameDocument) {
        const updated = await repository.renameDocument(docId, trimmed);
        onChange(documents.map((d) => (d.id === docId ? updated : d)));
      } else {
        onChange(
          documents.map((d) => (d.id === docId ? { ...d, name: trimmed } : d))
        );
      }
      setEditingDocId(null);
      toast.push('Document name updated.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not update document name.', 'error');
    }
  };

  return (
    <>
      <Card>
        <SectionHeading
          title="Patient documents"
          subtitle={`${department === 'skin' ? 'Skin / Dermatology' : 'Orthopaedics'} · Upload single or multiple clinical photos, scans, and documents with custom names.`}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge tone="info">{documents.length} files</Badge>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setShowAddForm((val) => !val)}
                icon={<Plus size={14} />}
              >
                {showAddForm ? 'Hide upload form' : 'Add document'}
              </Button>
            </div>
          }
        />

        {/* Upload Form (Single with Name or Batch with plus) */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: 12, color: 'var(--navy)' }}>Upload New Document</strong>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => multiInputRef.current?.click()}
              style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <UploadCloud size={13} />
              Quick Batch Upload
            </button>
          </div>

          <form onSubmit={handleAddNamedDocument}>
            <div className="form-grid three" style={{ marginBottom: 12 }}>
              <div className="field">
                <label htmlFor="doc-custom-name">Document Name</label>
                <input
                  id="doc-custom-name"
                  className="control"
                  placeholder="e.g. Skin Biopsy, Allergy Test"
                  value={docName}
                  onChange={(event) => setDocName(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="doc-category-select">Category</label>
                <select
                  id="doc-category-select"
                  className="control"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="doc-file-input">Select File</label>
                <input
                  ref={fileInputRef}
                  id="doc-file-input"
                  className="control"
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.svg,.pdf,application/pdf"
                  onChange={onSingleFileSelected}
                />
              </div>
            </div>

            {selectedFile && (
              <div
                style={{
                  background: '#EAF3F5',
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--navy)',
                }}
              >
                <span>
                  Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', color: '#64748B' }}
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Button type="submit" disabled={busy || !selectedFile} icon={<Plus size={14} />}>
                {busy ? 'Uploading…' : 'Add Document'}
              </Button>
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                Supports all images (JPG, PNG, WebP, AVIF, GIF, SVG) and PDF up to 25 MB
              </span>
            </div>
          </form>

          {/* Hidden batch input */}
          <input
            ref={multiInputRef}
            className="sr-only"
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.svg,.pdf,application/pdf"
            multiple
            onChange={(e) => handleBatchFiles(e.target.files)}
          />

          {/* Drag and drop zone */}
          <div
            className={`upload-drop${dragging ? ' dragging' : ''}`}
            style={{
              marginTop: 14,
              border: dragging ? '2px dashed #177E89' : '1px dashed var(--line)',
              background: dragging ? '#EAF3F5' : '#fff',
              padding: '12px 16px',
              borderRadius: 8,
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => multiInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span style={{ fontSize: 10, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <UploadCloud size={14} color="#177E89" />
              Or drag & drop one or more files here to attach instantly
            </span>
          </div>
        </div>

        {/* Document List Header with Add Symbol */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 13, color: 'var(--navy)' }}>Lab reports ({documents.length})</strong>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            icon={<Plus size={14} />}
          >
            Add Another Document
          </Button>
        </div>

        {documents.length ? (
          <div className="document-list">
            {documents.map((doc) => (
              <article className="document-row" key={doc.id}>
                <span className="document-icon">
                  {doc.mimeType.startsWith('image/') || isImageFile({ name: doc.name, type: doc.mimeType } as File) ? (
                    <ImageIcon size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                </span>

                <div className="document-main">
                  {editingDocId === doc.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <input
                        className="control"
                        style={{ height: 30, fontSize: 11, padding: '2px 8px' }}
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(doc.id);
                          if (e.key === 'Escape') setEditingDocId(null);
                        }}
                        autoFocus
                      />
                      <Button size="small" onClick={() => saveRename(doc.id)}>
                        Save
                      </Button>
                      <Button variant="ghost" size="small" onClick={() => setEditingDocId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{doc.name}</strong>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 0, cursor: 'pointer', color: '#94A3B8', padding: 2 }}
                        onClick={() => startRename(doc)}
                        title="Rename document"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Badge tone="neutral">{doc.category}</Badge>
                    <span>{dateLabel(doc.uploadedAt, 'd MMM yyyy · h:mm a')} · {(doc.size / 1024).toFixed(0)} KB</span>
                  </span>
                </div>

                <div className="document-actions">
                  {resolveDocumentUrl(doc) && (
                    <Button
                      variant="ghost"
                      size="small"
                      aria-label={`Preview ${doc.name}`}
                      onClick={() => setPreview(doc)}
                      icon={<Eye size={14} />}
                    >
                      Preview
                    </Button>
                  )}
                  {resolveDocumentUrl(doc) && (
                    <a
                      className="btn btn-ghost btn-small"
                      href={resolveDocumentUrl(doc)}
                      download={doc.name}
                      aria-label={`Download ${doc.name}`}
                    >
                      <Download size={14} />
                      Download
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="small"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => removeDoc(doc)}
                    icon={<Trash2 size={14} />}
                    style={{ color: '#BC4D52' }}
                  >
                    Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No documents attached"
            message="Click '+ Add Document' above to upload clinical photos, lab reports, imaging or consent forms with custom names."
            icon={<FileText size={18} />}
          />
        )}
      </Card>

      <Modal
        open={Boolean(preview)}
        title={preview?.name ?? 'Document preview'}
        subtitle={`${preview?.category ?? ''} · Local preview`}
        onClose={() => setPreview(null)}
        wide
      >
        {preview && (
          <div style={{ textAlign: 'center', padding: 8 }}>
            {preview.mimeType.startsWith('image/') || isImageFile({ name: preview.name, type: preview.mimeType } as File) ? (
              <img
                className="document-preview-image"
                src={resolveDocumentUrl(preview)}
                alt={`Preview of ${preview.name}`}
                style={{ maxHeight: '75vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 8 }}
              />
            ) : preview.mimeType === 'application/pdf' && resolveDocumentUrl(preview) ? (
              <iframe
                className="document-preview-pdf"
                title={`Preview of ${preview.name}`}
                src={resolveDocumentUrl(preview)}
                style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8 }}
              />
            ) : (
              <p>This document type has no inline preview. You can download it directly.</p>
            )}

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <a href={resolveDocumentUrl(preview)} download={preview.name} className="btn btn-secondary">
                <Download size={14} /> Download File
              </a>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
