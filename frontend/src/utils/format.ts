import { differenceInYears, format, isValid, parseISO } from 'date-fns';
import type { Department } from '../types/domain';

export const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
export const dateLabel = (value: string | Date, pattern = 'd MMM yyyy') => {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, pattern) : '—';
};
export const timeLabel = (value: string | Date) => dateLabel(value, 'h:mm a');
export const dateTimeLabel = (value: string | Date) => dateLabel(value, 'd MMM, h:mm a');
export const getAge = (birthDate: string) => {
  const date = parseISO(birthDate);
  return isValid(date) ? differenceInYears(new Date(), date) : undefined;
};
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
export const departmentLabel = (department: Department) => department === 'skin' ? 'Skin & Dermatology' : 'Orthopaedics';
export const shortDepartment = (department: Department) => department === 'skin' ? 'Skin' : 'Orthopaedics';
export const localDateTimeInput = (value = new Date()) => {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};
export const patientInvoiceTotals = (invoice: {
  consultationFee?: number;
  charges?: { amount: number }[];
  payments?: { amount: number }[];
  total?: number;
  paid?: number;
  balance?: number;
  status?: string;
}) => {
  if (invoice.total !== undefined && invoice.paid !== undefined && invoice.balance !== undefined && invoice.status !== undefined) {
    return {
      total: invoice.total,
      paid: invoice.paid,
      balance: invoice.balance,
      status: invoice.status as 'Paid' | 'Partial' | 'Due',
    };
  }
  const fee = invoice.consultationFee ?? 0;
  const total = fee + (invoice.charges || []).reduce((sum, item) => sum + item.amount, 0);
  const paid = (invoice.payments || []).reduce((sum, payment) => sum + payment.amount, 0);
  return {
    total,
    paid,
    balance: Math.max(0, total - paid),
    status: paid >= total ? ('Paid' as const) : paid > 0 ? ('Partial' as const) : ('Due' as const),
  };
};

/**
 * Compares an ISO date string or Date with a YYYY-MM-DD string
 */
export const isSameISODate = (isoString?: string | null, targetYMD?: string | null): boolean => {
  if (!isoString || !targetYMD) return false;
  try {
    const date = typeof isoString === 'string' ? parseISO(isoString) : isoString;
    if (!isValid(date)) return false;
    const ymd = format(date, 'yyyy-MM-dd');
    return ymd === targetYMD;
  } catch {
    return false;
  }
};

/**
 * Checks whether an ISO date string matches a search query like "oct 11", "11 oct", "october 11", "2026-10-11", "11/10"
 */
export const matchesDateSearch = (isoString?: string | null, query?: string | null): boolean => {
  if (!isoString || !query) return false;
  const q = query.trim().toLowerCase();
  if (!q) return false;
  try {
    const date = typeof isoString === 'string' ? parseISO(isoString) : isoString;
    if (!isValid(date)) return false;

    const variations = [
      format(date, 'yyyy-MM-dd'),
      format(date, 'd MMM yyyy').toLowerCase(),
      format(date, 'd MMMM yyyy').toLowerCase(),
      format(date, 'd MMM').toLowerCase(),
      format(date, 'MMM d').toLowerCase(),
      format(date, 'd MMMM').toLowerCase(),
      format(date, 'MMMM d').toLowerCase(),
      format(date, 'dd/MM/yyyy'),
      format(date, 'dd-MM-yyyy'),
      format(date, 'd/M/yyyy'),
      format(date, 'd-M-yyyy'),
      format(date, 'MMMM').toLowerCase(),
      format(date, 'MMM').toLowerCase(),
    ];

    return variations.some((v) => v.includes(q) || q.includes(v));
  } catch {
    return false;
  }
};

export const resolveDocumentUrl = (doc?: { url?: string; dataUrl?: string } | null): string => {
  if (!doc) return '';
  if (doc.url) {
    if (doc.url.startsWith('http://') || doc.url.startsWith('https://')) return doc.url;
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '')
      : 'http://localhost:4000';
    return `${envBase}${doc.url.startsWith('/') ? '' : '/'}${doc.url}`;
  }
  return doc.dataUrl || '';
};

/**
 * Returns an inline-safe URL for document preview.
 * Prefers local dataUrl if present (avoids network requests).
 * Appends /view to backend file endpoints so browser download managers (like IDM)
 * do not intercept inline PDF embedding.
 */
export const resolveInlineDocumentUrl = (doc?: { url?: string; dataUrl?: string } | null): string => {
  if (!doc) return '';
  if (doc.dataUrl) return doc.dataUrl;
  const url = resolveDocumentUrl(doc);
  if (url && url.includes('/api/v1/documents/files/') && !url.includes('/view')) {
    const [base, query] = url.split('?');
    return `${base}/view${query ? `?${query}` : ''}`;
  }
  return url;
};

/**
 * Resolves a reliable local Blob URL for inline PDF previewing.
 * Converts base64 data URLs or fetches remote document bytes into a local Blob URL
 * (blob:http://localhost:3000/...), which ensures same-origin rendering in Chrome,
 * eliminates CORS issues, and prevents IDM or other download managers from hijacking the PDF preview.
 */
export const fetchPdfBlobUrl = async (doc?: { url?: string; dataUrl?: string; name?: string } | null): Promise<string> => {
  if (!doc) return '';

  // 1. Priority: Local dataUrl (already in memory from upload)
  if (doc.dataUrl) {
    if (doc.dataUrl.startsWith('blob:')) return doc.dataUrl;
    if (doc.dataUrl.startsWith('data:')) {
      try {
        const res = await fetch(doc.dataUrl);
        const blob = await res.blob();
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        return URL.createObjectURL(pdfBlob);
      } catch {
        return doc.dataUrl;
      }
    }
    return doc.dataUrl;
  }

  const rawUrl = resolveDocumentUrl(doc);
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:')) return rawUrl;
  if (rawUrl.startsWith('data:')) {
    try {
      const res = await fetch(rawUrl);
      const blob = await res.blob();
      return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    } catch {
      return rawUrl;
    }
  }

  // 2. Remote signed URL: Request with view suffix and anti-hijack headers
  let requestUrl = rawUrl;
  if (rawUrl.includes('/api/v1/documents/files/')) {
    const [base, query] = rawUrl.split('?');
    if (!base.endsWith('/view')) {
      requestUrl = `${base}/view${query ? `?${query}` : ''}`;
    }
  }

  try {
    const headers = new Headers();
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('Accept', 'application/pdf, */*');
    const res = await fetch(requestUrl, { headers, credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    return URL.createObjectURL(pdfBlob);
  } catch {
    // Retry with rawUrl directly
    try {
      const res = await fetch(rawUrl, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    } catch {
      return resolveInlineDocumentUrl(doc);
    }
  }
};

export const downloadFile = async (url: string, filename: string): Promise<void> => {
  if (!url) return;
  const safeFilename = filename || 'download';

  // 1. Direct download for data URLs
  if (url.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // 2. Fetch as blob to bypass cross-origin browser download restriction
  try {
    const res = await fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

