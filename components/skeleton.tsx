import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded animate-skeleton', className)} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-forge-border p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}
