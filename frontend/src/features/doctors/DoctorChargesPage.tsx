import { useMemo, useState } from 'react';
import { CreditCard, Edit2, Plus, RotateCcw, Search, Syringe, Tag, Trash2, X } from 'lucide-react';
import type { Department } from '../../types/domain';
import { money } from '../../utils/format';
import { PageHeading } from '../../components/shared/Primitives';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeading, StatCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { TablePagination, usePagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';
import type { ClinicChargeItem } from '../../services/charges/chargesService';
import {
  deleteClinicCharge,
  getClinicCharges,
  resetClinicCharges,
  saveClinicCharge,
} from '../../services/charges/chargesService';

export function DoctorChargesPage({ department }: { department: Department }) {
  const toast = useToast();
  const [charges, setCharges] = useState<ClinicChargeItem[]>(() => getClinicCharges());
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ClinicChargeItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ClinicChargeItem['category']>('Injection');
  const [formPrice, setFormPrice] = useState('');
  const [formUnit, setFormUnit] = useState('');

  const refresh = () => {
    setCharges(getClinicCharges());
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return charges.filter((item) => {
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
      const matchQ =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.unit ?? '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [charges, categoryFilter, query]);

  const { page, setPage, pageSize, setPageSize, pagedItems: paginatedRows, total } = usePagination(filtered, 5);

  const openAddModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormCategory('Injection');
    setFormPrice('');
    setFormUnit('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: ClinicChargeItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormPrice(String(item.price));
    setFormUnit(item.unit || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.push('Please enter product / service name.', 'error');
      return;
    }
    const priceNum = parseFloat(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.push('Please enter a valid price greater than 0.', 'error');
      return;
    }

    const itemToSave: ClinicChargeItem = {
      id: editingItem ? editingItem.id : `CHG-${Date.now()}`,
      name: formName.trim(),
      category: formCategory,
      price: priceNum,
      unit: formUnit.trim() || undefined,
      department: department,
    };

    saveClinicCharge(itemToSave);
    refresh();
    setIsModalOpen(false);
    toast.push(editingItem ? `Updated "${itemToSave.name}" successfully.` : `Added "${itemToSave.name}" to Charges.`);
  };

  const handleDelete = (item: ClinicChargeItem) => {
    if (!window.confirm(`Delete "${item.name}" from charges master?`)) return;
    deleteClinicCharge(item.id);
    refresh();
    toast.push(`Deleted "${item.name}".`);
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Reset charges list to default clinic catalog (all injections, cotton, consumables)?')) return;
    const def = resetClinicCharges();
    setCharges(def);
    toast.push('Charges catalog reset to defaults.');
  };

  const categoryTone = (cat: string) => {
    switch (cat) {
      case 'Injection':
        return 'warn';
      case 'Consumable':
        return 'info';
      case 'Procedure':
        return 'success';
      default:
        return 'neutral';
    }
  };

  const injectionCount = charges.filter((c) => c.category === 'Injection').length;
  const consumableCount = charges.filter((c) => c.category === 'Consumable').length;
  const procedureCount = charges.filter((c) => c.category === 'Procedure').length;

  return (
    <>
      <PageHeading
        eyebrow={`${department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics'} · Billing Master`}
        title="Charges & Products"
        description="Master pricing list for injections, clinic consumables (cotton, gauze, needles), and skin procedures. Items automatically auto-fill into Consultation Procedures."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" size="small" onClick={handleResetDefaults} icon={<RotateCcw size={13} />}>
              Reset defaults
            </Button>
            <Button size="small" onClick={openAddModal} icon={<Plus size={14} />}>
              Add new charge
            </Button>
          </div>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Total Catalog Items"
          value={charges.length}
          hint="Active products & procedures"
          icon={<Tag size={16} />}
        />
        <StatCard
          label="Injections"
          value={injectionCount}
          hint="Steroid, Botox, Glutathione, etc."
          icon={<Syringe size={16} />}
        />
        <StatCard
          label="Consumables / Supplies"
          value={consumableCount}
          hint="Cotton, gauze, tape, needles"
          icon={<CreditCard size={16} />}
        />
        <StatCard
          label="Procedures"
          value={procedureCount}
          hint="Peels, extraction, cautery, biopsy"
          icon={<Tag size={16} />}
        />
      </div>

      <Card padded={false}>
        <div style={{ padding: '20px 24px 0' }}>
          <SectionHeading
            title="Clinic Price Master"
            subtitle="Edit any product name or price. These items appear in Procedure suggestions as doctors type."
          />
        </div>

        <div className="toolbar" style={{ padding: '0 24px' }}>
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search charges by name or category"
              placeholder="Search injection, cotton, peel, or procedure..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            {query && (
              <button
                type="button"
                className="icon-button"
                style={{ width: 22, height: 22, border: 0 }}
                onClick={() => setQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            className="select-field"
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Categories</option>
            <option value="Injection">Injections</option>
            <option value="Consumable">Consumables / Supplies</option>
            <option value="Procedure">Procedures</option>
            <option value="Service">Services</option>
            <option value="Other">Other</option>
          </select>

          <span className="result-count">{filtered.length} products found</span>
        </div>

        {paginatedRows.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>S.No</th>
                    <th>Product / Service Name</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Standard Price (INR)</th>
                    <th>Unit / Billing Basis</th>
                    <th style={{ textAlign: 'center', width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((item, index) => {
                    const sno = (page - 1) * pageSize + index + 1;
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>{sno}</td>
                        <td>
                          <strong>{item.name}</strong>
                          <span className="table-subtext">{item.id}</span>
                        </td>
                        <td>
                          <Badge tone={categoryTone(item.category)}>{item.category}</Badge>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                          {money(item.price)}
                        </td>
                        <td>
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{item.unit || 'per unit'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => openEditModal(item)}
                              icon={<Edit2 size={13} />}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => handleDelete(item)}
                              icon={<Trash2 size={13} />}
                              style={{ color: '#BC4D52' }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : (
          <EmptyState
            title="No charges match your filter"
            message="Try searching for another product name or click 'Add new charge' to create one."
            icon={<Tag size={18} />}
            action={
              <Button variant="secondary" onClick={() => { setQuery(''); setCategoryFilter('all'); }}>
                Clear filters
              </Button>
            }
          />
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={isModalOpen}
        title={editingItem ? 'Edit Product / Charge' : 'Add New Product / Charge'}
        subtitle="This price is automatically suggested when doctors enter consultation procedures."
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingItem ? 'Save Changes' : 'Add Product'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 14 }}>
          <div className="field">
            <label htmlFor="charge-name">Product / Service Name *</label>
            <input
              id="charge-name"
              className="control"
              placeholder="e.g. Kenacort Steroid Injection, Cotton Pack 100g, Skin Biopsy"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="charge-category">Category *</label>
              <select
                id="charge-category"
                className="select-field"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ClinicChargeItem['category'])}
              >
                <option value="Injection">Injection</option>
                <option value="Consumable">Consumable / Supply</option>
                <option value="Procedure">Procedure</option>
                <option value="Service">Service</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="charge-price">Standard Price (INR ₹) *</label>
              <input
                id="charge-price"
                type="number"
                min="1"
                step="1"
                className="control"
                placeholder="0"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="charge-unit">Unit / Billing Basis (optional)</label>
            <input
              id="charge-unit"
              className="control"
              placeholder="e.g. per session, per vial, pack of 2, full face"
              value={formUnit}
              onChange={(e) => setFormUnit(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
