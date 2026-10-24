/**
 * Helper to match a patient against a search term across name, ID, phone number, and email.
 * Normalizes digits so searches like "9876541021" will match "+91 98765 41021".
 */
export function matchesPatient(
  patient: { fullName: string; id: string; phone: string; email?: string | null },
  search: string,
): boolean {
  if (!search || !search.trim()) return true;
  const q = search.trim().toLowerCase();

  // 1. Full name match (e.g. 'Aarav', 'Mehta')
  if (patient.fullName.toLowerCase().includes(q)) return true;

  // 2. Patient ID match (e.g. 'PT-2041', '2041', 'pt-2041')
  if (patient.id.toLowerCase().includes(q)) return true;

  // 3. Email match
  if (patient.email && patient.email.toLowerCase().includes(q)) return true;

  // 4. Exact raw phone string match
  if (patient.phone.toLowerCase().includes(q)) return true;

  // 5. Normalized digits-only phone match (e.g. '9876541021' matches '+91 98765 41021')
  const qDigits = q.replace(/\D/g, '');
  if (qDigits.length >= 3) {
    const patientPhoneDigits = patient.phone.replace(/\D/g, '');
    if (patientPhoneDigits.includes(qDigits)) return true;
  }

  return false;
}
