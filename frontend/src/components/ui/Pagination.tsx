import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronUp } from 'lucide-react';
import { Button } from './Button';

export interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  style?: CSSProperties;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  style,
}: TablePaginationProps) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  const [isOpen, setIsOpen] = useState(false);
  const dropupRef = useRef<HTMLDivElement>(null);

  const options = Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropupRef.current && !dropupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="table-footer" style={style}>
      <div className="pagination-left">
        <span className="pagination-summary">Showing {start}–{end} of {total}</span>
        <div className="pagination-size-container" ref={dropupRef}>
          <span className="pagination-size-label">Rows per page:</span>
          <div className="pagination-dropup-wrapper">
            <button
              type="button"
              className={`pagination-dropup-trigger ${isOpen ? 'active' : ''}`}
              onClick={() => setIsOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              aria-label="Rows per page"
            >
              <span>{pageSize}</span>
              <ChevronUp size={13} className={`pagination-dropup-chevron ${isOpen ? 'open' : ''}`} />
            </button>
            {isOpen && (
              <div className="pagination-dropup-menu" role="listbox">
                {options.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="option"
                    aria-selected={size === pageSize}
                    className={`pagination-dropup-item ${size === pageSize ? 'selected' : ''}`}
                    onClick={() => {
                      onPageSizeChange(size);
                      onPageChange(1);
                      setIsOpen(false);
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="button-row">
        <Button
          variant="secondary"
          size="small"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <span className="pagination-current-page">
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="small"
          disabled={page >= pages}
          onClick={() => onPageChange(Math.min(pages, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function usePagination<T>(items: T[], defaultPageSize = 5) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pages) {
      setPage(pages);
    }
  }, [page, pages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pages,
    total,
    pagedItems,
  };
}
