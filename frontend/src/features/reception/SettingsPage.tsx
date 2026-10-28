import { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Check,
  Clock,
  Info,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { money } from '../../utils/format';
import { PageHeading } from '../../components/shared/Primitives';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';

export function SettingsPage() {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [skin, setSkin] = useState(String(state.fees.skin));
  const [ortho, setOrtho] = useState(String(state.fees.orthopaedics));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSkin(String(state.fees.skin));
    setOrtho(String(state.fees.orthopaedics));
  }, [state.fees]);

  const hasChanges =
    Number(skin) !== state.fees.skin || Number(ortho) !== state.fees.orthopaedics;

  const handleReset = () => {
    setSkin(String(state.fees.skin));
    setOrtho(String(state.fees.orthopaedics));
    toast.push('Reverted fee values to current configuration.', 'info');
  };

  const saveAll = async () => {
    const skinVal = Number(skin);
    const orthoVal = Number(ortho);

    if (!Number.isFinite(skinVal) || skinVal < 0 || !Number.isFinite(orthoVal) || orthoVal < 0) {
      toast.push('Enter a valid consultation fee of zero or greater.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      await repository.updateFee('skin', skinVal);
      await repository.updateFee('orthopaedics', orthoVal);
      toast.push('Consultation fees saved successfully.');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not save the fees.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Reception · Configuration"
        title="Settings"
        description="Manage consultation fees, department pricing, and operational settings."
      />

      <div className="settings-layout">
        {/* Left Column: Fee Editor */}
        <div className="stack" style={{ gap: '20px' }}>
          <Card>
            <SectionHeading
              title="Consultation fees"
              subtitle="Standard OPD outpatient charges automatically applied to new visits and invoices."
              action={<Badge tone="info">Live OPD Pricing</Badge>}
            />

            <div className="fee-editor">
              {/* Skin & Dermatology */}
              <div className="fee-row">
                <div className="fee-row-info">
                  <div className="fee-dept-title">
                    <Sparkles size={16} color="#0D9488" />
                    <strong>Skin & Dermatology</strong>
                    <Badge tone="info">Dr. Sangamitra</Badge>
                  </div>
                  <p>Standard outpatient clinical consultation charge per visit</p>
                  <span className="fee-current-tag">
                    Current active fee: <strong>{money(state.fees.skin)}</strong>
                  </span>
                </div>

                <div className="fee-input-group" title="Enter consultation fee in INR">
                  <span className="fee-currency-symbol">₹</span>
                  <input
                    id="fee-skin"
                    aria-label="Skin and Dermatology consultation fee"
                    type="number"
                    min="0"
                    step="50"
                    value={skin}
                    onChange={(event) => setSkin(event.target.value)}
                  />
                </div>
              </div>

              {/* Orthopaedics */}
              <div className="fee-row">
                <div className="fee-row-info">
                  <div className="fee-dept-title">
                    <Activity size={16} color="#2563EB" />
                    <strong>Orthopaedics & Joint Surgery</strong>
                    <Badge tone="neutral">Dr. Sundarprakash</Badge>
                  </div>
                  <p>Standard outpatient clinical consultation charge per visit</p>
                  <span className="fee-current-tag">
                    Current active fee: <strong>{money(state.fees.orthopaedics)}</strong>
                  </span>
                </div>

                <div className="fee-input-group" title="Enter consultation fee in INR">
                  <span className="fee-currency-symbol">₹</span>
                  <input
                    id="fee-ortho"
                    aria-label="Orthopaedics consultation fee"
                    type="number"
                    min="0"
                    step="50"
                    value={ortho}
                    onChange={(event) => setOrtho(event.target.value)}
                  />
                </div>
              </div>

              {/* Action row */}
              <div className="button-row" style={{ marginTop: '16px', alignItems: 'center' }}>
                <Button
                  onClick={saveAll}
                  disabled={isSaving || !hasChanges}
                  icon={<Save size={15} />}
                >
                  {isSaving ? 'Saving...' : 'Save both fees'}
                </Button>

                {hasChanges && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleReset}
                    icon={<RotateCcw size={14} />}
                  >
                    Reset
                  </Button>
                )}

                <span style={{ fontSize: '12px', marginLeft: 'auto' }}>
                  {hasChanges ? (
                    <span style={{ color: '#D97706', fontWeight: 600 }}>
                      ● Unsaved fee changes
                    </span>
                  ) : (
                    <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> Fees up to date ({money(state.fees.skin)} / {money(state.fees.orthopaedics)})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Clinic Information & Operational Policy */}
        <div className="stack" style={{ gap: '20px' }}>
          <Card>
            <SectionHeading
              title="Hospital profile"
              subtitle="Trichy Ortho & Skin Health Foundation"
              action={<Building2 size={16} color="#177E89" />}
            />

            <div className="settings-policy-list">
              <div className="settings-policy-item">
                <Clock size={16} />
                <div>
                  <strong style={{ color: 'var(--navy)', display: 'block' }}>OPD Consultation Hours</strong>
                  <span>Monday – Saturday: 8:30 AM – 8:30 PM (Sunday on-call)</span>
                </div>
              </div>

              <div className="settings-policy-item">
                <MapPin size={16} />
                <div>
                  <strong style={{ color: 'var(--navy)', display: 'block' }}>Hospital Campus</strong>
                  <span>Cantonment, Tiruchirappalli (Trichy), Tamil Nadu - 620001</span>
                </div>
              </div>

              <div className="settings-policy-item">
                <Phone size={16} />
                <div>
                  <strong style={{ color: 'var(--navy)', display: 'block' }}>Reception Desk Direct</strong>
                  <span>+91 431 241 4000 · contact@toshhealth.org</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeading
              title="Billing guidelines"
              subtitle="Automated pricing rules"
              action={<ShieldCheck size={16} color="#10B981" />}
            />

            <div className="settings-policy-list">
              <div className="settings-policy-item">
                <Info size={16} />
                <div>
                  <strong style={{ color: 'var(--navy)', display: 'block' }}>Automatic Invoice Bridge</strong>
                  <span>When a new queue token or appointment is created, the active fee above is assigned automatically.</span>
                </div>
              </div>

              <div className="settings-policy-item">
                <Info size={16} />
                <div>
                  <strong style={{ color: 'var(--navy)', display: 'block' }}>Clinical Add-ons</strong>
                  <span>Doctors can add procedural charges, injections, dressings, and diagnostics during clinical consultation.</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
