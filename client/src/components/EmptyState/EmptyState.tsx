import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-text-secondary" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors',
            action.variant === 'secondary'
              ? 'bg-gray-100 text-text-primary hover:bg-gray-200'
              : 'bg-primary text-white hover:bg-primary-dark'
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}