export interface ClinicChargeItem {
  id: string;
  name: string;
  category: 'Injection' | 'Consumable' | 'Procedure' | 'Service' | 'Other';
  price: number;
  unit?: string;
  department?: 'skin' | 'orthopaedics' | 'all';
}

const STORAGE_KEY = 'carehub_clinic_charges_master';

const defaultCharges: ClinicChargeItem[] = [
  // Injections
  { id: 'CHG-101', name: 'Triamcinolone (Kenacort) Steroid Injection', category: 'Injection', price: 850, unit: 'per dose', department: 'skin' },
  { id: 'CHG-102', name: 'Glutathione Skin Brightening Injection', category: 'Injection', price: 2500, unit: 'per session', department: 'skin' },
  { id: 'CHG-103', name: 'Botox Botulinum Toxin Injection', category: 'Injection', price: 4000, unit: 'per area', department: 'skin' },
  { id: 'CHG-104', name: 'Local Anaesthetic Lidocaine 2% Injection', category: 'Injection', price: 250, unit: 'per vial', department: 'all' },
  { id: 'CHG-105', name: 'Biotin / Hair Growth Peptide Injection', category: 'Injection', price: 1400, unit: 'per dose', department: 'skin' },

  // Consumables / Supplies
  { id: 'CHG-201', name: 'Sterile Cotton Roll / Cotton Pack', category: 'Consumable', price: 50, unit: 'pack', department: 'all' },
  { id: 'CHG-202', name: 'Sterile Gauze & Surgical Dressing Pack', category: 'Consumable', price: 120, unit: 'set', department: 'all' },
  { id: 'CHG-203', name: 'Disposable Syringe & 30G Needle Pack', category: 'Consumable', price: 60, unit: 'set of 2', department: 'all' },
  { id: 'CHG-204', name: 'Micropore Surgical Tape & Bandage', category: 'Consumable', price: 80, unit: 'roll', department: 'all' },
  { id: 'CHG-205', name: 'Betadine Antiseptic Cleansing Solution', category: 'Consumable', price: 100, unit: 'application', department: 'all' },
  { id: 'CHG-206', name: 'Biopsy Punch Disposable Tool (3mm / 4mm)', category: 'Consumable', price: 350, unit: 'per piece', department: 'skin' },
  { id: 'CHG-207', name: 'Surgical Latex Gloves & Disposable Drapes', category: 'Consumable', price: 90, unit: 'pair', department: 'all' },

  // Procedures
  { id: 'CHG-301', name: 'Chemical Peel (Salicylic / Glycolic Acid)', category: 'Procedure', price: 1800, unit: 'full face', department: 'skin' },
  { id: 'CHG-302', name: 'Comedone / Acne Extraction Session', category: 'Procedure', price: 850, unit: 'per session', department: 'skin' },
  { id: 'CHG-303', name: 'Electrocautery Wart / Skin Tag Removal', category: 'Procedure', price: 1500, unit: 'up to 5 lesions', department: 'skin' },
  { id: 'CHG-304', name: 'Cryotherapy (Liquid Nitrogen Spray)', category: 'Procedure', price: 1200, unit: 'per lesion area', department: 'skin' },
  { id: 'CHG-305', name: 'Skin Punch Biopsy Procedure', category: 'Procedure', price: 2200, unit: 'including specimen prep', department: 'skin' },
  { id: 'CHG-306', name: 'Dermabrasion / Hydrafacial Treatment', category: 'Procedure', price: 2800, unit: 'per sitting', department: 'skin' },
  { id: 'CHG-307', name: 'Laser Skin Rejuvenation / Pigment Reduction', category: 'Procedure', price: 3500, unit: 'per sitting', department: 'skin' },
];

import { DATA_MODE } from '../repositories/mode';
import { requestJson } from '../api/httpClient';

let cachedApiCharges: ClinicChargeItem[] | null = null;

export async function fetchClinicCharges(): Promise<ClinicChargeItem[]> {
  if (DATA_MODE === 'api') {
    const items = await requestJson<any[]>('/catalog/charges');
    const mapped: ClinicChargeItem[] = items.map((c) => ({
      id: c.displayId || c.id,
      name: c.name,
      category: c.category,
      price: c.price,
      unit: c.unit,
      department: c.department,
    }));
    cachedApiCharges = mapped;
    return mapped;
  }
  return getClinicCharges();
}

export function getClinicCharges(): ClinicChargeItem[] {
  if (DATA_MODE === 'api') {
    return cachedApiCharges || [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCharges));
      return defaultCharges;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCharges));
    return defaultCharges;
  } catch {
    return defaultCharges;
  }
}

export function saveClinicCharge(charge: ClinicChargeItem): void {
  if (DATA_MODE === 'api') {
    requestJson('/catalog/charges', {
      method: 'POST',
      body: JSON.stringify({
        name: charge.name,
        category: charge.category,
        price: charge.price,
        unit: charge.unit || '',
        department: charge.department || 'all',
      }),
    })
      .then(() => fetchClinicCharges())
      .catch((err) => console.error('Failed to save charge to catalog API', err));
    return;
  }
  const current = getClinicCharges();
  const existingIndex = current.findIndex((c) => c.id === charge.id);
  let updated: ClinicChargeItem[];
  if (existingIndex >= 0) {
    updated = current.map((c) => (c.id === charge.id ? charge : c));
  } else {
    updated = [charge, ...current];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteClinicCharge(id: string): void {
  if (DATA_MODE === 'api') {
    requestJson(`/catalog/charges/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(() => fetchClinicCharges())
      .catch((err) => console.error('Failed to delete charge from catalog API', err));
    return;
  }
  const current = getClinicCharges();
  const updated = current.filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function resetClinicCharges(): ClinicChargeItem[] {
  if (DATA_MODE === 'api') {
    return cachedApiCharges || [];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCharges));
  return defaultCharges;
}
