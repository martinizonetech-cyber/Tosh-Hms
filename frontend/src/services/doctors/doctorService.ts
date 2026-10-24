import { DATA_MODE } from '../repositories/mode';
import { requestJson } from '../api/httpClient';
import type { Department } from '../../types/domain';

export interface DoctorRecord {
  id: string;
  displayName: string;
  department: Department;
}

const DEFAULT_DOCTORS: DoctorRecord[] = [
  { id: 'doc-skin', displayName: 'Dr. Sangamitra', department: 'skin' },
  { id: 'doc-ortho', displayName: 'Dr. Sundarprakash', department: 'orthopaedics' },
];

let cachedDoctors: DoctorRecord[] | null = null;

export async function fetchDoctors(): Promise<DoctorRecord[]> {
  if (DATA_MODE === 'api') {
    try {
      const data = await requestJson<any[]>('/doctors');
      const mapped: DoctorRecord[] = data.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        department: d.department,
      }));
      cachedDoctors = mapped;
      return mapped;
    } catch {
      return DEFAULT_DOCTORS;
    }
  }
  return DEFAULT_DOCTORS;
}

export function getDoctorsByDepartment(dept: Department): string[] {
  const list = cachedDoctors || DEFAULT_DOCTORS;
  const filtered = list.filter((d) => d.department === dept).map((d) => d.displayName);
  return filtered.length > 0 ? filtered : [dept === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash'];
}
