import { DATA_MODE } from '../repositories/mode';
import { requestJson } from '../api/httpClient';
import type { Department } from '../../types/domain';

export interface DoctorRecord {
  id: string;
  displayName: string;
  department: Department;
  email?: string;
}

const DEFAULT_DOCTORS: DoctorRecord[] = [];

let cachedDoctors: DoctorRecord[] | null = null;

export async function fetchDoctors(): Promise<DoctorRecord[]> {
  if (DATA_MODE === 'api') {
    try {
      const data = await requestJson<any[]>('/doctors');
      const mapped: DoctorRecord[] = data.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        department: d.department,
        email: d.email,
      }));
      cachedDoctors = mapped;
      return mapped;
    } catch {
      return cachedDoctors || [];
    }
  }
  return DEFAULT_DOCTORS;
}

export function getDoctorsByDepartment(dept: Department): string[] {
  const list = cachedDoctors || DEFAULT_DOCTORS;
  const filtered = list.filter((d) => d.department === dept).map((d) => d.displayName);
  return filtered.length > 0 ? filtered : [dept === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash'];
}
