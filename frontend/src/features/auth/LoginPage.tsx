import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Globe, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PortalRole } from '../../types/domain';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../services/auth/AuthContext';
import { DATA_MODE } from '../../services/repositories/mode';
import { fetchDoctors, type DoctorRecord } from '../../services/doctors/doctorService';

interface RoleOption {
  id: PortalRole;
  label: string;
  emoji: string;
  path: string;
}

const roles: RoleOption[] = [
  {
    id: 'reception',
    label: 'Reception',
    emoji: '👩‍💼',
    path: '/reception/dashboard',
  },
  {
    id: 'skin',
    label: 'Skin',
    emoji: '🩺',
    path: '/skin/dashboard',
  },
  {
    id: 'orthopaedics',
    label: 'Ortho',
    emoji: '🦴',
    path: '/ortho/dashboard',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<PortalRole>('reception');
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const isMock = DATA_MODE === 'mock';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchDoctors().then((docs) => {
      setDoctors(docs);
      if (selectedRole !== 'reception') {
        const matching = docs.find((d) => d.department === selectedRole);
        if (matching?.email && !email) {
          setEmail(matching.email);
        }
      }
    }).catch(() => { });
  }, []);

  const doctorsForDepartment = doctors.filter((d) => d.department === selectedRole);

  const handleRoleSelect = (role: RoleOption) => {
    setSelectedRole(role.id);
    if (role.id === 'reception') {
      setEmail('');
    } else {
      const match = doctors.find((d) => d.department === role.id);
      setEmail(match?.email || '');
    }
  };

  const handleDoctorChange = (selectedEmail: string) => {
    setEmail(selectedEmail);
    const doc = doctors.find((d) => d.email === selectedEmail);
    if (doc) {
      setSelectedRole(doc.department as PortalRole);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.push('Please enter your staff email or user ID.', 'error');
      return;
    }
    if (!password.trim()) {
      toast.push('Please enter your password.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(email, password);
      toast.push(`Welcome! Signing in to ${user.displayName}…`);
      const targetPath =
        user.role === 'reception'
          ? '/reception/dashboard'
          : user.role === 'skin'
            ? '/skin/dashboard'
            : '/ortho/dashboard';
      navigate(targetPath);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Login failed. Please check credentials.';
      toast.push(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    toast.push('Please contact clinic administration or IT to reset your credentials.', 'info');
  };

  return (
    <div className="login-page">
      <main className="login-panel">
        <div className="login-content-wrap">
          <div className="login-top-bar">
            <button
              type="button"
              className="login-back-btn"
              onClick={() => navigate('/')}
              title="Return to hospital overview & services"
            >
              <ArrowLeft size={14} />
              <span>Hospital Landing Page</span>
            </button>
            <span className="login-portal-tag">Staff Portal</span>
          </div>

          <div
            className="login-brand login-brand-clickable"
            onClick={() => navigate('/')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/'); }}
            title="Go to Tosh Hospital Home Page"
          >
            <span className="brand-mark login-brand-mark">
              <img
                className="brand-logo login-brand-logo"
                src="/tosh-icon-circle.png"
                alt="Trichy Ortho & Skin Logo"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/images/image.png')) {
                    target.src = '/images/image.png';
                  }
                }}
              />
            </span>
            <div className="login-brand-text">
              <strong>TRICHY ORTHO & SKIN</strong>
              <span>HEALTH FOUNDATION</span>
            </div>
          </div>
          <div className="eyebrow login-eyebrow">Skin & Orthopaedics</div>
          <h1 className="login-heading">Care, clearly in motion.</h1>
          <p className="login-desc">A connected workspace for the people who welcome, assess and support every patient visit.</p>

          <div className="login-card">
            <div className="login-card-head">
              <div className="login-card-badge">
                <ShieldCheck size={13} />
                <span>Staff Authentication</span>
              </div>
              <h2 className="login-card-title">Sign in to your portal</h2>
              <p className="login-card-subtitle">Select your clinic role to access your assigned care workspace</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="login-role-selector">
                <label className="login-field-label">Department Role</label>
                <div className="role-pills-row" role="radiogroup" aria-label="Select staff role">
                  {roles.map((role) => {
                    const isSelected = selectedRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`role-pill-btn${isSelected ? ' active' : ''}`}
                        onClick={() => handleRoleSelect(role)}
                      >
                        <span className="role-pill-icon">{role.emoji}</span>
                        <span>{role.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedRole !== 'reception' && doctorsForDepartment.length > 0 && (
                <div className="login-field-group">
                  <label htmlFor="login-doctor-select" className="login-field-label">Assigned Clinician (from API)</label>
                  <div className="login-input-wrap">
                    <UserCheck size={17} className="login-input-icon" />
                    <select
                      id="login-doctor-select"
                      className="login-input-field"
                      value={email}
                      onChange={(e) => handleDoctorChange(e.target.value)}
                    >
                      {doctorsForDepartment.map((doc) => (
                        <option key={doc.id} value={doc.email || ''}>
                          {doc.displayName} ({doc.department === 'skin' ? 'Dermatology' : 'Orthopaedics'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="login-field-group">
                <label htmlFor="login-email" className="login-field-label">Staff Email / User ID</label>
                <div className="login-input-wrap">
                  <Mail size={17} className="login-input-icon" />
                  <input
                    id="login-email"
                    type="text"
                    className="login-input-field"
                    placeholder="Enter staff email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="login-field-group">
                <div className="login-password-header">
                  <label htmlFor="login-password" className="login-field-label">Password</label>
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={handleForgotPassword}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="login-input-wrap">
                  <Lock size={17} className="login-input-icon" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input-field"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
                <span>{isSubmitting ? 'Signing in...' : 'Sign In to Clinic Workspace'}</span>
                <ArrowRight size={17} />
              </button>
            </form>
          </div>

          <div className="login-landing-banner">
            <div className="login-landing-banner-info">
              <Globe size={16} className="login-landing-banner-icon" />
              <div>
                <strong>Patient or visitor?</strong>
                <span>Explore our clinical services, specialties & doctor profiles.</span>
              </div>
            </div>
            <button
              type="button"
              className="login-landing-banner-btn"
              onClick={() => navigate('/')}
              title="Locate Tosh Hospital Landing Page"
            >
              <span>Hospital Home</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <p className="login-footnote">
            {isMock
              ? 'Demonstration only · No real patient records, messages, payments, or clinical guidance are generated.'
              : 'Tosh Clinic HMS · Production API connection active.'}
          </p>
        </div>
      </main>
      <aside className="login-photo" aria-label="Clinic interior">
        <img
          src="/images/clinic-sidebar.jpeg"
          alt="Bright contemporary clinic waiting room"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
        <div className="login-photo-copy">
          <span>One shared care journey</span>
          <h2 className="login-hero-title">
            <span className="login-hero-line1">From first hello</span>
            <span className="login-hero-line2">to follow-up.</span>
          </h2>
          <p>Keep the details of every visit in view, with calm tools for the front desk and the clinical team.</p>
        </div>
      </aside>
    </div>
  );
}
