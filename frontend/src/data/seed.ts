import type { Consultation, DemoState } from '../types/domain';

const at = (dayOffset: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const isoDay = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const vitals = {
  bloodPressure: '122/78 mmHg',
  pulse: '74 bpm',
  temperature: '36.8 °C',
  height: '168 cm',
  weight: '64 kg',
  oxygenSaturation: '98%',
};

const consultations: Consultation[] = [
  {
    id: 'VIS-8801', patientId: 'PT-2041', department: 'skin', visitedAt: at(-18, 10), vitals,
    symptoms: 'Intermittent dryness on both cheeks for three weeks.', medicalHistory: 'No significant history reported.',
    allergies: 'No known drug allergies.', examination: 'Mild erythema; skin intact.', assessment: 'Dryness with mild irritation.',
    diagnosis: 'Irritant contact dermatitis', treatmentPlan: 'Gentle skin-care routine; review in four weeks.',
    prescription: [{ id: 'RX-1', medicineName: 'Moisturizer (doctor-entered)', strength: '—', dosage: 'Apply a thin layer', route: 'Topical', frequency: 'As directed', duration: 'To be confirmed', instructions: 'Use only as directed by the clinician.' }],
    documents: [], procedures: [], followUpDate: isoDay(9), status: 'Finalized',
  },
  {
    id: 'VIS-8802', patientId: 'PT-2042', department: 'orthopaedics', visitedAt: at(-12, 11), vitals,
    symptoms: 'Right knee discomfort when using stairs.', medicalHistory: 'Occasional recreational walking.',
    allergies: 'No known allergies reported.', examination: 'Range of motion recorded for clinician review.', assessment: 'Symptoms require clinical assessment.',
    diagnosis: 'Pending clinician entry', treatmentPlan: 'Pending clinician entry.', prescription: [], documents: [], procedures: [],
    painLocation: 'Anterior right knee', side: 'Right', status: 'Finalized',
  },
  {
    id: 'VIS-8803', patientId: 'PT-2043', department: 'skin', visitedAt: at(-6, 9), vitals: { ...vitals, bloodPressure: '118/76 mmHg', pulse: '72 bpm' },
    symptoms: 'Occasional scalp itching; patient reports recent product change.', medicalHistory: 'No significant history reported.',
    allergies: 'Seasonal pollen sensitivity reported.', examination: 'No open lesions noted in demo record.', assessment: '', diagnosis: '', treatmentPlan: '',
    prescription: [], documents: [], procedures: [], status: 'Draft',
  },
  {
    id: 'VIS-8804', patientId: 'PT-2044', department: 'orthopaedics', visitedAt: at(-3, 14), vitals,
    symptoms: 'Left shoulder stiffness after activity.', medicalHistory: 'No significant history reported.', allergies: 'Not recorded.',
    examination: '', assessment: '', diagnosis: '', treatmentPlan: '', prescription: [], documents: [], procedures: [],
    painLocation: 'Left shoulder', side: 'Left', status: 'Draft',
  },
];

export const createSeedState = (): DemoState => ({
  fees: { skin: 700, orthopaedics: 900, currency: 'INR' },
  patients: [
    { id: 'PT-2041', fullName: 'Aarav Mehta', dateOfBirth: '1993-06-14', gender: 'Male', phone: '+91 98765 41021', email: 'aarav.mehta@example.test', address: '12 Lakeview Road, Pune', emergencyContact: '+91 98765 41022', departments: ['skin'], registeredAt: at(-42, 9), latestVisitAt: at(-18, 10) },
    { id: 'PT-2042', fullName: 'Mira Shah', dateOfBirth: '1987-11-03', gender: 'Female', phone: '+91 98220 34108', email: 'mira.shah@example.test', address: '8 Cedar Avenue, Pune', departments: ['orthopaedics'], registeredAt: at(-36, 11), latestVisitAt: at(-12, 11) },
    { id: 'PT-2043', fullName: 'Ishaan Rao', dateOfBirth: '2000-02-20', gender: 'Male', phone: '+91 97655 11870', address: '44 Park Street, Pune', departments: ['skin'], registeredAt: at(-23, 12), latestVisitAt: at(-6, 9) },
    { id: 'PT-2044', fullName: 'Ananya Iyer', dateOfBirth: '1979-09-08', gender: 'Female', phone: '+91 98901 77214', email: 'ananya.iyer@example.test', address: '29 Willow Lane, Pune', departments: ['orthopaedics'], registeredAt: at(-14, 15), latestVisitAt: at(-3, 14) },
    { id: 'PT-2045', fullName: 'Kabir Nair', dateOfBirth: '1996-03-25', gender: 'Male', phone: '+91 99701 62542', email: 'kabir.nair@example.test', address: '5 Riverside Walk, Pune', departments: ['skin', 'orthopaedics'], registeredAt: at(-9, 10), latestVisitAt: at(-2, 16) },
    { id: 'PT-2046', fullName: 'Leena Kapoor', dateOfBirth: '1968-12-17', gender: 'Female', phone: '+91 98190 56231', address: '19 Garden View, Pune', departments: ['orthopaedics'], registeredAt: at(-7, 13), latestVisitAt: at(-1, 10) },
    { id: 'PT-2047', fullName: 'Devika Menon', dateOfBirth: '1990-08-30', gender: 'Female', phone: '+91 99870 22615', email: 'devika.menon@example.test', address: '63 Hillcrest, Pune', departments: ['skin'], registeredAt: at(-4, 11) },
    { id: 'PT-2048', fullName: 'Rohan Desai', dateOfBirth: '1984-01-12', gender: 'Male', phone: '+91 98600 39941', address: '7 Orchard Road, Pune', departments: ['orthopaedics'], registeredAt: at(-2, 9) },
  ],
  appointments: [
    { id: 'APT-7201', patientId: 'PT-2041', department: 'skin', doctor: 'Dr. Sangamitra', startsAt: at(0, 9, 30), visitType: 'Follow-up', note: 'Review skin-care routine', status: 'Checked-in' },
    { id: 'APT-7202', patientId: 'PT-2042', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', startsAt: at(0, 10), visitType: 'Follow-up', note: 'Knee mobility review', status: 'Scheduled' },
    { id: 'APT-7203', patientId: 'PT-2043', department: 'skin', doctor: 'Dr. Sangamitra', startsAt: at(0, 10, 30), visitType: 'New', note: '', status: 'Scheduled' },
    { id: 'APT-7204', patientId: 'PT-2044', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', startsAt: at(0, 11), visitType: 'Follow-up', note: 'Shoulder symptoms', status: 'In progress' },
    { id: 'APT-7205', patientId: 'PT-2045', department: 'skin', doctor: 'Dr. Sangamitra', startsAt: at(0, 12), visitType: 'Walk-in', note: 'Itching; clinician review', status: 'Scheduled' },
    { id: 'APT-7206', patientId: 'PT-2046', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', startsAt: at(0, 12, 30), visitType: 'New', note: '', status: 'Scheduled' },
    { id: 'APT-7207', patientId: 'PT-2047', department: 'skin', doctor: 'Dr. Sangamitra', startsAt: at(0, 14), visitType: 'New', note: '', status: 'Scheduled' },
    { id: 'APT-7208', patientId: 'PT-2048', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', startsAt: at(0, 15), visitType: 'Follow-up', note: 'Review current symptoms', status: 'Scheduled' },
    { id: 'APT-7209', patientId: 'PT-2041', department: 'skin', doctor: 'Dr. Sangamitra', startsAt: at(2, 10), visitType: 'Follow-up', note: 'Future follow-up demo', status: 'Scheduled' },
  ],
  queue: [
    { id: 'Q-5101', visitId: 'VIS-8801', vitals, token: 'S-018', patientId: 'PT-2041', department: 'skin', doctor: 'Dr. Sangamitra', arrivalAt: at(0, 9, 12), status: 'Waiting', paymentStatus: 'Due', visitType: 'Follow-up', note: 'Review skin-care routine' },
    { id: 'Q-5102', visitId: 'VIS-8804', vitals, token: 'O-011', patientId: 'PT-2044', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', arrivalAt: at(0, 9, 25), status: 'Consulting', paymentStatus: 'Due', visitType: 'Follow-up', note: 'Shoulder symptoms' },
    { id: 'Q-5103', token: 'S-019', patientId: 'PT-2045', department: 'skin', doctor: 'Dr. Sangamitra', arrivalAt: at(0, 9, 41), status: 'Waiting', paymentStatus: 'Due', visitType: 'Walk-in', note: 'Itching; clinician review' },
  ],
  invoices: [
    { id: 'INV-3401', patientId: 'PT-2041', visitId: 'VIS-8801', department: 'skin', visitLabel: 'Skin consultation · APT-7201', date: at(0, 9, 30), consultationFee: 700, charges: [], payments: [] },
    { id: 'INV-3402', patientId: 'PT-2042', visitId: 'VIS-8802', department: 'orthopaedics', visitLabel: 'Orthopaedics follow-up · APT-7202', date: at(0, 10), consultationFee: 900, charges: [{ id: 'CH-10', description: 'Support assessment', amount: 350, addedBy: 'Dr. Sundarprakash', createdAt: at(0, 8) }], payments: [{ id: 'PAY-11', amount: 500, method: 'UPI', transactionReference: 'DEMO-UPI-4418', paidAt: at(0, 8, 10) }] },
    { id: 'INV-3403', patientId: 'PT-2044', visitId: 'VIS-8804', department: 'orthopaedics', visitLabel: 'Orthopaedics consultation · APT-7204', date: at(0, 11), consultationFee: 900, charges: [], payments: [] },
  ],
  consultations,
  followUps: [
    { id: 'FU-2101', patientId: 'PT-2041', department: 'skin', doctor: 'Dr. Sangamitra', date: isoDay(9), status: 'Upcoming', reminderStatus: 'Not sent', note: 'Review skin-care routine' },
    { id: 'FU-2102', patientId: 'PT-2042', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', date: isoDay(0), status: 'Upcoming', reminderStatus: 'Queued', note: 'Knee mobility review' },
    { id: 'FU-2103', patientId: 'PT-2045', department: 'skin', doctor: 'Dr. Sangamitra', date: isoDay(-2), status: 'Overdue', reminderStatus: 'Not sent', note: 'Follow-up pending' },
    { id: 'FU-2104', patientId: 'PT-2046', department: 'orthopaedics', doctor: 'Dr. Sundarprakash', date: isoDay(14), status: 'Upcoming', reminderStatus: 'Not sent', note: 'Review current symptoms' },
  ],
});
