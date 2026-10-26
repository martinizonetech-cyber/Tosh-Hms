import { useRef, useState, useMemo, useEffect } from 'react';
import {
  Bone,
  Check,
  CheckSquare,
  ClipboardList,
  Download,
  Edit2,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Pill,
  Plus,
  Printer,
  Search,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { Consultation, PrescriptionImage, PrescriptionItem } from '../../../types/domain';
import type { BodyRegionDefinition } from './bodyRegionTemplates';
import { fetchBodyRegionTemplates, readBodyRegionTemplates, TEMPLATES_UPDATED_EVENT } from './bodyRegionTemplates';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { createPrescriptionImage, isImageFile } from '../../../services/documents/browserDocumentService';
import { useHospitalData } from '../../../services/mock/DemoProvider';
import { DATA_MODE } from '../../../services/repositories/mode';
import { dateLabel, resolveDocumentUrl } from '../../../utils/format';

type PrescriptionMode = 'manual' | 'upload' | 'templates';

const DOSAGE_FORM_OPTIONS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Cream',
  'Ointment',
  'Gel',
  'Lotion',
  'Injection',
  'Drops',
  'Sachet',
  'Spray',
  'Inhaler',
  'Suspension',
  'Powder',
  'Patch',
  'Other',
];

const ROUTE_OPTIONS = [
  'Oral',
  'Topical',
  'Sublingual',
  'Intramuscular (IM)',
  'Intravenous (IV)',
  'Subcutaneous (SC)',
  'Inhalation',
  'Ophthalmic (Eye)',
  'Otic (Ear)',
  'Nasal',
  'Intra-articular',
];

const FREQUENCY_OPTIONS = [
  'Twice daily',
  'Once daily',
  'Thrice daily',
  'Four times daily',
  'Once daily in morning (OD - AM)',
  'Once daily at night (HS)',
  'As needed (SOS)',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'Once weekly',
];

const DURATION_OPTIONS = [
  '3 days',
  '5 days',
  '7 days',
  '10 days',
  '14 days',
  '21 days',
  '1 month',
  '2 months',
  'Ongoing',
];

const QUICK_INSTRUCTION_CHIPS = [
  'Take after meals',
  'Take before meals',
  'Empty stomach',
  'At bedtime',
  'As needed (SOS)',
];

const COMMON_MEDICINE_SUGGESTIONS = [
  'Paracetamol',
  'Pantoprazole',
  'Aceclofenac + Paracetamol',
  'Thiocolchicoside',
  'Cetirizine',
  'Diclofenac Gel',
  'Clobetasol Propionate Cream',
  'Mupirocin Ointment',
  'Ketoconazole Cream',
  'Calcium Carbonate + Vitamin D3',
  'Amoxicillin + Clavulanate',
  'Azithromycin',
  'Montelukast + Levocetirizine',
  'Tramadol + Paracetamol',
  'Methylcobalamin',
  'Glucosamine Sulfate + Chondroitin',
  'Omeprazole',
  'Ibuprofen',
];

const STRENGTH_OPTIONS = [
  '650 mg',
  '500 mg',
  '400 mg',
  '250 mg',
  '100 mg',
  '40 mg',
  '20 mg',
  '10 mg',
  '5 mg',
  '1%',
  '2%',
  '0.05%',
  '0.1%',
  '100mg / 325mg',
  '60,000 IU',
  '1500 mcg',
];

const defaultFormValues = {
  medicineName: '',
  strength: '',
  dosage: 'Tablet',
  route: 'Oral',
  frequency: 'Twice daily',
  duration: '5 days',
  instructions: '',
};

