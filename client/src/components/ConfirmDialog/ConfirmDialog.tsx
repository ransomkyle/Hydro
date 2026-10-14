import { type ReactNode, useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string | ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger' | 'warning'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  icon?: LucideIcon
}

const CONFIRM_BUTTON_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-dark focus:ring-primary/30',
  danger: 'bg-danger text-white hover:bg-red-700 focus:ring-red-300',
  warning: 'bg-accent text-white hover:bg-amber-600 focus:ring-amber-300',
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
  destructive = false,
  icon: Icon = AlertTriangle,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus the confirm button when opened
  useEffect(() => {
    if (open && confirmRef.current) {
      setTimeout(() => confirmRef.current?.focus(), 100)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative w-full max-w-md bg-white rounded-xl shadow-modal',
          'animate-[fadeIn_200ms_ease-out]'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            {destructive && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Icon className="w-5 h-5 text-danger" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-dialog-title"
                className={cn(
                  'text-lg font-semibold text-text-primary',
                  destructive && 'text-danger'
                )}
              >
                {title}
              </h2>
              <div className="mt-2 text-sm text-text-secondary leading-relaxed">
                {message}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-text-primary bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              CONFIRM_BUTTON_CLASSES[confirmVariant]
            )}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}