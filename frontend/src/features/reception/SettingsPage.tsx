import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { Department } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { money } from '../../utils/format';
import { PageHeading } from '../../components/shared/Primitives';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';

export function SettingsPage() {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [skin, setSkin] = useState(String(state.fees.skin));
  const [ortho, setOrtho] = useState(String(state.fees.orthopaedics));
  useEffect(() => { setSkin(String(state.fees.skin)); setOrtho(String(state.fees.orthopaedics)); }, [state.fees]);
  const saveFee = async (department: Department, value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) { toast.push('Enter a fee of zero or greater.', 'error'); return; }
    try {
      await repository.updateFee(department, amount);
      toast.push(`${department === 'skin' ? 'Skin' : 'Orthopaedics'} consultation fee saved.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not save the fee.', 'error');
    }
  };
  return <>
    <PageHeading eyebrow="Reception · Configuration" title="Settings" description="Manage consultation fees and operational settings." />
    <div className="settings-layout">
      <Card><SectionHeading title="Consultation fees" subtitle="These fees are used when new visits create invoices." action={<Settings2 size={17} color="#177E89" />} /><div className="fee-editor"><div className="fee-row"><div><strong>Skin / Dermatology</strong><span>Fee per visit</span></div><Field id="fee-skin" label="Fee in INR" type="number" min="0" value={skin} onChange={(event) => setSkin(event.target.value)} /></div><div className="fee-row"><div><strong>Orthopaedics</strong><span>Fee per visit</span></div><Field id="fee-ortho" label="Fee in INR" type="number" min="0" value={ortho} onChange={(event) => setOrtho(event.target.value)} /></div><div className="button-row"><Button onClick={() => { saveFee('skin', skin); saveFee('orthopaedics', ortho); }}>Save both fees</Button><span className="field-hint">Current: {money(state.fees.skin)} / {money(state.fees.orthopaedics)}</span></div></div></Card>
    </div>
  </>;
}
