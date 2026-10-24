import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Plus, Tag, Trash2, X } from 'lucide-react';
import type { Consultation, Department } from '../../../types/domain';
import { useHospitalData } from '../../../services/mock/DemoProvider';
import { useToast } from '../../../components/ui/Toast';
import { money, dateLabel } from '../../../utils/format';
import { Button } from '../../../components/ui/Button';
import { Card, SectionHeading } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Badge } from '../../../components/ui/Badge';
import type { ClinicChargeItem } from '../../../services/charges/chargesService';
import { getClinicCharges } from '../../../services/charges/chargesService';

export function ProceduresPanel({
  patientId,
  department,
  consultation,
  onChange,
}: {
  patientId: string;
  department: Department;
  consultation: Consultation;
  onChange: (patch: Partial<Consultation>) => void;
}) {
  const { repository } = useHospitalData();
  const toast = useToast();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [catalogCharges, setCatalogCharges] = useState<ClinicChargeItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load charges master catalog
  useEffect(() => {
    setCatalogCharges(getClinicCharges());
  }, []);

  // Filter charges based on description typed
  const matchingCharges = useMemo(() => {
    const q = description.trim().toLowerCase();
    if (!q) return [];
    return catalogCharges
      .filter((c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      .slice(0, 6);
  }, [description, catalogCharges]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const selectCharge = (item: ClinicChargeItem) => {
    setDescription(item.name);
    setAmount(String(item.price));
    setSuggestionsOpen(false);
  };

  const add = () => {
    const value = Number(amount);
    if (description.trim().length < 2) {
      toast.push('Enter a service or procedure description.', 'error');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.push('Enter an amount greater than zero.', 'error');
      return;
    }
    try {
      const doctorName = department === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash';
      repository.addServiceCharge(patientId, department, description.trim(), value, doctorName, consultation.id);
      const item = {
        id: `CH-${Date.now()}`,
        description: description.trim(),
        amount: value,
        addedBy: doctorName,
        createdAt: new Date().toISOString(),
      };
      onChange({ procedures: [...consultation.procedures, item] });
      setDescription('');
      setAmount('');
      setSuggestionsOpen(false);
      toast.push(`Added charge "${item.description}" (${money(value)}).`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not add the charge.', 'error');
    }
  };

  const removeProcedure = (id: string, desc: string) => {
    if (!window.confirm(`Remove procedure charge "${desc}"?`)) return;
    onChange({ procedures: consultation.procedures.filter((p) => p.id !== id) });
    toast.push('Procedure charge removed.');
  };

  const totalAmount = useMemo(() => {
    return consultation.procedures.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [consultation.procedures]);

  return (
    <div className="stack">
      <Card>
        <SectionHeading
          title="Treatments & Procedures"
          subtitle="Add procedures, injections, or clinic consumables. Type to auto-fill from Charges Master or enter custom amount."
          action={<Activity size={18} color="#177E89" />}
        />

        {/* Quick select buttons from catalog */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Tag size={13} color="var(--teal)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>Quick select common items:</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {catalogCharges.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className="btn btn-secondary btn-small"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => selectCharge(item)}
              >
                {item.name.split('(')[0].trim()} · {money(item.price)}
              </button>
            ))}
          </div>
        </div>

        {/* Input form with autocomplete */}
        <div className="form-grid" style={{ position: 'relative' }} ref={dropdownRef}>
          <div className="field" style={{ position: 'relative' }}>
            <label htmlFor="procedure-description">Service or Item Description *</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="procedure-description"
                className="control"
                placeholder="Type 'injection', 'cotton', 'peel', or any item..."
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (description.trim().length > 0) setSuggestionsOpen(true);
                }}
              />
              {description && (
                <button
                  type="button"
                  style={{ position: 'absolute', right: 10, background: 'transparent', border: 0, cursor: 'pointer', color: '#94A3B8' }}
                  onClick={() => setDescription('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Suggestions dropdown */}
            {suggestionsOpen && matchingCharges.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: '#ffffff',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(17,39,58,0.12)',
                  marginTop: 4,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '6px 10px', background: '#F8FAFC', fontSize: 11, fontWeight: 700, color: 'var(--teal)', borderBottom: '1px solid var(--line)' }}>
                  Suggested from Charges Master (Click to autofill price):
                </div>
                {matchingCharges.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: 0,
                      borderBottom: '1px solid #F1F5F9',
                      background: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F0FDF4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => selectCharge(item)}
                  >
                    <div>
                      <strong style={{ color: 'var(--navy)', display: 'block' }}>{item.name}</strong>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.category} {item.unit ? `· ${item.unit}` : ''}</span>
                    </div>
                    <strong style={{ color: 'var(--teal)', fontSize: 13, marginLeft: 10 }}>{money(item.price)}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="procedure-amount">Amount (INR ₹) *</label>
            <input
              id="procedure-amount"
              type="number"
              min="1"
              step="1"
              className="control"
              placeholder="0 (autofilled or enter custom price)"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>

        <div className="button-row" style={{ marginTop: 14 }}>
          <Button onClick={add} icon={<Plus size={14} />}>
            Add charge to visit
          </Button>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
            Supports auto-filled catalog price and manual custom price
          </span>
        </div>
      </Card>

      {/* Added Visit Charges List with S.No & Total Amount */}
      <Card>
        <SectionHeading
          title="Visit charges"
          subtitle="Procedures, consumables and services added to this consultation."
          action={<Badge tone="info">{consultation.procedures.length} items</Badge>}
        />

        {consultation.procedures.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>S.No</th>
                    <th>Procedure / Service</th>
                    <th>Added By</th>
                    <th>Date & Time</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {consultation.procedures.map((item, index) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>{index + 1}</td>
                      <td>
                        <strong style={{ fontSize: 13 }}>{item.description}</strong>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{item.addedBy}</td>
                      <td style={{ color: 'var(--muted)' }}>{dateLabel(item.createdAt, 'd MMM yyyy · h:mm a')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                        {money(item.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => removeProcedure(item.id, item.description)}
                          icon={<Trash2 size={13} />}
                          style={{ color: '#BC4D52' }}
                          aria-label="Remove procedure"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Amount Below Procedures */}
            <div
              style={{
                marginTop: 18,
                padding: '16px 20px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong style={{ fontSize: 14, color: '#166534', display: 'block' }}>Total Procedures Amount</strong>
                <span style={{ fontSize: 12, color: '#15803D' }}>{consultation.procedures.length} item(s) included in this visit draft</span>
              </div>
              <strong style={{ fontSize: 22, color: '#166534', fontWeight: 800 }}>
                {money(totalAmount)}
              </strong>
            </div>
          </>
        ) : (
          <EmptyState
            title="No procedures or services added yet"
            message="Add injections, cotton, peel, or treatments above. Total amount will be calculated automatically."
            icon={<Activity size={18} />}
          />
        )}
      </Card>
    </div>
  );
}
