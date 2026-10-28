import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { CreditCard, FileText, Printer, Search, Wallet } from 'lucide-react';
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
  const patient = invoice ? state.patients.find((person) => person.id === invoice.patientId) : undefined;
  const totals = invoice ? patientInvoiceTotals(invoice) : null;
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: totals?.balance ?? 0, method: 'Cash' as Payment['method'], transactionReference: '' },
  });

  const refreshForm = () => reset({ amount: totals?.balance ?? 0, method: 'Cash', transactionReference: '' });

  const pay = handleSubmit(async (values) => {
    if (!invoice) return;
    try {
      await repository.recordPayment(invoice.id, {
        ...values,
        amount: Number(values.amount),
        transactionReference: values.transactionReference || undefined,
      });
      toast.push('Payment recorded; invoice balance updated.');
      refreshForm();
      setViewMode('receipt');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not record payment.', 'error');
    }
  });

  const print = (kind: 'invoice' | 'receipt') => {
    if (kind === 'receipt' && !invoice?.payments.length) {
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

  if (!invoice || !totals) return null;
  const latestPayment = invoice.payments[invoice.payments.length - 1];

  return (
    <Modal
      open
      title={`Invoice ${invoice.id}`}
      subtitle={`${patient?.fullName ?? 'Patient'} · ${dateLabel(invoice.date)}`}
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
            disabled={!invoice.payments.length}
            icon={<Printer size={14} />}
            title={!invoice.payments.length ? 'Record a payment first' : undefined}
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
                Tax Invoice ({invoice.id})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!invoice.payments.length) {
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
                  cursor: invoice.payments.length ? 'pointer' : 'not-allowed',
                  opacity: invoice.payments.length ? 1 : 0.6,
                  background: viewMode === 'receipt' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'receipt' ? 'var(--navy)' : '#64748B',
                  boxShadow: viewMode === 'receipt' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                Payment Receipt {invoice.payments.length ? `(${invoice.payments.length})` : '(0)'}
              </button>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Previewing: <strong style={{ color: 'var(--navy)' }}>{viewMode === 'invoice' ? 'Tax Invoice' : 'Payment Receipt'}</strong>
            </span>
          </div>

          <InvoicePreview
            invoice={invoice}
            patient={patient}
            totals={totals}
            mode={viewMode}
            latestPayment={latestPayment}
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
              <div className="button-row">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => reset({ amount: totals.balance, method: 'Cash', transactionReference: '' })}
                >
                  Set full balance
                </Button>
                <Button type="submit" size="small">
                  Record payment
                </Button>
              </div>
            </form>
          ) : (
            <div className="hint-banner">This invoice is fully paid.</div>
          )}
          <hr className="divider" />
          <div className="payment-history">
            <strong>Payment history</strong>
            {invoice.payments.length ? (
              invoice.payments.map((payment) => (
                <div className="list-row" key={payment.id}>
                  <div className="list-row-main">
                    <strong>{money(payment.amount)} · {payment.method}</strong>
                    <span>
                      {dateLabel(payment.paidAt, 'd MMM · h:mm a')}
                      {payment.transactionReference ? ` · ${payment.transactionReference}` : ''}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <span className="field-hint">No payments recorded yet.</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InvoicePreview({
  invoice,
  patient,
  totals,
  mode,
  latestPayment,
}: {
  invoice: Invoice;
  patient?: { fullName: string; id: string; phone: string; address: string };
  totals: ReturnType<typeof patientInvoiceTotals>;
  mode: 'invoice' | 'receipt';
  latestPayment?: Payment;
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
          <table className="invoice-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>#</th>
                <th>Service Description</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Qty</th>
                <th style={{ width: '22%' }}>Amount</th>
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
              </tr>
              {invoice.charges.map((charge, idx) => (
                <tr key={charge.id}>
                  <td>{idx + 2}</td>
                  <td>
                    <strong>{charge.description}</strong>
                    <small style={{ display: 'block' }}>Clinical Charge · Added by {charge.addedBy}</small>
                  </td>
                  <td style={{ textAlign: 'center' }}>1</td>
                  <td>{money(charge.amount)}</td>
                </tr>
              ))}
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
