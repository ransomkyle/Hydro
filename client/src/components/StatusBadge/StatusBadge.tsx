import type { JobStatus, DesignStatus } from '@/types/domain'
import {
  Calendar,
  MapPin,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  FileText,
  AlertTriangle,
  PencilRuler,
  Send,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'

export type StatusBadgeSize = 'sm' | 'md' | 'lg'

/** Any status value the badge can render: job lifecycle or AI-designer lifecycle. */
export type StatusValue = JobStatus | DesignStatus

interface StatusBadgeProps {
  status: StatusValue
  size?: StatusBadgeSize
  showIcon?: boolean
  label?: string
  className?: string
}

const STATUS_CONFIG: Record<StatusValue, { color: string; icon: LucideIcon; label: string }> = {
  scheduled:    { color: 'bg-blue-100 text-blue-800',  icon: Calendar,      label: 'Scheduled' },
  en_route:    { color: 'bg-amber-100 text-amber-800', icon: MapPin,       label: 'En Route' },
  in_progress: { color: 'bg-green-100 text-green-800', icon: Play,         label: 'In Progress' },
  on_hold:     { color: 'bg-orange-100 text-orange-800', icon: Pause,      label: 'On Hold' },
  completed:   { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle, label: 'Completed' },
  cancelled:   { color: 'bg-red-100 text-red-800',     icon: XCircle,      label: 'Cancelled' },
  draft:       { color: 'bg-gray-100 text-gray-600',   icon: FileText,     label: 'Draft' },
  emergency:   { color: 'bg-purple-100 text-purple-800', icon: AlertTriangle, label: 'Emergency' },
  // AI Irrigation Designer lifecycle
  designed:    { color: 'bg-indigo-100 text-indigo-800', icon: PencilRuler, label: 'Designed' },
  quoted:      { color: 'bg-amber-100 text-amber-800',  icon: Send,        label: 'Quoted' },
  approved:    { color: 'bg-emerald-100 text-emerald-800', icon: ThumbsUp, label: 'Approved' },
}

const SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
  lg: 'px-3 py-1.5 text-base gap-2',
}

const ICON_CLASSES: Record<StatusBadgeSize, string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

export function StatusBadge({
  status,
  size = 'md',
  showIcon = true,
  label,
  className,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.color,
        SIZE_CLASSES[size],
        className
      )}
    >
      {showIcon && <Icon className={ICON_CLASSES[size]} aria-hidden="true" />}
      <span>{label ?? config.label}</span>
    </span>
  )
}

export { STATUS_CONFIG }