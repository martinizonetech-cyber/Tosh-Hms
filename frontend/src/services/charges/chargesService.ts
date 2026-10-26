export interface ClinicChargeItem {
  id: string;
  name: string;
  category: 'Injection' | 'Consumable' | 'Procedure' | 'Service' | 'Other';
  price: number;
  unit?: string;
  department?: 'skin' | 'orthopaedics' | 'all';
}

export const CHARGES_UPDATED_EVENT = 'tosh-clinic-charges-updated';
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
    try {
      const items = await requestJson<any[]>('/catalog/charges');
      if (Array.isArray(items)) {
        const mapped: ClinicChargeItem[] = items.map((c) => ({
          id: c.displayId || c.id,
          name: c.name,
          category: c.category,
          price: c.price,
          unit: c.unit,
          department: c.department,
        }));
        cachedApiCharges = mapped;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
          window.dispatchEvent(new CustomEvent(CHARGES_UPDATED_EVENT, { detail: mapped }));
        }
        return mapped;
      }
    } catch (err) {
      console.warn('Failed to fetch charges from API, using cached or fallback charges', err);
    }
  }
  return getClinicCharges();
}

export function getClinicCharges(): ClinicChargeItem[] {
  if (cachedApiCharges !== null) {
    return cachedApiCharges;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cachedApiCharges = parsed;
          return parsed;
        }
      }
    } catch {
      // Proceed to default fallback
    }
  }
  if (DATA_MODE === 'api') {
    return [];
  }
  return defaultCharges;
}

export async function saveClinicCharge(charge: ClinicChargeItem): Promise<void> {
  const current = getClinicCharges();
  const existingIndex = current.findIndex((c) => c.id === charge.id);
  let updated: ClinicChargeItem[];
  if (existingIndex >= 0) {
    updated = current.map((c) => (c.id === charge.id ? charge : c));
  } else {
    updated = [charge, ...current];
  }
  cachedApiCharges = updated;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CHARGES_UPDATED_EVENT, { detail: updated }));
  }

  if (DATA_MODE === 'api') {
    try {
      if (existingIndex >= 0) {
        await requestJson(`/catalog/charges/${encodeURIComponent(charge.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: charge.name,
            category: charge.category,
            price: charge.price,
            unit: charge.unit || '',
            department: charge.department || 'all',
          }),
        });
      } else {
        await requestJson('/catalog/charges', {
          method: 'POST',
          body: JSON.stringify({
            name: charge.name,
            category: charge.category,
            price: charge.price,
            unit: charge.unit || '',
            department: charge.department || 'all',
          }),
        });
      }
      await fetchClinicCharges();
    } catch (err) {
      console.warn('API sync for charge save failed (item preserved in local storage):', err);
      throw err;
    }
  }
}

export async function deleteClinicCharge(id: string): Promise<void> {
  const current = getClinicCharges();
  const updated = current.filter((c) => c.id !== id);
  cachedApiCharges = updated;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CHARGES_UPDATED_EVENT, { detail: updated }));
  }

  if (DATA_MODE === 'api') {
    try {
      await requestJson(`/catalog/charges/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await fetchClinicCharges();
    } catch (err) {
      console.warn('API sync for charge delete failed (item removed locally):', err);
      throw err;
    }
  }
}

export function resetClinicCharges(): ClinicChargeItem[] {
  cachedApiCharges = [...defaultCharges];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCharges));
    window.dispatchEvent(new CustomEvent(CHARGES_UPDATED_EVENT, { detail: defaultCharges }));
  }
  return defaultCharges;
}
