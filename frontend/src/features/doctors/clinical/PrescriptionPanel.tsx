import { useRef, useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  Bone,
  Camera,
  Check,
  CheckSquare,
  ClipboardList,
  Download,
  Edit2,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
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
import { dateLabel, downloadFile, fetchPdfBlobUrl, resolveDocumentUrl, resolveInlineDocumentUrl } from '../../../utils/format';

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

const COMMON_APPLICATION_AREAS = [
  'Face',
  'Forehead',
  'Cheeks',
  'Nose',
  'Around Eyes',
  'Neck',
  'Scalp',
  'Chest',
  'Upper Back',
  'Lower Back',
  'Shoulders',
  'Arms',
  'Elbows',
  'Wrists & Hands',
  'Abdomen',
  'Thighs',
  'Knees',
  'Legs',
  'Ankles & Feet',
  'Affected Area(s)',
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
  appliedAreas: [] as string[],
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
  const [customAreaInput, setCustomAreaInput] = useState('');
  const [showAreaSectionManual, setShowAreaSectionManual] = useState(false);

  const toggleArea = (area: string) => {
    setFormState((prev) => {
      const exists = prev.appliedAreas.includes(area);
      return {
        ...prev,
        appliedAreas: exists
          ? prev.appliedAreas.filter((a) => a !== area)
          : [...prev.appliedAreas, area],
      };
    });
  };

  const handleAddCustomArea = () => {
    const trimmed = customAreaInput.trim();
    if (!trimmed) return;
    setFormState((prev) => {
      if (prev.appliedAreas.includes(trimmed)) return prev;
      return {
        ...prev,
        appliedAreas: [...prev.appliedAreas, trimmed],
      };
    });
    setCustomAreaInput('');
  };

  const isCreamOrTopical =
    formState.dosage === 'Cream' ||
    formState.dosage === 'Ointment' ||
    formState.dosage === 'Gel' ||
    formState.dosage === 'Lotion' ||
    formState.dosage === 'Patch' ||
    formState.route === 'Topical' ||
    formState.medicineName.toLowerCase().includes('cream') ||
    formState.medicineName.toLowerCase().includes('gel') ||
    formState.medicineName.toLowerCase().includes('ointment') ||
    formState.medicineName.toLowerCase().includes('lotion') ||
    formState.appliedAreas.length > 0 ||
    showAreaSectionManual;

  // Upload state
  const [imageDragging, setImageDragging] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<PrescriptionImage | null>(null);
  const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // PDF Preview Blob generator to guarantee cross-browser inline rendering
  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;

    if (!previewImage) {
      setPdfPreviewBlobUrl(null);
      setPdfLoadError(null);
      setPdfLoading(false);
      return;
    }

    const isPdf =
      previewImage.mimeType === 'application/pdf' ||
      previewImage.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setPdfPreviewBlobUrl(null);
      setPdfLoadError(null);
      setPdfLoading(false);
      return;
    }

    setPdfLoading(true);
    setPdfLoadError(null);

    const preparePdfUrl = async () => {
      try {
        const url = await fetchPdfBlobUrl(previewImage);
        if (!active) {
          if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        if (url && url.startsWith('blob:')) {
          createdBlobUrl = url;
        }
        setPdfPreviewBlobUrl(url);
        setPdfLoading(false);
      } catch (err) {
        if (active) {
          const directUrl = resolveDocumentUrl(previewImage);
          setPdfPreviewBlobUrl(directUrl);
          setPdfLoadError(err instanceof Error ? err.message : 'Could not prepare inline PDF preview.');
          setPdfLoading(false);
        }
      }
    };

    preparePdfUrl();

    return () => {
      active = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [previewImage]);

  // Camera capture state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const prescriptionImages = consultation.prescriptionImages ?? [];
  const hasPrescriptionContent = consultation.prescription.length > 0 || prescriptionImages.length > 0;

  // Meditation
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
      .catch(() => { });

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
            appliedAreas: formState.appliedAreas,
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
        appliedAreas: formState.appliedAreas,
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
      appliedAreas: item.appliedAreas || [],
    });
    if (item.appliedAreas && item.appliedAreas.length > 0) {
      setShowAreaSectionManual(true);
    }
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
    setShowAreaSectionManual(false);
    setCustomAreaInput('');
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

  // Camera stream lifecycle
  useEffect(() => {
    if (!showCamera) {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        setCameraStream(null);
      }
      setCapturedPhotoUrl(null);
      setCapturedFile(null);
      setCameraError(null);
      return;
    }

    let active = true;
    setCameraError(null);

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera is not supported on this browser or requires HTTPS/localhost.');
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Unable to access camera device.';
        setCameraError(msg);
      }
    };

    startCamera();

    return () => {
      active = false;
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [showCamera, facingMode]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedPhotoUrl(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `Prescription_Camera_${timestamp}.jpg`, {
          type: 'image/jpeg',
        });
        setCapturedFile(file);
      }
    }, 'image/jpeg', 0.92);
  };

  const retakePhoto = () => {
    setCapturedPhotoUrl(null);
    setCapturedFile(null);
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => { });
    }
  };

  const uploadCapturedPhoto = async () => {
    if (!capturedFile) {
      toast.push('No photo captured to upload.', 'error');
      return;
    }
    const fileList = [capturedFile] as unknown as FileList;
    setShowCamera(false);
    await handleImageFiles(fileList);
  };

  const closeCameraModal = () => {
    setShowCamera(false);
  };

  const handleDownload = async (img: PrescriptionImage) => {
    const fileUrl = resolveDocumentUrl(img);
    if (!fileUrl) {
      toast.push('No file URL available to download.', 'error');
      return;
    }
    try {
      await downloadFile(fileUrl, img.name);
      toast.push(`Downloaded ${img.name}`, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not download file.', 'error');
    }
  };

  const removeImage = async (id: string, name: string) => {
    if (!window.confirm(`Remove prescription file "${name}"?`)) return;
    try {
      if (DATA_MODE === 'api' && repository.deleteDocument && !id.startsWith('RX-FILE-')) {
        try {
          await repository.deleteDocument(id);
        } catch (apiErr) {
          console.warn('Backend delete document notice:', apiErr);
        }
      }
      onChange({ prescriptionImages: prescriptionImages.filter((img) => img.id !== id) });
      toast.push('Prescription file removed.');
    } catch (error) {
      onChange({ prescriptionImages: prescriptionImages.filter((img) => img.id !== id) });
      toast.push('Prescription file removed.');
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

        {/* Card 3: Meditation */}
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
              Meditation
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
              {/* Row 1: Medicine name, Strength / dosage, Dosage form (3 equal columns) */}
              <div className="rx-form-grid-3">
                {/* Medicine Name */}
                <div>
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
                        zIndex: 1,
                      }}
                    />
                    <input
                      id="rx-input-med-name"
                      type="text"
                      className="control rx-med-search-input"
                      value={formState.medicineName}
                      onChange={(e) => setFormState({ ...formState, medicineName: e.target.value })}
                      placeholder="Search medicine (e.g. Paracetamol)"
                      list="rx-common-medicines"
                      style={{
                        height: 42,
                        paddingLeft: 38,
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
                    onChange={(e) => {
                      const newDosage = e.target.value;
                      const isCreamLike = ['Cream', 'Ointment', 'Gel', 'Lotion', 'Patch'].includes(newDosage);
                      setFormState({
                        ...formState,
                        dosage: newDosage,
                        route: isCreamLike && formState.route === 'Oral' ? 'Topical' : formState.route,
                      });
                    }}
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
              </div>

              {/* Row 2: Route, Frequency, Duration (3 equal columns) */}
              <div className="rx-form-grid-3">
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
              </div>

              {/* Area to be applied (For Creams / Ointments / Gels / Topical preparations) */}
              {isCreamOrTopical ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '14px 16px',
                    background: '#F8FAFC',
                    border: '1.5px solid #0D9488',
                    borderRadius: 10,
                    boxShadow: '0 1px 3px rgba(13, 148, 136, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Area to be applied
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#047857', background: '#DCFCE7', border: '1px solid #86EFAC', padding: '1px 8px', borderRadius: 999 }}>
                        Select multiple
                      </span>
                    </label>
                    {formState.appliedAreas.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, appliedAreas: [] })}
                        style={{ fontSize: 11.5, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                      >
                        Clear all ({formState.appliedAreas.length})
                      </button>
                    )}
                  </div>

                  {/* Selected tags */}
                  {formState.appliedAreas.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '8px 10px', background: '#FFFFFF', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                      {formState.appliedAreas.map((area) => (
                        <span
                          key={area}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            background: '#DCFCE7',
                            border: '1px solid #86EFAC',
                            color: '#14532D',
                            fontSize: 12.5,
                            fontWeight: 600,
                            borderRadius: 999,
                          }}
                        >
                          <span>{area}</span>
                          <button
                            type="button"
                            onClick={() => toggleArea(area)}
                            style={{
                              border: 'none',
                              background: '#86EFAC',
                              color: '#14532D',
                              borderRadius: '50%',
                              width: 16,
                              height: 16,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title={`Remove ${area}`}
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 10 }}>
                      No application areas selected yet. Click any popular area below or type a custom area.
                    </div>
                  )}

                  {/* Custom area text input */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      className="control"
                      value={customAreaInput}
                      onChange={(e) => setCustomAreaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomArea();
                        }
                      }}
                      placeholder="Type any specific area (e.g. Left cheek, Lower back, Full face...) & press Add or Enter"
                      style={{ height: 38, fontSize: 13, flex: 1, borderRadius: 6, border: '1px solid #CBD5E1', padding: '0 12px' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomArea}
                      disabled={!customAreaInput.trim()}
                      style={{
                        height: 38,
                        padding: '0 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        borderRadius: 6,
                        background: customAreaInput.trim() ? '#0D9488' : '#94A3B8',
                        color: '#FFFFFF',
                        border: 'none',
                        cursor: customAreaInput.trim() ? 'pointer' : 'not-allowed',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Plus size={14} /> Add area
                    </button>
                  </div>

                  {/* Quick select chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', alignSelf: 'center', marginRight: 4 }}>
                      Popular areas:
                    </span>
                    {COMMON_APPLICATION_AREAS.map((area) => {
                      const isSelected = formState.appliedAreas.includes(area);
                      return (
                        <button
                          type="button"
                          key={area}
                          onClick={() => toggleArea(area)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 16,
                            fontSize: 12,
                            fontWeight: isSelected ? 600 : 500,
                            border: isSelected ? '1.5px solid #059669' : '1px solid #CBD5E1',
                            background: isSelected ? '#ECFDF5' : '#FFFFFF',
                            color: isSelected ? '#047857' : '#334155',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{area}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowAreaSectionManual(true)}
                    style={{
                      background: '#F0FDF4',
                      border: '1px dashed #059669',
                      color: '#047857',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>📍</span> + Specify Area to be applied (for Creams / Topicals)
                  </button>
                </div>
              )}

              {/* Row 3: Instructions (full width across all columns) */}
              <div style={{ marginBottom: 12 }}>
                <label
                  htmlFor="rx-input-instructions"
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: 6 }}
                >
                  Instructions <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>(optional)</span>
                </label>
                <input
                  id="rx-input-instructions"
                  type="text"
                  className="control"
                  value={formState.instructions}
                  onChange={(e) => setFormState({ ...formState, instructions: e.target.value })}
                  placeholder="e.g. 1 tablet after meals, with plenty of water"
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

              {/* Row 4: Quick Instruction Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B', marginRight: 4 }}>
                  Quick select:
                </span>
                {QUICK_INSTRUCTION_CHIPS.map((chip) => (
                  <button
                    type="button"
                    key={chip}
                    onClick={() => setFormState({ ...formState, instructions: chip })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: formState.instructions === chip ? '1.5px solid #13808D' : '1px solid #E2E8F0',
                      background: formState.instructions === chip ? '#F0F9FA' : '#FFFFFF',
                      color: formState.instructions === chip ? '#13808D' : '#334155',
                      fontSize: 12.5,
                      fontWeight: formState.instructions === chip ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Row 5: Action Button & Status */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 14,
                  borderTop: '1px solid #F1F5F9',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="submit"
                    style={{
                      background: '#0E1E38',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: '11px 24px',
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

                  {editingId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      style={{
                        background: '#FFFFFF',
                        color: '#64748B',
                        border: '1px solid #CBD5E1',
                        borderRadius: 8,
                        padding: '11px 18px',
                        fontSize: 13.5,
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <X size={14} /> Cancel editing
                    </button>
                  )}
                </div>

                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  <span style={{ color: '#EF4444' }}>*</span> Required clinical fields
                </span>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 2: UPLOAD PRESCRIPTION */}
        {activeMode === 'upload' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UploadCloud size={19} />
                </div>
                <div>
                  <strong style={{ fontSize: 15.5, color: '#0F172A', display: 'block', fontWeight: 700 }}>
                    Upload Prescription
                  </strong>
                  <span style={{ fontSize: 12.5, color: '#64748B', display: 'block', marginTop: 1 }}>
                    Upload photos, scans, or PDF documents of physical prescription sheets.
                  </span>
                </div>
              </div>
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
            <input
              ref={cameraInputRef}
              className="sr-only"
              id="prescription-camera-fallback"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleImageFiles(e.target.files)}
            />

            <div
              className={`upload-drop${imageDragging ? ' dragging' : ''}`}
              style={{
                cursor: 'pointer',
                border: imageDragging ? '2px dashed #13808D' : '1.5px dashed #CBD5E1',
                background: imageDragging ? '#F0F9FA' : '#FAFCFC',
                padding: '12px 18px',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 14,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#E2F1F0',
                    color: '#13808D',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UploadCloud size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>
                    {uploadingImage
                      ? 'Reading prescription attachment…'
                      : 'Choose prescription file (PDF or image) or drag & drop here'}
                  </strong>
                  <span style={{ fontSize: 11.5, color: '#64748B', display: 'block', marginTop: 1 }}>
                    Supports JPG, PNG, WebP, SVG, AVIF, and PDF · Multiple files supported
                  </span>
                </div>
              </div>

              <div
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => setShowCamera(true)}
                  icon={<Camera size={13} />}
                  disabled={uploadingImage}
                  style={{ background: '#13808D', borderColor: '#13808D', fontSize: 12, padding: '6px 13px' }}
                >
                  Capture with Camera
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Plus size={13} />}
                  disabled={uploadingImage}
                  style={{ fontSize: 12, padding: '6px 13px' }}
                >
                  Browse files
                </Button>
              </div>
            </div>

            {/* Uploaded Files Grid */}
            {prescriptionImages.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: 12,
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
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: 95,
                          background: '#F8FAFC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          position: 'relative',
                          borderBottom: '1px solid #F1F5F9',
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
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#DC2626' }}>
                            <FileText size={28} />
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0F172A' }}>PDF Document</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#13808D' }}>
                            <FileText size={28} />
                            <span style={{ fontSize: 10.5, fontWeight: 600 }}>File</span>
                          </div>
                        )}

                        {/* Quick Delete hover button */}
                        <div style={{ position: 'absolute', top: 5, right: 5 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(img.id, img.name);
                            }}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'rgba(255, 255, 255, 0.95)',
                              border: '1px solid rgba(226, 232, 240, 0.9)',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#DC2626',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }}
                            title="Delete file"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      <div style={{ padding: '9px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <strong
                            style={{
                              fontSize: 12,
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

                        {/* Perfectly Aligned Button Row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            marginTop: 'auto',
                            paddingTop: 10,
                            borderTop: '1px solid #F1F5F9',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setPreviewImage(img)}
                              icon={<Eye size={13} />}
                              style={{ padding: '4px 10px', fontSize: 11.5, height: 28 }}
                            >
                              Preview
                            </Button>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => handleDownload(img)}
                              icon={<Download size={13} />}
                              style={{ padding: '4px 10px', fontSize: 11.5, height: 28 }}
                              title="Download file directly"
                            >
                              Download
                            </Button>
                          </div>

                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => removeImage(img.id, img.name)}
                            icon={<Trash2 size={13} />}
                            style={{
                              padding: '4px 10px',
                              fontSize: 11.5,
                              height: 28,
                              color: '#DC2626',
                              background: '#FEF2F2',
                              border: '1px solid #FECACA',
                              borderRadius: 6,
                            }}
                            title="Delete prescription file"
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
                    Meditation Tablets ({activeDef?.region || 'Knee'})
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
                      <div>{item.medicineName}</div>
                      {item.appliedAreas && item.appliedAreas.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#047857',
                              background: '#D1FAE5',
                              border: '1px solid #A7F3D0',
                              borderRadius: 4,
                              padding: '1px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            📍 Area: {item.appliedAreas.join(', ')}
                          </span>
                        </div>
                      )}
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
              Choose Manual Entry, Upload Prescription, or Meditation above to add medicines.
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
                pdfLoading ? (
                  <div
                    style={{
                      width: 'min(900px, 90vw)',
                      height: '60vh',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#F8FAFC',
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      gap: 12,
                    }}
                  >
                    <RefreshCw size={28} style={{ color: '#13808D', animation: 'spinner 1s linear infinite' }} />
                    <span style={{ fontSize: 13.5, color: '#475569', fontWeight: 500 }}>
                      Loading PDF preview…
                    </span>
                  </div>
                ) : (
                  <>
                    {pdfLoadError && (
                      <div
                        style={{
                          width: 'min(900px, 90vw)',
                          padding: '10px 14px',
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: 8,
                          color: '#991B1B',
                          fontSize: 12.5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <AlertCircle size={16} style={{ flexShrink: 0, color: '#DC2626' }} />
                        <span>Could not prepare inline preview directly ({pdfLoadError}). Falling back to direct URL.</span>
                      </div>
                    )}
                    <object
                      data={pdfPreviewBlobUrl || resolveInlineDocumentUrl(previewImage)}
                      type="application/pdf"
                      className="prescription-preview-pdf"
                      style={{
                        width: 'min(900px, 90vw)',
                        height: '75vh',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                      }}
                    >
                      <iframe
                        src={pdfPreviewBlobUrl || resolveInlineDocumentUrl(previewImage)}
                        className="prescription-preview-pdf"
                        title={`Preview of ${previewImage.name}`}
                        style={{ width: '100%', height: '100%', border: 'none', background: '#FFFFFF' }}
                      >
                        <div style={{ padding: 32, textAlign: 'center', background: '#F8FAFC', borderRadius: 8 }}>
                          <FileText size={42} color="#DC2626" style={{ marginBottom: 10 }} />
                          <strong style={{ display: 'block', fontSize: 14 }}>Inline PDF Viewer Not Available</strong>
                          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, marginBottom: 14 }}>
                            Your browser does not support embedding this PDF inline. You can open or download the PDF file directly.
                          </p>
                          <Button variant="primary" onClick={() => handleDownload(previewImage)} icon={<Download size={14} />}>
                            Download PDF
                          </Button>
                        </div>
                      </iframe>
                    </object>
                  </>
                )
              ) : isImg ? (
                <img
                  className="prescription-preview-img"
                  src={resolveDocumentUrl(previewImage)}
                  alt={previewImage.name}
                  style={{ maxHeight: '75vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 8 }}
                />
              ) : (
                <div style={{ padding: '36px 24px', textAlign: 'center', background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <FileText size={48} color="var(--teal)" style={{ marginBottom: 12 }} />
                  <strong style={{ display: 'block', fontSize: 14, color: 'var(--navy)' }}>{previewImage.name}</strong>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>This document can be downloaded and opened with your local application.</p>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, width: '100%', marginTop: 8 }}>
                {isPdf && (pdfPreviewBlobUrl || resolveInlineDocumentUrl(previewImage)) && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      const target = pdfPreviewBlobUrl || resolveInlineDocumentUrl(previewImage);
                      window.open(target, '_blank', 'noopener,noreferrer');
                    }}
                    icon={<ExternalLink size={14} />}
                    style={{ background: '#13808D', borderColor: '#13808D' }}
                  >
                    Open in New Tab
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => handleDownload(previewImage)}
                  icon={<Download size={15} />}
                >
                  Download Original File
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    removeImage(previewImage.id, previewImage.name);
                    setPreviewImage(null);
                  }}
                  icon={<Trash2 size={15} />}
                  style={{ color: '#DC2626' }}
                >
                  Delete File
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPreviewImage(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* CAMERA CAPTURE MODAL */}
      <Modal
        open={showCamera}
        onClose={closeCameraModal}
        title="Capture Prescription with Camera"
        subtitle="Align physical prescription sheet within the viewfinder and capture a clear photo."
        className="modal-fit-media"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {cameraError ? (
            <div
              style={{
                padding: '24px 20px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 12,
                color: '#991B1B',
                textAlign: 'center',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <AlertCircle size={32} />
              <div>
                <strong style={{ fontSize: 15, display: 'block' }}>Camera Access Error</strong>
                <p style={{ fontSize: 13, marginTop: 4, color: '#B91C1C' }}>{cameraError}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => cameraInputRef.current?.click()}
                  icon={<Camera size={14} />}
                >
                  Open Device Camera via File App
                </Button>
                <Button variant="secondary" size="small" onClick={closeCameraModal}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Viewfinder / Captured Preview Box */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 640,
                  aspectRatio: '4/3',
                  background: '#0F172A',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                }}
              >
                {!capturedPhotoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    {/* Viewfinder framing guide */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 20,
                        border: '2px dashed rgba(255, 255, 255, 0.65)',
                        borderRadius: 8,
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.25)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        paddingBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          background: 'rgba(15, 23, 42, 0.75)',
                          color: '#FFFFFF',
                          fontSize: 12,
                          padding: '4px 10px',
                          borderRadius: 20,
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        Position prescription within frame
                      </span>
                    </div>

                    {/* Switch camera button */}
                    <button
                      type="button"
                      onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#FFFFFF',
                        borderRadius: '50%',
                        width: 36,
                        height: 36,
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                      title="Switch Camera (Front / Back)"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </>
                ) : (
                  <img
                    src={capturedPhotoUrl}
                    alt="Captured Prescription"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      background: '#1E293B',
                    }}
                  />
                )}
                {/* Hidden canvas used for frame capture */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              {/* Action Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%' }}>
                {!capturedPhotoUrl ? (
                  <>
                    <Button
                      variant="primary"
                      onClick={capturePhoto}
                      icon={<Camera size={18} />}
                      style={{
                        padding: '10px 24px',
                        fontSize: 14,
                        fontWeight: 600,
                        background: '#13808D',
                        borderColor: '#13808D',
                      }}
                    >
                      Capture Photo
                    </Button>
                    <Button variant="secondary" onClick={closeCameraModal}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={retakePhoto}
                      icon={<RotateCcw size={15} />}
                      style={{ padding: '8px 18px', fontSize: 13 }}
                    >
                      Retake
                    </Button>
                    <Button
                      variant="primary"
                      onClick={uploadCapturedPhoto}
                      icon={<Check size={16} />}
                      style={{
                        padding: '8px 22px',
                        fontSize: 13,
                        fontWeight: 600,
                        background: '#16A34A',
                        borderColor: '#16A34A',
                      }}
                    >
                      Use Photo & Upload
                    </Button>
                    <Button variant="ghost" onClick={closeCameraModal}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
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
