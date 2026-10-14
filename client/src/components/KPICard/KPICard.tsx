import { cn } from '@/utils/cn'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'

interface KPICardProps {
  label: string
  value: string
  icon?: LucideIcon
  trend?: {
    direction: 'up' | 'down' | 'neutral'
    percentage: number
    label?: string
  }
  onClick?: () => void
  loading?: boolean
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

const VARIANT_CLASSES = {
  default: 'border-border bg-card',
  primary: 'border-primary/20 bg-primary/5',
  success: 'border-success/20 bg-success/5',
  warning: 'border-accent/20 bg-accent/5',
  danger: 'border-danger/20 bg-danger/5',
}

const ICON_VARIANT_CLASSES = {
  default: 'text-text-secondary',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-accent',
  danger: 'text-danger',
}

function TrendIndicator({ trend }: { trend: NonNullable<KPICardProps['trend']> }) {
  const Icon = trend.direction === 'up'
    ? TrendingUp
    : trend.direction === 'down'
    ? TrendingDown
    : Minus

  const color = trend.direction === 'up'
    ? 'text-success'
    : trend.direction === 'down'
    ? 'text-danger'
    : 'text-text-secondary'

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', color)}>
      <Icon className="w-3 h-3" />
      <span>{trend.percentage}%</span>
      {trend.label && <span className="text-text-secondary ml-1">{trend.label}</span>}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-gray-200 rounded w-1/2" />
      <div className="h-7 bg-gray-200 rounded w-2/3" />
      <div className="h-3 bg-gray-200 rounded w-1/3" />
    </div>
  )
}

export function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  onClick,
  loading = false,
  variant = 'default',
}: KPICardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-4 text-left w-full transition-all duration-200',
        VARIANT_CLASSES[variant],
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        !onClick && 'cursor-default'
      )}
      disabled={loading}
    >
      {loading ? (
        <Skeleton />
      ) : (
        <>
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              {label}
            </span>
            {Icon && (
              <Icon className={cn('w-5 h-5', ICON_VARIANT_CLASSES[variant])} />
            )}
          </div>
          <div className="text-2xl font-bold text-text-primary mb-1">
            {value}
          </div>
          {trend && <TrendIndicator trend={trend} />}
        </>
      )}
    </button>
  )
}