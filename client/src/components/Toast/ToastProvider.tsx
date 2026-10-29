import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/utils/cn'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
  createdAt: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string
  removeToast: (id: string) => void
  clearAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastCounter = 0

const ICON_MAP: Record<ToastType, React.FC<{ className?: string }>> = {
  success: ({ className }) => <CheckCircle className={cn('w-5 h-5 text-success', className)} />,
  error: ({ className }) => <XCircle className={cn('w-5 h-5 text-danger', className)} />,
  info: ({ className }) => <Info className={cn('w-5 h-5 text-secondary', className)} />,
  warning: ({ className }) => <AlertTriangle className={cn('w-5 h-5 text-accent', className)} />,
}

const BORDER_MAP: Record<ToastType, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  info: 'border-l-secondary',
  warning: 'border-l-accent',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICON_MAP[toast.type]

  return (
    <div
      className={cn(
        'w-full max-w-sm bg-white rounded-lg shadow-dropdown border border-border',
        'border-l-4',
        BORDER_MAP[toast.type],
        'overflow-hidden animate-[slideIn_300ms_ease-out]'
      )}
      role="alert"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0 mt-0.5">
          <Icon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">{toast.description}</p>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-medium text-primary hover:text-primary-light transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (toast: Omit<Toast, 'id' | 'createdAt'>): string => {
      toastCounter += 1
      const id = `toast-${toastCounter}-${Date.now()}`
      const newToast: Toast = {
        ...toast,
        id,
        createdAt: Date.now(),
      }

      setToasts((prev) => [...prev, newToast])

      // Auto-dismiss
      const duration = toast.duration ?? 5000
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }

      return id
    },
    [removeToast]
  )

  const clearAll = useCallback(() => {
    setToasts([])
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          className={cn(
            'fixed z-[60] flex flex-col gap-2',
            // Desktop: bottom-right
            'bottom-4 right-4',
            // Mobile: bottom-center
            'sm:bottom-4 sm:right-4 sm:left-auto',
            'left-4'
          )}
        >
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}