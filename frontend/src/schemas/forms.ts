import { z } from 'zod';

export const patientSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the patient’s full name.').max(60, 'Name must be under 60 characters.'),
  dateOfBirth: z.string().min(1, 'Choose a date of birth.'),
  gender: z.enum(['Female', 'Male', 'Other', 'Prefer not to say']),
  phone: z.string().trim()
    .min(7, 'Enter a valid phone number (at least 7 digits).')
    .max(13, 'Phone number must be at most 13 digits.')
    .regex(/^\d+$/, 'Phone number must contain numbers only.'),
  email: z.union([z.string().email('Enter a valid email address.').max(80), z.literal('')]).optional(),
  address: z.string().trim().min(4, 'Enter the patient’s address.').max(150, 'Address must be under 150 characters.'),
  emergencyContact: z.string().max(60).optional(),
});

export const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Select a patient.'),
  department: z.enum(['skin', 'orthopaedics']),
  doctor: z.string().optional(),
  startsAt: z.string().min(1, 'Choose a date and time.'),
  visitType: z.enum(['New', 'Follow-up', 'Walk-in']),
  note: z.string().max(240, 'Keep the visit note under 240 characters.').optional(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter a payment amount greater than zero.'),
  method: z.enum(['Cash', 'UPI', 'GPay', 'PhonePe', 'Card', 'Other']),
  transactionReference: z.string().max(80).optional(),
});

export const prescriptionSchema = z.object({
  medicineName: z.string().trim().min(1, 'Enter the medicine name.'),
  strength: z.string().trim().min(1, 'Enter the strength/dosage (e.g. 1%, 500mg).'),
  dosage: z.string().trim().min(1, 'Enter or select the dosage form (e.g. Cream, Tablet).'),
  route: z.string().trim().min(1, 'Enter or select the route (e.g. Topical, Oral).'),
  frequency: z.string().trim().min(1, 'Enter or select the frequency (e.g. Twice daily).'),
  duration: z.string().trim().min(1, 'Enter or select the duration (e.g. 7 days).'),
  instructions: z.string().max(240).optional(),
});
