import { cn } from '@/utils/cn'

type SkeletonVariant = 'text' | 'card' | 'table' | 'avatar' | 'chart'

interface LoadingSkeletonProps {
  variant?: SkeletonVariant
  count?: number
  className?: string
}

function TextSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
      <div className="h-3 bg-gray-200 rounded w-5/6 animate-pulse" />
      <div className="h-3 bg-gray-200 rounded w-4/6 animate-pulse" />
    </div>
  )
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-lg border border-border p-4 animate-pulse', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="w-5 h-5 bg-gray-200 rounded" />
      </div>
      <div className="h-7 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-20" />
    </div>
  )
}

function TableSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-4 p-3">
        <div className="h-4 bg-gray-200 rounded flex-1 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 p-3 border-t border-gray-100">
          <div className="h-4 bg-gray-100 rounded flex-1 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-20 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-24 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-16 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function AvatarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 animate-pulse', className)}>
      <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-200 rounded w-32" />
        <div className="h-2.5 bg-gray-200 rounded w-20" />
      </div>
    </div>
  )
}

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-end gap-2 h-32 animate-pulse', className)}>
      {[40, 65, 45, 80, 55, 90, 70, 50, 85, 60].map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-gray-200 rounded-t"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

const VARIANT_MAP: Record<SkeletonVariant, React.FC<{ className?: string }>> = {
  text: TextSkeleton,
  card: CardSkeleton,
  table: TableSkeleton,
  avatar: AvatarSkeleton,
  chart: ChartSkeleton,
}

export function LoadingSkeleton({
  variant = 'text',
  count = 1,
  className,
}: LoadingSkeletonProps) {
  const SkeletonComponent = VARIANT_MAP[variant]

  if (count === 1) {
    return <SkeletonComponent className={className} />
  }

  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <SkeletonComponent key={i} className={className} />
      ))}
    </div>
  )
}