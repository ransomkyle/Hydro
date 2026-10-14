import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { Inbox } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  render: (item: T) => React.ReactNode
  sortable?: boolean
  sortKey?: string
  width?: string
  hideOnMobile?: boolean
  align?: 'left' | 'center' | 'right'
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  rowKey: (item: T) => string | number
  loading?: boolean
  emptyState?: {
    icon?: LucideIcon
    title: string
    description?: string
    action?: { label: string; onClick: () => void }
  }
  pageSize?: number
  sort?: { key: string; direction: 'asc' | 'desc' }
  onSort?: (sort: { key: string; direction: 'asc' | 'desc' }) => void
  onRowClick?: (item: T) => void
  actions?: (item: T) => React.ReactNode
  stickyHeader?: boolean
  className?: string
}

function SortIcon({ direction }: { direction?: 'asc' | 'desc' }) {
  if (direction === 'asc') return <ChevronUp className="w-4 h-4" />
  if (direction === 'desc') return <ChevronDown className="w-4 h-4" />
  return <ChevronsUpDown className="w-4 h-4 text-text-secondary opacity-50" />
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-sm text-text-secondary">
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {[...Array(Math.min(totalPages, 7))].map((_, i) => {
          let pageNum: number
          if (totalPages <= 7) {
            pageNum = i + 1
          } else if (currentPage <= 4) {
            pageNum = i + 1
          } else if (currentPage >= totalPages - 3) {
            pageNum = totalPages - 6 + i
          } else {
            pageNum = currentPage - 3 + i
          }
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={cn(
                'w-8 h-8 rounded text-sm font-medium transition-colors',
                pageNum === currentPage
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-gray-100'
              )}
            >
              {pageNum}
            </button>
          )
        })}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  emptyState,
  pageSize = 20,
  sort,
  onSort,
  onRowClick,
  actions,
  stickyHeader = false,
  className,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)

  const localSort = sort

  const sortedData = useMemo(() => {
    if (!localSort) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[localSort.key]
      const bVal = (b as Record<string, unknown>)[localSort.key]
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return localSort.direction === 'asc' ? cmp : -cmp
    })
  }, [data, localSort])

  const totalPages = pageSize > 0 ? Math.ceil(sortedData.length / pageSize) : 1
  const paginatedData = pageSize > 0
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData

  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSort) return
    const sortKey = column.sortKey ?? column.key
    const isAsc = localSort?.key === sortKey && localSort.direction === 'asc'
    onSort({ key: sortKey, direction: isAsc ? 'desc' : 'asc' })
  }

  if (loading) {
    return <LoadingSkeleton variant="table" className={className} />
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyState?.icon ?? Inbox}
        title={emptyState?.title ?? 'No data'}
        description={emptyState?.description}
        action={emptyState?.action}
        className={className}
      />
    )
  }

  return (
    <div className={cn('bg-white rounded-lg border border-border overflow-hidden', className)}>
      {/* Desktop: Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={cn('border-b border-border bg-gray-50/80', stickyHeader && 'sticky top-0')}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary',
                    col.sortable && 'cursor-pointer select-none hover:text-text-primary transition-colors',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.width
                  )}
                  onClick={() => col.sortable && handleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <SortIcon
                        direction={
                          localSort?.key === (col.sortKey ?? col.key)
                            ? localSort.direction
                            : undefined
                        }
                      />
                    )}
                  </span>
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary w-16">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.map((item) => (
              <tr
                key={rowKey(item)}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-gray-50'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-sm text-text-primary whitespace-nowrap',
                      col.hideOnMobile && 'hidden sm:table-cell',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.render(item)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(item)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card layout */}
      <div className="sm:hidden divide-y divide-gray-100">
        {paginatedData.map((item) => (
          <div
            key={rowKey(item)}
            onClick={() => onRowClick?.(item)}
            className={cn(
              'p-4 space-y-2',
              onRowClick && 'cursor-pointer hover:bg-gray-50'
            )}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn(
                  'flex items-center justify-between',
                  col.hideOnMobile && 'hidden'
                )}
              >
                <span className="text-xs font-medium text-text-secondary">{col.header}</span>
                <span className="text-sm text-text-primary text-right">{col.render(item)}</span>
              </div>
            ))}
            {actions && (
              <div className="pt-2 border-t border-gray-100 flex justify-end" onClick={(e) => e.stopPropagation()}>
                {actions(item)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => {
          setCurrentPage(page)
        }}
      />
    </div>
  )
}