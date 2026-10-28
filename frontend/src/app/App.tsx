import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import LandingPage from '../features/landing/LandingPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ReceptionDashboard } from '../features/reception/ReceptionDashboard';
import { QueuePage } from '../features/reception/QueuePage';
import { AppointmentsPage } from '../features/reception/AppointmentsPage';
import { PatientDirectoryPage } from '../features/reception/PatientDirectoryPage';
import { BillingPage } from '../features/reception/BillingPage';
import { FollowUpsPage } from '../features/reception/FollowUpsPage';
import { ReportsPage } from '../features/reception/ReportsPage';
import { SettingsPage } from '../features/reception/SettingsPage';
import { DoctorDashboard } from '../features/doctors/DoctorDashboard';
import { DoctorAppointmentsPage } from '../features/doctors/DoctorAppointmentsPage';
import { DoctorPatientsPage } from '../features/doctors/DoctorPatientsPage';
import { ClinicalWorkspace } from '../features/doctors/ClinicalWorkspace';
import { BodyRegionTemplatesPage } from '../features/doctors/BodyRegionTemplatesPage';
import { DoctorPrescriptionsPage, DoctorTreatmentsPage, DoctorHistoryPage } from '../features/doctors/DoctorRecordPages';
import { DoctorChargesPage } from '../features/doctors/DoctorChargesPage';
import { DoctorReportsPage } from '../features/doctors/DoctorReportsPage';

export function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<LandingPage onLogin={() => navigate('/login')} />} />
      <Route path="/landing" element={<LandingPage onLogin={() => navigate('/login')} />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reception" element={<AppShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ReceptionDashboard />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="patients" element={<PatientDirectoryPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/skin" element={<AppShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DoctorDashboard department="skin" />} />
        <Route path="appointments" element={<DoctorAppointmentsPage department="skin" />} />
        <Route path="patients" element={<DoctorPatientsPage department="skin" />} />
        <Route path="consultation" element={<ClinicalWorkspace department="skin" />} />
        <Route path="consultation/:patientId" element={<ClinicalWorkspace department="skin" />} />
        <Route path="charges" element={<DoctorChargesPage department="skin" />} />
        <Route path="prescriptions" element={<DoctorPrescriptionsPage department="skin" />} />
        <Route path="treatments" element={<DoctorTreatmentsPage department="skin" />} />
        <Route path="follow-ups" element={<FollowUpsPage department="skin" />} />
        <Route path="reports" element={<DoctorReportsPage department="skin" />} />
        <Route path="history" element={<DoctorHistoryPage department="skin" />} />
      </Route>
      <Route path="/ortho" element={<AppShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DoctorDashboard department="orthopaedics" />} />
        <Route path="appointments" element={<DoctorAppointmentsPage department="orthopaedics" />} />
        <Route path="patients" element={<DoctorPatientsPage department="orthopaedics" />} />
        <Route path="consultation" element={<ClinicalWorkspace department="orthopaedics" />} />
        <Route path="consultation/:patientId" element={<ClinicalWorkspace department="orthopaedics" />} />
        <Route path="templates" element={<BodyRegionTemplatesPage />} />
        <Route path="charges" element={<DoctorChargesPage department="orthopaedics" />} />
        <Route path="prescriptions" element={<DoctorPrescriptionsPage department="orthopaedics" />} />
        <Route path="treatments" element={<DoctorTreatmentsPage department="orthopaedics" />} />
        <Route path="follow-ups" element={<FollowUpsPage department="orthopaedics" />} />
        <Route path="reports" element={<DoctorReportsPage department="orthopaedics" />} />
        <Route path="history" element={<DoctorHistoryPage department="orthopaedics" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