export function PrescriptionPanel({
  consultation,
  onChange,
  onPrint,
  department: _department,
}: {
  consultation: Consultation;
  onChange: (patch: Partial<Consultation>) => void;
  onPrint: () => void;
  department?: string;
}) {
  const toast = useToast();
  const { repository } = useHospitalData();

  // Mode selection: 'manual' | 'upload' | 'templates'
  const [activeMode, setActiveMode] = useState<PrescriptionMode>('manual');

  // Manual entry form state
  const [formState, setFormState] = useState(defaultFormValues);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Upload state
  const [imageDragging, setImageDragging] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<PrescriptionImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prescriptionImages = consultation.prescriptionImages ?? [];
  const hasPrescriptionContent = consultation.prescription.length > 0 || prescriptionImages.length > 0;

  // Body Region Templates
  const [bodyRegionTemplates, setBodyRegionTemplates] = useState<BodyRegionDefinition[]>(() =>
    readBodyRegionTemplates()
  );
  const [activeTemplateRegion, setActiveTemplateRegion] = useState<string>('Knee');
  const [selectedTemplateMedIds, setSelectedTemplateMedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    fetchBodyRegionTemplates()
      .then((data) => {
        if (mounted && data && data.length > 0) {
          setBodyRegionTemplates(data);
          if (!data.some((d) => d.region === activeTemplateRegion)) {
            setActiveTemplateRegion(data[0].region);
          }
        }
      })
      .catch(() => {});

    const handler = (e: any) => {
      if (Array.isArray(e.detail) && e.detail.length > 0) {
        setBodyRegionTemplates(e.detail);
      }
    };
    window.addEventListener(TEMPLATES_UPDATED_EVENT, handler);
    return () => {
      mounted = false;
      window.removeEventListener(TEMPLATES_UPDATED_EVENT, handler);
    };
  }, []);

  const activeDef = useMemo(
    () => bodyRegionTemplates.find((t) => t.region === activeTemplateRegion) || bodyRegionTemplates[0],
    [bodyRegionTemplates, activeTemplateRegion]
  );

  // Auto-select all medicines when switching region
  useEffect(() => {
    if (activeDef?.medications) {
      setSelectedTemplateMedIds(new Set(activeDef.medications.map((m) => m.id)));
    } else {
      setSelectedTemplateMedIds(new Set());
    }
  }, [activeDef]);

  const toggleTemplateMed = (id: string) => {
    setSelectedTemplateMedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllTemplateMeds = () => {
    if (!activeDef?.medications) return;
    if (selectedTemplateMedIds.size === activeDef.medications.length) {
      setSelectedTemplateMedIds(new Set());
    } else {
      setSelectedTemplateMedIds(new Set(activeDef.medications.map((m) => m.id)));
    }
  };

  const addSelectedTemplateMeds = () => {
    if (!activeDef?.medications || selectedTemplateMedIds.size === 0) {
      toast.push('Please select at least one tablet to add to prescription.', 'info');
      return;
    }
    const toAdd = activeDef.medications.filter((m) => selectedTemplateMedIds.has(m.id));
    const newItems: PrescriptionItem[] = toAdd.map((m) => ({
      id: `RX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      medicineName: m.medicineName,
      strength: m.strength,
      dosage: m.dosage || 'Tablet',
      route: m.route || 'Oral',
      frequency: m.frequency || 'Twice daily',
      duration: m.duration || '5 days',
      instructions: m.instructions || '',
    }));
    onChange({ prescription: [...consultation.prescription, ...newItems] });
    toast.push(`Added ${newItems.length} tablet${newItems.length > 1 ? 's' : ''} to prescription for ${activeDef.region}.`);
  };

  // Form handling
  const handleFormSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formState.medicineName.trim()) {
      toast.push('Please enter a medicine name.', 'error');
      return;
    }
    if (!formState.strength.trim()) {
      toast.push('Please enter strength / dosage (e.g. 650 mg).', 'error');
      return;
    }

    if (editingId) {
      // Update existing item
      const updated = consultation.prescription.map((item) =>
        item.id === editingId
          ? {
              ...item,
              medicineName: formState.medicineName.trim(),
              strength: formState.strength.trim(),
              dosage: formState.dosage,
              route: formState.route,
              frequency: formState.frequency,
              duration: formState.duration,
              instructions: formState.instructions.trim(),
            }
          : item
      );
      onChange({ prescription: updated });
      toast.push(`Updated ${formState.medicineName}.`);
      setEditingId(null);
      setFormState(defaultFormValues);
    } else {
      // Add new item
      const newItem: PrescriptionItem = {
        id: `RX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        medicineName: formState.medicineName.trim(),
        strength: formState.strength.trim(),
        dosage: formState.dosage,
        route: formState.route,
        frequency: formState.frequency,
        duration: formState.duration,
        instructions: formState.instructions.trim(),
      };
      onChange({ prescription: [...consultation.prescription, newItem] });
      toast.push(`Added ${newItem.medicineName} to prescription.`);
      setFormState({
        ...defaultFormValues,
        dosage: formState.dosage,
        route: formState.route,
        frequency: formState.frequency,
        duration: formState.duration,
      });
    }
  };

  const handleEditMed = (item: PrescriptionItem) => {
    setEditingId(item.id);
    setFormState({
      medicineName: item.medicineName,
      strength: item.strength,
      dosage: item.dosage || 'Tablet',
      route: item.route || 'Oral',
      frequency: item.frequency || 'Twice daily',
      duration: item.duration || '5 days',
      instructions: item.instructions || '',
    });
    setActiveMode('manual');
    // Scroll smoothly to form
    const formElem = document.getElementById('manual-entry-section');
    if (formElem) {
      formElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormState(defaultFormValues);
  };

  const handleRemoveMed = (id: string, name: string) => {
    if (!window.confirm(`Remove "${name || 'medication'}" from prescription?`)) return;
    onChange({ prescription: consultation.prescription.filter((item) => item.id !== id) });
    if (editingId === id) {
      handleCancelEdit();
    }
    toast.push('Medication removed.');
  };

  const handleClearAll = () => {
    if (!consultation.prescription.length) return;
    if (!window.confirm(`Are you sure you want to clear all ${consultation.prescription.length} medications from this prescription?`)) {
      return;
    }
    onChange({ prescription: [] });
    handleCancelEdit();
    toast.push('All medications cleared.');
  };

  // Prescription Upload handling
  const handleImageFiles = async (files: FileList | null) => {
    if (!files || !files.length || uploadingImage) return;
    if (!consultation.patientId) {
      toast.push('Please select a patient before uploading prescription files.', 'error');
      return;
    }
    setUploadingImage(true);
    const newImages: PrescriptionImage[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rxImg = await createPrescriptionImage(file);
        if (DATA_MODE === 'api') {
          const visitId = consultation.id && !consultation.id.startsWith('DRAFT-') ? consultation.id : undefined;
          const uploadedDoc = await repository.uploadDocument(
            consultation.patientId,
            'Prescription',
            file,
            visitId
          );
          newImages.push({
            id: uploadedDoc.id,
            name: uploadedDoc.name,
            mimeType: uploadedDoc.mimeType,
            size: uploadedDoc.size,
            uploadedAt: uploadedDoc.uploadedAt,
            url: uploadedDoc.url,
            dataUrl: rxImg.dataUrl,
          });
        } else {
          newImages.push(rxImg);
        }
      }
      onChange({ prescriptionImages: [...prescriptionImages, ...newImages] });
      toast.push(`${newImages.length} prescription file${newImages.length > 1 ? 's' : ''} uploaded successfully.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not upload prescription file.', 'error');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = async (id: string, name: string) => {
    if (!window.confirm(`Remove prescription file "${name}"?`)) return;
    try {
      if (DATA_MODE === 'api' && repository.deleteDocument) {
        await repository.deleteDocument(id);
      }
      onChange({ prescriptionImages: prescriptionImages.filter((img) => img.id !== id) });
      toast.push('Prescription file removed.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not remove prescription file.', 'error');
    }
  };

  return (
    <div className="prescription-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 3 Top Mode Selector Cards */}
      <div
        className="prescription-mode-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Manual Entry */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveMode('manual')}
          onKeyDown={(e) => e.key === 'Enter' && setActiveMode('manual')}
          style={{
            padding: '16px 20px',
            borderRadius: 14,
            border: activeMode === 'manual' ? '1.5px solid #13808D' : '1px solid #E2E8F0',
            background: activeMode === 'manual' ? '#F0F9FA' : '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.18s ease',
            boxShadow: activeMode === 'manual' ? '0 2px 8px rgba(19,128,141,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: activeMode === 'manual' ? '#13808D' : '#F1F5F9',
              color: activeMode === 'manual' ? '#FFFFFF' : '#475569',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
          >
            <Edit3 size={20} />
          </div>
          <div>
            <strong style={{ fontSize: 15, color: '#0F172A', display: 'block', fontWeight: 700 }}>
              Manual Entry
            </strong>
            <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 2 }}>
              Add medicines manually
            </span>
          </div>
        </div>

        {/* Card 2: Upload Prescription */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveMode('upload')}
          onKeyDown={(e) => e.key === 'Enter' && setActiveMode('upload')}
          style={{
            padding: '16px 20px',
            borderRadius: 14,
            border: activeMode === 'upload' ? '1.5px solid #13808D' : '1px solid #E2E8F0',
            background: activeMode === 'upload' ? '#F0F9FA' : '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.18s ease',
            boxShadow: activeMode === 'upload' ? '0 2px 8px rgba(19,128,141,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: activeMode === 'upload' ? '#13808D' : '#EFF6FF',
              color: activeMode === 'upload' ? '#FFFFFF' : '#2563EB',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
          >
            <ImageIcon size={20} />
          </div>
          <div>
            <strong style={{ fontSize: 15, color: '#0F172A', display: 'block', fontWeight: 700 }}>
              Upload Prescription
            </strong>
            <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 2 }}>
              Upload image / PDF
            </span>
          </div>
        </div>

        {/* Card 3: Body Region Templates */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveMode('templates')}
          onKeyDown={(e) => e.key === 'Enter' && setActiveMode('templates')}
          style={{
            padding: '16px 20px',
            borderRadius: 14,
            border: activeMode === 'templates' ? '1.5px solid #13808D' : '1px solid #E2E8F0',
            background: activeMode === 'templates' ? '#F0F9FA' : '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.18s ease',
            boxShadow: activeMode === 'templates' ? '0 2px 8px rgba(19,128,141,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: activeMode === 'templates' ? '#13808D' : '#EFF6FF',
              color: activeMode === 'templates' ? '#FFFFFF' : '#2563EB',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
          >
            <ClipboardList size={20} />
          </div>
          <div>
            <strong style={{ fontSize: 15, color: '#0F172A', display: 'block', fontWeight: 700 }}>
              Body Region Templates
            </strong>
            <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 2 }}>
              Use predefined templates
            </span>
          </div>
        </div>
      </div>

      {/* Active Mode Content Container */}
      <div
        id="manual-entry-section"
        style={{
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          background: '#FFFFFF',
          padding: '24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        }}
      >
        {/* VIEW 1: MANUAL ENTRY */}
        {activeMode === 'manual' && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#13808D',
                    color: '#FFFFFF',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Edit3 size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 16, color: '#0F172A', display: 'block', fontWeight: 700 }}>
                    {editingId ? 'Edit Medication' : 'Manual Entry'}
                  </strong>
                  <span style={{ fontSize: 13, color: '#64748B', display: 'block', marginTop: 2 }}>
                    {editingId
                      ? 'Modify the medication details and click Update medication.'
                      : 'Add medicines manually to create a prescription.'}
                  </span>
                </div>
              </div>

              {editingId && (
                <Button variant="secondary" size="small" onClick={handleCancelEdit} icon={<X size={14} />}>
                  Cancel editing
                </Button>
              )}
            </div>

            {/* Entry Form */}
            <form onSubmit={handleFormSubmit}>
              {/* Row 1: Medicine name, Strength / dosage, Dosage form, Route */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: 14,
                  marginBottom: 16,
                }}
              >
                {/* Medicine Name */}
                <div style={{ minWidth: 220 }}>
                  <label
                    htmlFor="rx-input-med-name"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Medicine name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={15}
                      style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#94A3B8',
                        pointerEvents: 'none',
                      }}
                    />
                    <input
                      id="rx-input-med-name"
                      type="text"
                      className="control"
                      value={formState.medicineName}
                      onChange={(e) => setFormState({ ...formState, medicineName: e.target.value })}
                      placeholder="Search or enter medicine name (e.g. Paracetamol)"
                      list="rx-common-medicines"
                      style={{
                        height: 42,
                        paddingLeft: 36,
                        paddingRight: 12,
                        fontSize: 13.5,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        width: '100%',
                      }}
                    />
                  </div>
                </div>

                {/* Strength / dosage */}
                <div>
                  <label
                    htmlFor="rx-input-strength"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Strength / dosage <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    id="rx-input-strength"
                    type="text"
                    className="control"
                    value={formState.strength}
                    onChange={(e) => setFormState({ ...formState, strength: e.target.value })}
                    placeholder="e.g. 650 mg"
                    list="rx-strengths"
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                    }}
                  />
                </div>

                {/* Dosage form */}
                <div>
                  <label
                    htmlFor="rx-select-dosage-form"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Dosage form <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    id="rx-select-dosage-form"
                    className="control"
                    value={formState.dosage}
                    onChange={(e) => setFormState({ ...formState, dosage: e.target.value })}
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                      background: '#FFFFFF',
                    }}
                  >
                    {DOSAGE_FORM_OPTIONS.map((form) => (
                      <option key={form} value={form}>
                        {form}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Route */}
                <div>
                  <label
                    htmlFor="rx-select-route"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Route <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    id="rx-select-route"
                    className="control"
                    value={formState.route}
                    onChange={(e) => setFormState({ ...formState, route: e.target.value })}
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                      background: '#FFFFFF',
                    }}
                  >
                    {ROUTE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Frequency, Duration, Instructions */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                {/* Frequency */}
                <div>
                  <label
                    htmlFor="rx-select-frequency"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Frequency <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    id="rx-select-frequency"
                    className="control"
                    value={formState.frequency}
                    onChange={(e) => setFormState({ ...formState, frequency: e.target.value })}
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                      background: '#FFFFFF',
                    }}
                  >
                    {FREQUENCY_OPTIONS.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div>
                  <label
                    htmlFor="rx-select-duration"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Duration <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    id="rx-select-duration"
                    className="control"
                    value={formState.duration}
                    onChange={(e) => setFormState({ ...formState, duration: e.target.value })}
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                      background: '#FFFFFF',
                    }}
                  >
                    {DURATION_OPTIONS.map((dur) => (
                      <option key={dur} value={dur}>
                        {dur}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Instructions */}
                <div style={{ gridColumn: 'span 1' }}>
                  <label
                    htmlFor="rx-input-instructions"
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                  >
                    Instructions
                  </label>
                  <input
                    id="rx-input-instructions"
                    type="text"
                    className="control"
                    value={formState.instructions}
                    onChange={(e) => setFormState({ ...formState, instructions: e.target.value })}
                    placeholder="e.g. Take after meals"
                    list="rx-instructions"
                    style={{
                      height: 42,
                      padding: '0 12px',
                      fontSize: 13.5,
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      width: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Row 3: Quick Instruction Chips + Add Button */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  paddingTop: 4,
                }}
              >
                {/* Quick Chips */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {QUICK_INSTRUCTION_CHIPS.map((chip) => (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => setFormState({ ...formState, instructions: chip })}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        border: formState.instructions === chip ? '1px solid #13808D' : '1px solid #E2E8F0',
                        background: formState.instructions === chip ? '#F0F9FA' : '#FFFFFF',
                        color: formState.instructions === chip ? '#13808D' : '#334155',
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Action button */}
                <button
                  type="submit"
                  style={{
                    background: '#0E1E38',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '11px 22px',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 1px 3px rgba(14,30,56,0.2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {editingId ? (
                    <>
                      <Check size={16} /> Update medication
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> Add to list
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 2: UPLOAD PRESCRIPTION */}
        {activeMode === 'upload' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UploadCloud size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: 16, color: '#0F172A', display: 'block', fontWeight: 700 }}>
                    Upload Prescription
                  </strong>
                  <span style={{ fontSize: 13, color: '#64748B', display: 'block', marginTop: 2 }}>
                    Upload photos, scans, or PDF documents of physical prescription sheets.
                  </span>
                </div>
              </div>

              <Button
                variant="secondary"
                size="small"
                onClick={() => fileInputRef.current?.click()}
                icon={<Plus size={14} />}
                disabled={uploadingImage}
              >
                {uploadingImage ? 'Uploading…' : 'Choose files'}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              className="sr-only"
              id="prescription-file-upload-mode"
              type="file"
              accept="image/*,application/pdf,.pdf,.doc,.docx,.txt"
              multiple
              onChange={(e) => handleImageFiles(e.target.files)}
            />

            <div
              className={`upload-drop${imageDragging ? ' dragging' : ''}`}
              style={{
                cursor: 'pointer',
                border: imageDragging ? '2px dashed #13808D' : '1.5px dashed #CBD5E1',
                background: imageDragging ? '#F0F9FA' : '#FAFCFC',
                padding: '28px 20px',
                borderRadius: 12,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
                transition: 'all 0.15s ease',
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setImageDragging(true);
              }}
              onDragLeave={() => setImageDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setImageDragging(false);
                handleImageFiles(e.dataTransfer.files);
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#E2F1F0',
                  color: '#13808D',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <UploadCloud size={22} />
              </div>
              <strong style={{ fontSize: 14, color: '#0F172A' }}>
                {uploadingImage
                  ? 'Reading prescription attachment…'
                  : 'Choose prescription file (PDF or image) or drag & drop here'}
              </strong>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                Supports JPG, PNG, WebP, SVG, AVIF, and PDF documents · Multiple files supported
              </span>
            </div>

            {/* Uploaded Files Grid */}
            {prescriptionImages.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 14,
                  marginTop: 14,
                }}
              >
                {prescriptionImages.map((img, idx) => {
                  const isPdf = img.mimeType === 'application/pdf' || img.name.toLowerCase().endsWith('.pdf');
                  const isImg =
                    img.mimeType?.startsWith('image/') ||
                    isImageFile({ name: img.name, type: img.mimeType } as File);

                  return (
                    <div
                      key={img.id}
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div
                        style={{
                          height: 125,
                          background: '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                        onClick={() => setPreviewImage(img)}
                        title="Click to preview"
                      >
                        {isImg ? (
                          <img
                            src={resolveDocumentUrl(img)}
                            alt={img.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : isPdf ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#DC2626' }}>
                            <FileText size={38} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A' }}>PDF Document</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#13808D' }}>
                            <FileText size={38} />
                            <span style={{ fontSize: 11, fontWeight: 600 }}>File</span>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <strong
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: '#0F172A',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                            title={img.name}
                          >
                            Rx {idx + 1}: {img.name}
                          </strong>
                          <Badge tone={isPdf ? 'danger' : isImg ? 'info' : 'neutral'}>
                            {isPdf ? 'PDF' : isImg ? 'Image' : 'Doc'}
                          </Badge>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>
                          {(img.size / 1024).toFixed(0)} KB · {dateLabel(img.uploadedAt, 'd MMM · h:mm a')}
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                            marginTop: 'auto',
                            paddingTop: 8,
                            borderTop: '1px solid #F1F5F9',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setPreviewImage(img)}
                              icon={<Eye size={12} />}
                              style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
                            >
                              Preview
                            </Button>
                            <a
                              href={resolveDocumentUrl(img)}
                              download={img.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-small"
                              style={{
                                padding: '3px 8px',
                                fontSize: 11,
                                height: 26,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                textDecoration: 'none',
                              }}
                              title="Download file"
                            >
                              <Download size={12} />
                              Download
                            </a>
                          </div>
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => removeImage(img.id, img.name)}
                            icon={<Trash2 size={12} />}
                            style={{ padding: '3px 8px', fontSize: 11, height: 26, color: '#DC2626' }}
                            title="Delete file"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: BODY REGION TEMPLATES */}
        {activeMode === 'templates' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#E2F1F0',
                    color: '#13808D',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bone size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: 16, color: '#0F172A', display: 'block', fontWeight: 700 }}>
                    Body Region Tablets Template ({activeDef?.region || 'Knee'})
                  </strong>
                  <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 2 }}>
                    Pick a body region, review standard tablets, and click Add Selected to load them into the prescription.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={toggleSelectAllTemplateMeds}
                  icon={
                    activeDef?.medications && selectedTemplateMedIds.size === activeDef.medications.length ? (
                      <CheckSquare size={14} color="#13808D" />
                    ) : (
                      <Square size={14} />
                    )
                  }
                  style={{ fontSize: 12.5, fontWeight: 600 }}
                >
                  {activeDef?.medications && selectedTemplateMedIds.size === activeDef.medications.length
                    ? 'Deselect All'
                    : `Select All (${activeDef?.medications?.length ?? 10})`}
                </Button>
                <button
                  type="button"
                  disabled={selectedTemplateMedIds.size === 0}
                  onClick={addSelectedTemplateMeds}
                  style={{
                    background: selectedTemplateMedIds.size === 0 ? '#94A3B8' : '#0E1E38',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: selectedTemplateMedIds.size === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Pill size={14} /> Add Selected ({selectedTemplateMedIds.size}) to Prescription
                </button>
              </div>
            </div>

            {/* Region Selector Pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {bodyRegionTemplates.map((item) => {
                const isSelected = activeTemplateRegion === item.region;
                return (
                  <button
                    type="button"
                    key={item.region}
                    style={{
                      padding: '7px 15px',
                      borderRadius: 24,
                      border: isSelected ? '1.5px solid #13808D' : '1px solid #CBD5E1',
                      background: isSelected ? '#13808D' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : '#334155',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(19,128,141,0.2)' : 'none',
                    }}
                    onClick={() => setActiveTemplateRegion(item.region)}
                  >
                    <span>{item.region}</span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : '#64748B',
                        fontWeight: 700,
                      }}
                    >
                      {item.medications?.length ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tablets List Grid */}
            {activeDef?.medications && activeDef.medications.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: 10,
                  maxHeight: 340,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {activeDef.medications.map((med, idx) => {
                  const isChecked = selectedTemplateMedIds.has(med.id);
                  return (
                    <label
                      key={med.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '11px 14px',
                        borderRadius: 10,
                        background: isChecked ? '#FFFFFF' : '#F8FAFC',
                        border: isChecked ? '1.5px solid #13808D' : '1px solid #E2E8F0',
                        cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s',
                        boxShadow: isChecked ? '0 2px 6px rgba(19,128,141,0.08)' : 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTemplateMed(med.id)}
                        style={{ marginTop: 3, cursor: 'pointer', accentColor: '#13808D', width: 16, height: 16 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B' }}>#{idx + 1}</span>
                          <strong style={{ fontSize: 13.5, color: isChecked ? '#0F172A' : '#334155' }}>
                            {med.medicineName}
                          </strong>
                          {med.strength && (
                            <span
                              style={{
                                fontSize: 11.5,
                                color: '#1E293B',
                                background: '#E2E8F0',
                                padding: '1px 6px',
                                borderRadius: 4,
                                fontWeight: 600,
                              }}
                            >
                              {med.strength}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3 }}>
                          <strong>{med.dosage || 'Tablet'}</strong> · {med.frequency} · {med.duration} · {med.route}
                        </div>
                        {med.instructions && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#0F766E',
                              marginTop: 3,
                              fontStyle: 'italic',
                              background: '#F0FDFA',
                              padding: '2px 6px',
                              borderRadius: 4,
                              display: 'inline-block',
                            }}
                          >
                            {med.instructions}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: 8 }}>
                No standard medications defined for {activeDef?.region || 'this region'}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* LOWER SECTION: Current Prescription (X) Table Card */}
      <div
        style={{
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          background: '#FFFFFF',
          padding: '22px 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        }}
      >
        {/* Card Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 17, color: '#0F172A', fontWeight: 700 }}>
              Current Prescription{' '}
              <span style={{ color: '#2563EB', fontWeight: 700 }}>({consultation.prescription.length})</span>
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hasPrescriptionContent && (
              <Button size="small" variant="secondary" onClick={onPrint} icon={<Printer size={13} />}>
                Print Rx
              </Button>
            )}
            {consultation.prescription.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  background: '#FFFFFF',
                  color: '#EF4444',
                  border: '1px solid #FCA5A5',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <Trash2 size={13} color="#EF4444" /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Prescription Table */}
        {consultation.prescription.length > 0 ? (
          <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 740 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569', width: 44 }}>
                    #
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Medicine name
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Strength / Dosage
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Form
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Route
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Frequency
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Duration
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Instructions
                  </th>
                  <th
                    style={{
                      padding: '12px 14px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#475569',
                      textAlign: 'center',
                      width: 90,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {consultation.prescription.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx === consultation.prescription.length - 1 ? 'none' : '1px solid #F1F5F9',
                      background: editingId === item.id ? '#F0F9FA' : '#FFFFFF',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748B', fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13.5, color: '#0F172A', fontWeight: 700 }}>
                      {item.medicineName}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#334155' }}>
                      {item.strength || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                      {item.dosage || 'Tablet'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                      {item.route || 'Oral'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                      {item.frequency}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                      {item.duration}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#2563EB', fontWeight: 500 }}>
                      {item.instructions || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleEditMed(item)}
                          title="Edit medication"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#475569',
                            cursor: 'pointer',
                            padding: 5,
                            borderRadius: 4,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMed(item.id, item.medicineName)}
                          title="Delete medication"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#EF4444',
                            cursor: 'pointer',
                            padding: 5,
                            borderRadius: 4,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: '#F8FAFC',
              borderRadius: 10,
              border: '1px dashed #CBD5E1',
            }}
          >
            <Pill size={24} color="#94A3B8" style={{ marginBottom: 8 }} />
            <strong style={{ display: 'block', fontSize: 14, color: '#334155' }}>
              No medications added yet
            </strong>
            <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 4 }}>
              Choose Manual Entry, Upload Prescription, or Body Region Templates above to add medicines.
            </span>
          </div>
        )}
      </div>

      {/* Prescription Attachment Preview Modal */}
      <Modal
        open={Boolean(previewImage)}
        title={previewImage?.name ?? 'Prescription File Preview'}
        subtitle={
          previewImage
            ? `${(previewImage.size / 1024).toFixed(0)} KB · Uploaded ${dateLabel(
                previewImage.uploadedAt,
                'd MMM yyyy · h:mm a'
              )}`
            : undefined
        }
        onClose={() => setPreviewImage(null)}
        className="modal-fit-media"
      >
        {previewImage && (() => {
          const isPdf =
            previewImage.mimeType === 'application/pdf' ||
            previewImage.name.toLowerCase().endsWith('.pdf');
          const isImg =
            previewImage.mimeType?.startsWith('image/') ||
            isImageFile({ name: previewImage.name, type: previewImage.mimeType } as File);

          return (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {isPdf ? (
                <iframe
                  className="prescription-preview-pdf"
                  src={resolveDocumentUrl(previewImage)}
                  title={`Preview of ${previewImage.name}`}
                />
              ) : isImg ? (
                <img
                  className="prescription-preview-img"
                  src={resolveDocumentUrl(previewImage)}
                  alt={previewImage.name}
                />
              ) : (
                <div style={{ padding: '36px 24px', textAlign: 'center', background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <FileText size={48} color="var(--teal)" style={{ marginBottom: 12 }} />
                  <strong style={{ display: 'block', fontSize: 14, color: 'var(--navy)' }}>{previewImage.name}</strong>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>This document can be downloaded and opened with your local application.</p>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, width: '100%', marginTop: 4 }}>
                <a
                  href={resolveDocumentUrl(previewImage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewImage.name}
                  className="btn btn-secondary"
                >
                  <Download size={14} /> Download Original File
                </a>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Datalists for Autocomplete */}
      <datalist id="rx-common-medicines">
        {COMMON_MEDICINE_SUGGESTIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="rx-strengths">
        {STRENGTH_OPTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="rx-instructions">
        {QUICK_INSTRUCTION_CHIPS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
    </div>
  );
}
