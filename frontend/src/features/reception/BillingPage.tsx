import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { CreditCard, Edit2, FileText, Plus, Printer, Search, Trash2, Wallet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { paymentSchema } from '../../schemas/forms';
import type { Invoice, Payment } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useToast } from '../../components/ui/Toast';
import { dateLabel, money, patientInvoiceTotals } from '../../utils/format';
import { PageHeading, PatientAvatar } from '../../components/shared/Primitives';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { TablePagination, usePagination } from '../../components/ui/Pagination';

const methods: Payment['method'][] = ['Cash', 'UPI', 'GPay', 'PhonePe', 'Card', 'Other'];

export function BillingPage() {
  const { state } = useHospitalData();
  const today = new Date().toDateString();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const rows = useMemo(() => state.invoices.map((invoice) => ({ invoice, patient: state.patients.find((person) => person.id === invoice.patientId), totals: patientInvoiceTotals(invoice) })).filter(({ invoice, patient, totals }) => {
    const matchesSearch = !search || `${invoice.id} ${patient?.fullName ?? ''} ${patient?.id ?? ''} ${patient?.phone ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (department === 'all' || invoice.department === department) && (status === 'all' || totals.status === status);
  }).sort((a, b) => ((b.invoice.date || (b.invoice as any).createdAt || '') as string).localeCompare((a.invoice.date || (a.invoice as any).createdAt || '') as string)), [department, search, state.invoices, state.patients, status]);
  const { page, setPage, pageSize, setPageSize, pagedItems, total } = usePagination(rows, 6);
  const collectionToday = state.invoices.reduce((sum, invoice) => sum + invoice.payments.filter((payment) => new Date(payment.paidAt).toDateString() === today).reduce((subtotal, payment) => subtotal + payment.amount, 0), 0);
  const openBalance = state.invoices.reduce((sum, invoice) => sum + patientInvoiceTotals(invoice).balance, 0);
  const selected = state.invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const totalValue = state.invoices.reduce((sum, invoice) => sum + patientInvoiceTotals(invoice).total, 0);
  return <>
    <PageHeading eyebrow="Reception · Finance" title="Payments & invoices" description="Configurable demo fees, transparent balances, and itemized printable records." />
    <div className="stats-grid"><StatCard label="Today's collections" value={money(collectionToday)} hint="Mock payments recorded today" icon={<Wallet size={16} />} /><StatCard label="Outstanding balance" value={money(openBalance)} hint="Across unpaid and partial invoices" icon={<CreditCard size={16} />} /><StatCard label="Invoices" value={state.invoices.length} hint="Shared visit billing records" icon={<FileText size={16} />} /><StatCard label="Invoice value" value={money(totalValue)} hint="Consultations plus added services" icon={<Wallet size={16} />} /></div>
    <Card padded={false}><div style={{ padding: '18px 20px 0' }}><SectionHeading title="Invoice register" subtitle="Doctor-added charges appear here from the same shared demo store." /></div><div className="toolbar" style={{ padding: '0 20px' }}><div className="search-field"><Search size={15} /><input aria-label="Search invoices" placeholder="Patient, ID, phone, or invoice number" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="select-field" aria-label="Filter invoices by department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option><option value="skin">Skin</option><option value="orthopaedics">Orthopaedics</option></select><select className="select-field" aria-label="Filter invoices by payment status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All payment statuses</option><option>Due</option><option>Partial</option><option>Paid</option></select><span className="result-count">{rows.length} invoices</span></div>
      {rows.length ? <><div className="table-wrap responsive-cards"><table className="data-table"><thead><tr><th className="serial-col">S.No</th><th>Invoice / Patient</th><th>Visit / Department</th><th>Total</th><th>Paid</th><th>Balance</th><th style={{ textAlign: 'center', width: 110 }}>Status</th><th className="actions-col" style={{ textAlign: 'center', width: 130 }}>Actions</th></tr></thead><tbody>{pagedItems.map(({ invoice, patient, totals }, index) => { const serialNo = (page - 1) * pageSize + index + 1; return <tr key={invoice.id}><td className="serial-cell">{serialNo}</td><td><div className="patient-cell"><PatientAvatar name={patient?.fullName ?? 'Patient'} small /><div><strong>{invoice.id}</strong><span>{patient?.fullName ?? 'Patient'} · {patient?.id ?? invoice.patientId}</span></div></div></td><td>{invoice.visitLabel}<span className="table-subtext">{invoice.department === 'skin' ? 'Skin' : 'Orthopaedics'} · {dateLabel(invoice.date)}</span></td><td>{money(totals.total)}</td><td>{money(totals.paid)}</td><td><strong>{money(totals.balance)}</strong></td><td style={{ textAlign: 'center' }}><Badge tone={statusTone(totals.status)}>{totals.status}</Badge></td><td className="actions-cell" style={{ textAlign: 'center' }}><Button variant="secondary" size="small" onClick={() => setSelectedInvoiceId(invoice.id)}>View / pay</Button></td></tr>; })}</tbody></table></div>
        <div className="patient-card-list invoice-card-list">{pagedItems.map(({ invoice, patient, totals }, index) => { const serialNo = (page - 1) * pageSize + index + 1; return <article className="patient-card" key={invoice.id}><div className="patient-card-head"><div className="patient-card-name"><span className="serial-cell" style={{ marginRight: 6 }}>#{serialNo}</span><PatientAvatar name={patient?.fullName ?? 'Patient'} /><div><strong>{patient?.fullName ?? 'Patient'}</strong><span>{invoice.id} · {invoice.department === 'skin' ? 'Skin' : 'Orthopaedics'}</span></div></div><Badge tone={statusTone(totals.status)}>{totals.status}</Badge></div><div className="patient-card-meta"><div><small>Total / Paid</small><strong>{money(totals.total)} / {money(totals.paid)}</strong></div><div><small>Balance</small><strong>{money(totals.balance)}</strong></div></div><Button variant="secondary" size="small" style={{ marginTop: 12 }} onClick={() => setSelectedInvoiceId(invoice.id)}>View invoice / record payment</Button></article>; })}</div>
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </> : <EmptyState title="No invoices match" message="Invoices are created for demo visits added to the queue. Adjust filters or add a patient visit." icon={<FileText size={18} />} />}
    </Card>
    <InvoiceModal invoice={selected} onClose={() => setSelectedInvoiceId(null)} />
  </>;
}

function InvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { state, repository } = useHospitalData();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'invoice' | 'receipt'>('invoice');
  const [showAddChargeModal, setShowAddChargeModal] = useState(false);
  const [editingCharge, setEditingCharge] = useState<any | null>(null);
  // Ensure we always reference the live invoice in state so newly added charges/payments reflect instantly
  const currentInvoice = invoice ? (state.invoices.find((i) => i.id === invoice.id) ?? invoice) : null;
  const patient = currentInvoice ? state.patients.find((person) => person.id === currentInvoice.patientId) : undefined;
  const totals = currentInvoice ? patientInvoiceTotals(currentInvoice) : null;
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: totals?.balance ?? 0, method: 'Cash' as Payment['method'], transactionReference: '' },
  });

  useEffect(() => {
    if (totals?.balance !== undefined) {
      reset({ amount: totals.balance, method: 'Cash', transactionReference: '' });
    }
  }, [totals?.balance, reset]);

  const refreshForm = () => reset({ amount: totals?.balance ?? 0, method: 'Cash', transactionReference: '' });

  const pay = handleSubmit(async (values) => {
    if (!currentInvoice) return;
    try {
      await repository.recordPayment(currentInvoice.id, {
        ...values,
        amount: Number(values.amount),
        transactionReference: values.transactionReference || undefined,
      });
      toast.push(`Payment of ${money(Number(values.amount))} recorded; invoice balance updated.`);
      refreshForm();
      setViewMode('invoice');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not record payment.', 'error');
    }
  });

  const print = (kind: 'invoice' | 'receipt') => {
    if (kind === 'receipt' && !currentInvoice?.payments.length) {
      toast.push('Record a payment before printing a receipt.', 'error');
      return;
    }
    flushSync(() => {
      setViewMode(kind);
    });
    document.body.classList.add(kind === 'receipt' ? 'print-receipt' : 'print-invoice');
    window.setTimeout(() => {
      window.print();
      document.body.classList.remove('print-receipt', 'print-invoice');
    }, 100);
  };

  if (!currentInvoice || !totals) return null;
  const latestPayment = currentInvoice.payments[currentInvoice.payments.length - 1];

  const handleDeleteCharge = async (chargeId: string, description: string) => {
    if (!currentInvoice) return;
    if (!window.confirm(`Delete charge "${description}" from invoice ${currentInvoice.id}?`)) return;
    try {
      await (repository as any).removeInvoiceCharge(currentInvoice.id, chargeId);
      toast.push(`Deleted "${description}" from invoice.`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not delete charge.', 'error');
    }
  };

  const handleDeletePayment = async (paymentId: string, amount: number) => {
    if (!currentInvoice) return;
    if (!window.confirm(`Remove / void payment of ${money(amount)} from invoice ${currentInvoice.id}? This will restore the balance due to ${money(totals.total)} so reception can collect or adjust the amount.`)) return;
    try {
      if ((repository as any).removePayment) {
        await (repository as any).removePayment(currentInvoice.id, paymentId);
      } else {
        toast.push('Remove payment method not available.', 'error');
        return;
      }
      toast.push(`Payment of ${money(amount)} removed; balance due restored.`);
      refreshForm();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not remove payment.', 'error');
    }
  };

  return (
    <Modal
      open
      title={`Invoice ${currentInvoice.id}`}
      subtitle={`${patient?.fullName ?? 'Patient'} · ${dateLabel(currentInvoice.date)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button
            variant={viewMode === 'invoice' ? 'primary' : 'secondary'}
            onClick={() => print('invoice')}
            icon={<Printer size={14} />}
          >
            Print invoice
          </Button>
          <Button
            variant={viewMode === 'receipt' ? 'primary' : 'secondary'}
            onClick={() => print('receipt')}
            disabled={!currentInvoice.payments.length}
            icon={<Printer size={14} />}
            title={!currentInvoice.payments.length ? 'Record a payment first' : undefined}
          >
            Print receipt
          </Button>
        </>
      }
    >
      <div className="billing-modal-grid">
        <div>
          {/* Document Type Switcher */}
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '3px' }}>
              <button
                type="button"
                onClick={() => setViewMode('invoice')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: viewMode === 'invoice' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'invoice' ? 'var(--navy)' : '#64748B',
                  boxShadow: viewMode === 'invoice' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                Tax Invoice ({currentInvoice.id})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentInvoice.payments.length) {
                    toast.push('No payments recorded on this invoice yet.', 'info');
                    return;
                  }
                  setViewMode('receipt');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: currentInvoice.payments.length ? 'pointer' : 'not-allowed',
                  opacity: currentInvoice.payments.length ? 1 : 0.6,
                  background: viewMode === 'receipt' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'receipt' ? 'var(--navy)' : '#64748B',
                  boxShadow: viewMode === 'receipt' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                Payment Receipt {currentInvoice.payments.length ? `(${currentInvoice.payments.length})` : '(0)'}
              </button>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Previewing: <strong style={{ color: 'var(--navy)' }}>{viewMode === 'invoice' ? 'Tax Invoice' : 'Payment Receipt'}</strong>
            </span>
          </div>

          <InvoicePreview
            invoice={currentInvoice}
            patient={patient}
            totals={totals}
            mode={viewMode}
            latestPayment={latestPayment}
            onOpenAddPayment={() => setShowAddChargeModal(true)}
            onDeleteCharge={handleDeleteCharge}
            onEditCharge={(charge) => setEditingCharge(charge)}
          />
        </div>

        <div className="payment-panel no-print">
          <SectionHeading title="Record a payment" subtitle="Record cash, UPI, card, or direct payments." />
          <div className="invoice-balance-box">
            <span>Balance due</span>
            <strong>{money(totals.balance)}</strong>
          </div>
          {totals.balance > 0 ? (
            <form onSubmit={pay} className="stack-sm">
              <Field
                id="payment-amount"
                label="Payment amount"
                type="number"
                min="1"
                max={totals.balance}
                step="1"
                required
                error={errors.amount?.message as string}
                {...register('amount')}
              />
              <div className="field">
                <label htmlFor="payment-method">Payment method</label>
                <select id="payment-method" className="control" {...register('method')}>
                  {methods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </div>
              <Field
                id="transaction-reference"
                label="Transaction reference (optional)"
                placeholder="UPI ref / Cheque / Card txn"
                {...register('transactionReference')}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => reset({ amount: totals.balance, method: 'Cash', transactionReference: '' })}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0D9488',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                  title="Auto-fill with total remaining balance"
                >
                  Full balance ({money(totals.balance)})
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => reset({ amount: totals.balance, method: 'Cash', transactionReference: '' })}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="small" variant="primary">
                    Submit Payment
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="hint-banner">This invoice is fully paid.</div>
          )}
          <hr className="divider" />
          <div className="payment-history">
            <strong>Payment history</strong>
            {currentInvoice.payments.length ? (
              currentInvoice.payments.map((payment) => (
                <div className="list-row" key={payment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="list-row-main">
                    <strong>{money(payment.amount)} · {payment.method}</strong>
                    <span>
                      {dateLabel(payment.paidAt, 'd MMM · h:mm a')}
                      {payment.transactionReference ? ` · ${payment.transactionReference}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePayment(payment.id, payment.amount)}
                    title={`Remove / void payment of ${money(payment.amount)}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#EF4444',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s ease',
                      marginLeft: '8px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <span className="field-hint">No payments recorded yet.</span>
            )}
          </div>
        </div>
      </div>
      {showAddChargeModal && (
        <AddPaymentModal
          invoice={currentInvoice}
          patient={patient}
          onClose={() => setShowAddChargeModal(false)}
          onSuccess={() => {}}
        />
      )}
      {editingCharge && (
        <EditChargeModal
          invoice={currentInvoice}
          charge={editingCharge}
          onClose={() => setEditingCharge(null)}
          onSuccess={() => setEditingCharge(null)}
        />
      )}
    </Modal>
  );
}

function InvoicePreview({
  invoice,
  patient,
  totals,
  mode,
  latestPayment,
  onOpenAddPayment,
  onDeleteCharge,
  onEditCharge,
}: {
  invoice: Invoice;
  patient?: { fullName: string; id: string; phone: string; address: string };
  totals: ReturnType<typeof patientInvoiceTotals>;
  mode: 'invoice' | 'receipt';
  latestPayment?: Payment;
  onOpenAddPayment?: () => void;
  onDeleteCharge?: (chargeId: string, description: string) => void;
  onEditCharge?: (charge: any) => void;
}) {
  const receipt = mode === 'receipt';

  return (
    <article className={`invoice-paper printable${receipt ? ' receipt-print' : ''}`}>
      <div className="invoice-header">
        <div className="invoice-brand">
          <span className="brand-mark">
            <img className="brand-logo" src="/tosh-icon-circle.png" alt="TOSH Logo" />
          </span>
          <div>
            <h2>TRICHY ORTHO & SKIN</h2>
            <p>HEALTH FOUNDATION</p>
          </div>
        </div>
        <div className="invoice-title">
          <span>{receipt ? 'Official Payment Receipt' : 'Outpatient Tax Invoice'}</span>
          <strong>{receipt ? `RCPT-${latestPayment?.id ?? 'PAY'}` : invoice.id}</strong>
        </div>
      </div>

      <div className="invoice-parties">
        <div>
          <span>{receipt ? 'Received With Thanks From' : 'Billed To / Patient'}</span>
          <strong>{patient?.fullName ?? 'Patient'}</strong>
          <p>UHID: {patient?.id ?? invoice.patientId} · {patient?.phone || 'No phone recorded'}</p>
          {patient?.address && <p>{patient.address}</p>}
        </div>
        <div>
          <span>{receipt ? 'Receipt & Payment Details' : 'Invoice & Visit Details'}</span>
          <strong>{dateLabel(receipt ? latestPayment?.paidAt ?? invoice.date : invoice.date, 'd MMM yyyy · h:mm a')}</strong>
          <p>Visit Ref: {invoice.visitLabel}</p>
          <p>Department: {invoice.department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics'}</p>
        </div>
      </div>

      {!receipt ? (
        <>
          {/* Top Bar above Table with Add Payment button aligned to Amount column */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              padding: '6px 12px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
              Invoice Items &amp; Services
            </span>
            {onOpenAddPayment && (
              <button
                type="button"
                onClick={onOpenAddPayment}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(13, 148, 136, 0.2)',
                  transition: 'all 0.15s ease',
                }}
                title="Add service description, quantity and payment amount to this invoice"
              >
                <Plus size={13} strokeWidth={2.5} /> Add Payment
              </button>
            )}
          </div>

          <table className="invoice-table">
            <thead>
              <tr>
                <th style={{ width: '7%' }}>#</th>
                <th>Service Description</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Qty</th>
                <th style={{ width: '20%' }}>Amount</th>
                <th className="no-print" style={{ width: '9%', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>
                  <strong>Consultation Fee</strong>
                  <small style={{ display: 'block' }}>OPD Consultation · {invoice.department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics'}</small>
                </td>
                <td style={{ textAlign: 'center' }}>1</td>
                <td>{money(invoice.consultationFee)}</td>
                <td className="no-print" style={{ textAlign: 'center', color: '#94A3B8', fontSize: '11px' }} title="Doctor OPD Consultation fee (cannot be edited or deleted by reception)">—</td>
              </tr>
              {invoice.charges.map((charge, idx) => {
                const isReceptionCharge =
                  charge.addedBy === 'Reception Desk' ||
                  charge.addedBy === 'reception' ||
                  (!charge.addedBy.startsWith('Dr.') && !charge.addedBy.includes('Doctor'));

                return (
                  <tr key={charge.id}>
                    <td>{idx + 2}</td>
                    <td>
                      <strong>{charge.description}</strong>
                      <small style={{ display: 'block' }}>
                        Clinical Charge · Added by {charge.addedBy}
                        {charge.qty && charge.qty > 1 ? ` (${charge.qty} × ${money(charge.unitPrice || (charge.amount / charge.qty))})` : ''}
                      </small>
                    </td>
                    <td style={{ textAlign: 'center' }}>{charge.qty || 1}</td>
                    <td>{money(charge.amount)}</td>
                    <td className="no-print" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {isReceptionCharge ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          {onEditCharge && (
                            <button
                              type="button"
                              onClick={() => onEditCharge(charge)}
                              title={`Edit ${charge.description}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#0284C7',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#E0F2FE')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {onDeleteCharge && (
                            <button
                              type="button"
                              onClick={() => onDeleteCharge(charge.id, charge.description)}
                              title={`Delete ${charge.description}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#EF4444',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span
                          title={`Added by ${charge.addedBy} (Doctor-ordered item cannot be edited or deleted by reception)`}
                          style={{ color: '#94A3B8', fontSize: '11px', cursor: 'default' }}
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(totals.total)}</strong>
            </div>
            <div>
              <span>Amount Paid</span>
              <strong style={{ color: '#166534' }}>{money(totals.paid)}</strong>
            </div>
            <div className="grand">
              <span>Balance Due</span>
              <strong style={{ color: totals.balance === 0 ? '#166534' : '#DC2626' }}>
                {totals.balance === 0 ? '₹0 · Settled' : money(totals.balance)}
              </strong>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="receipt-voucher-card">
            <div className="receipt-voucher-header">
              <h3>Payment Acknowledgement Voucher</h3>
              <span className="receipt-voucher-status">PAID & VERIFIED</span>
            </div>
            <div className="receipt-voucher-grid">
              <div className="receipt-voucher-item">
                <span>Amount Received</span>
                <strong className="receipt-amount-highlight">{money(latestPayment?.amount ?? 0)}</strong>
              </div>
              <div className="receipt-voucher-item">
                <span>Payment Mode</span>
                <strong>{latestPayment?.method ?? 'Cash'}</strong>
              </div>
              <div className="receipt-voucher-item">
                <span>Transaction Reference</span>
                <strong>{latestPayment?.transactionReference || 'Direct counter payment'}</strong>
              </div>
              <div className="receipt-voucher-item">
                <span>Total Invoice Bill</span>
                <strong>{money(totals.total)}</strong>
              </div>
              <div className="receipt-voucher-item">
                <span>Total Paid So Far</span>
                <strong>{money(totals.paid)}</strong>
              </div>
              <div className="receipt-voucher-item">
                <span>Remaining Balance</span>
                <strong style={{ color: totals.balance === 0 ? '#166534' : '#DC2626' }}>
                  {totals.balance === 0 ? '₹0 · Fully Paid' : money(totals.balance)}
                </strong>
              </div>
            </div>
          </div>

          {invoice.payments.length > 1 && (
            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                Payment Breakdown ({invoice.payments.length} Payments on this Invoice)
              </div>
              <table className="invoice-table" style={{ fontSize: '11.5px' }}>
                <thead>
                  <tr>
                    <th>Receipt Ref</th>
                    <th>Date & Time</th>
                    <th>Method</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td>RCPT-{p.id}{p.transactionReference ? ` · ${p.transactionReference}` : ''}</td>
                      <td>{dateLabel(p.paidAt, 'd MMM yyyy, h:mm a')}</td>
                      <td>{p.method}</td>
                      <td>{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="invoice-print-footer">
        <div className="invoice-terms-notes">
          <strong>{receipt ? 'Receipt Acknowledgement:' : 'Billing Terms & Important Notes:'}</strong>
          <ol style={{ margin: '3px 0 0', paddingLeft: '14px', lineHeight: 1.45 }}>
            {receipt ? (
              <>
                <li>Received with thanks towards outpatient hospital consultation & services.</li>
                <li>Retain this official computer-generated receipt for insurance and tax reimbursement.</li>
                <li>Valid without handwritten countersignature.</li>
              </>
            ) : (
              <>
                <li>Computer-generated tax invoice issued by TOSH Foundation.</li>
                <li>Outpatient pharmacy medications & diagnostic lab tests are billed separately.</li>
                <li>Please retain this invoice for your health insurance records.</li>
              </>
            )}
          </ol>
        </div>
        <div className="invoice-signatory-box">
          <div className="invoice-signatory-space" />
          <strong>Authorized Signatory / Cashier</strong>
          <span>TOSH Foundation Accounts Desk</span>
          <small>Tiruchirappalli (Trichy), Tamil Nadu</small>
        </div>
      </div>
    </article>
  );
}


function EditChargeModal({
  invoice,
  charge,
  onClose,
  onSuccess,
}: {
  invoice: Invoice;
  charge: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { repository } = useHospitalData();
  const toast = useToast();
  const initialQty = charge.qty || 1;
  const initialUnitAmount = charge.unitPrice || Math.round(charge.amount / initialQty);

  const [description, setDescription] = useState(charge.description);
  const [qty, setQty] = useState<number>(initialQty);
  const [unitAmount, setUnitAmount] = useState<number | ''>(initialUnitAmount);
  const [submitting, setSubmitting] = useState(false);

  const totalAmount = qty * (typeof unitAmount === 'number' ? unitAmount : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || typeof unitAmount !== 'number' || unitAmount <= 0) {
      toast.push('Please enter a valid description and amount.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if ((repository as any).updateInvoiceCharge) {
        await (repository as any).updateInvoiceCharge(invoice.id, charge.id, {
          description: description.trim(),
          amount: totalAmount,
          qty,
          unitPrice: unitAmount,
        });
      } else {
        await (repository as any).removeInvoiceCharge(invoice.id, charge.id);
        await (repository as any).addInvoiceCharge(
          invoice.id,
          description.trim(),
          totalAmount,
          charge.addedBy || 'Reception Desk',
          qty
        );
      }
      toast.push(`Updated "${description.trim()}" successfully.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update charge.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="Edit Service Charge"
      subtitle={`Invoice ${invoice.id} · Charge ${charge.id}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="stack" style={{ gap: '16px' }}>
        <div className="field">
          <label htmlFor="edit-charge-desc" style={{ fontSize: '13px', fontWeight: 600 }}>
            Service Description <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            id="edit-charge-desc"
            type="text"
            className="control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dressing & Bandage"
            required
            autoFocus
          />
        </div>

        <div className="form-grid two">
          <div className="field">
            <label htmlFor="edit-charge-qty" style={{ fontSize: '13px', fontWeight: 600 }}>
              Quantity (Qty) <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="edit-charge-qty"
              type="number"
              className="control"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="edit-charge-unit" style={{ fontSize: '13px', fontWeight: 600 }}>
              Unit Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="edit-charge-unit"
              type="number"
              className="control"
              min="1"
              step="1"
              value={unitAmount}
              onChange={(e) =>
                setUnitAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))
              }
              required
            />
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '13px', color: '#475569' }}>
            Calculated Total ({qty} × {money(typeof unitAmount === 'number' ? unitAmount : 0)}):
          </span>
          <strong style={{ fontSize: '16px', color: '#0D9488' }}>{money(totalAmount)}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !description.trim() || totalAmount <= 0}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddPaymentModal({
  invoice,
  patient,
  onClose,
  onSuccess,
}: {
  invoice: Invoice;
  patient?: { fullName: string; id: string; phone: string; address: string };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { repository } = useHospitalData();
  const toast = useToast();

  interface LineItemRow {
    id: string;
    description: string;
    qty: number;
    unitAmount: number | '';
  }

  const [items, setItems] = useState<LineItemRow[]>([
    { id: '1', description: '', qty: 1, unitAmount: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (id: string, patch: Partial<LineItemRow>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, description: '', qty: 1, unitAmount: '' },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) {
      setItems([{ id: '1', description: '', qty: 1, unitAmount: '' }]);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const grandTotal = items.reduce((sum, item) => {
    const amt = typeof item.unitAmount === 'number' ? item.unitAmount : 0;
    return sum + (item.qty * amt);
  }, 0);

  const validItems = items.filter(
    (item) => item.description.trim() && typeof item.unitAmount === 'number' && item.unitAmount > 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validItems.length === 0) {
      toast.push('Please enter at least one valid item with description and amount.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      for (const it of validItems) {
        const lineTotal = it.qty * Number(it.unitAmount);
        await (repository as any).addInvoiceCharge(
          invoice.id,
          it.description.trim(),
          lineTotal,
          'Reception Desk',
          it.qty,
        );
      }

      toast.push(`Added ${validItems.length} item${validItems.length === 1 ? '' : 's'} (${money(grandTotal)}) to invoice.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not add payment items.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="Add Payment & Service Charges"
      subtitle={`Invoice ${invoice.id} · ${patient?.fullName ?? 'Patient'} (UHID: ${patient?.id ?? invoice.patientId})`}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="stack" style={{ gap: '16px' }}>
        {/* Compact Table for Multiple Item Entry */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', background: '#FFFFFF' }}>
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            <table className="data-table" style={{ margin: 0, width: '100%', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center', padding: '10px 6px' }}>#</th>
                  <th style={{ minWidth: '220px', padding: '10px 10px' }}>Service Description <span style={{ color: '#EF4444' }}>*</span></th>
                  <th style={{ width: '85px', textAlign: 'center', padding: '10px 6px' }}>Qty <span style={{ color: '#EF4444' }}>*</span></th>
                  <th style={{ width: '130px', padding: '10px 8px' }}>Unit Amount (₹) <span style={{ color: '#EF4444' }}>*</span></th>
                  <th style={{ width: '100px', textAlign: 'right', padding: '10px 10px' }}>Subtotal</th>
                  <th style={{ width: '45px', textAlign: 'center', padding: '10px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const lineTotal = item.qty * (typeof item.unitAmount === 'number' ? item.unitAmount : 0);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ textAlign: 'center', color: '#64748B', fontWeight: 600, padding: '8px 6px' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="text"
                          className="control"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, { description: e.target.value })}
                          placeholder="e.g. Dressing, Kenacort..."
                          required
                          style={{ height: '36px', fontSize: '13px', width: '100%', borderRadius: '6px' }}
                        />
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                        <input
                          type="number"
                          className="control"
                          min="1"
                          step="1"
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          required
                          style={{ height: '36px', fontSize: '13px', textAlign: 'center', width: '100%', borderRadius: '6px' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          className="control"
                          min="1"
                          step="1"
                          placeholder="500"
                          value={item.unitAmount}
                          onChange={(e) =>
                            updateItem(item.id, {
                              unitAmount: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          required
                          style={{ height: '36px', fontSize: '13px', width: '100%', borderRadius: '6px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {money(lineTotal)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px' }}>
                        <button
                          type="button"
                          onClick={() => removeItemRow(item.id)}
                          title={items.length > 1 ? 'Delete this row' : 'Clear row'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: items.length > 1 ? '#EF4444' : '#94A3B8',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (items.length > 1) e.currentTarget.style.background = '#FEE2E2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Another Item Button Bar inside table container */}
          <div style={{ padding: '8px 12px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={addItemRow}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                background: '#F0FDFA',
                color: '#0D9488',
                border: '1px solid #99F6E4',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} /> + Add Row
            </button>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              {validItems.length} of {items.length} row{items.length === 1 ? '' : 's'} filled
            </span>
          </div>
        </div>

        {/* Grand Total Summary Box */}
        <div
          style={{
            padding: '12px 16px',
            background: '#F1F5F9',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '12px', color: '#475569', display: 'block' }}>Summary</span>
            <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
              {validItems.length} valid item{validItems.length === 1 ? '' : 's'} to add
            </strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '12px', color: '#475569', display: 'block' }}>Total Amount to Add</span>
            <strong style={{ fontSize: '18px', color: '#0D9488' }}>{money(grandTotal)}</strong>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || validItems.length === 0 || grandTotal <= 0}>
            {submitting
              ? 'Adding Items...'
              : `Add ${validItems.length} Item${validItems.length === 1 ? '' : 's'} (${money(grandTotal)}) to Invoice`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
