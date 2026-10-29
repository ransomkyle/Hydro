import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Ruler } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AppShell } from '@/components/AppShell'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { SearchInput } from '@/components/SearchInput'
import { EmptyState } from '@/components/EmptyState'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import type { Design } from '@/types/domain'
import type { Column } from '@/components/DataTable'


export function DesignerListPage() {
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [designs, setDesigns] = useState<Design[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.designs.list()
      .then(setDesigns)
      .catch(() => addToast({ type: 'error', title: 'Failed to load designs' }))
      .finally(() => setLoading(false))
  }, [])

  const filtered = designs.filter(d =>
    !search ||
    d.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    d.propertyAddress?.toLowerCase().includes(search.toLowerCase())
  )

  const columns: Column<Design>[] = [
    { key: 'customerName', header: 'Customer', render: d => d.customerName || '—', sortable: true },
    { key: 'propertyAddress', header: 'Property', render: d => <span className="text-xs">{d.propertyAddress || '—'}</span>, sortable: true, hideOnMobile: true },
    { key: 'zones', header: 'Zones', render: d => d.zones?.length ?? 0, sortable: true },
    { key: 'status', header: 'Status', render: d => <StatusBadge status={d.status} size="sm" />, sortable: true },
    { key: 'createdAt', header: 'Created', render: d => new Date(d.createdAt).toLocaleDateString(), sortable: true, hideOnMobile: true },
  ]

  if (!authLoading && !user) return null
  if (authLoading || loading) return <LoadingSkeleton variant="page" />

  return (
    <AppShell
      currentPath="/designer"
      onNavigate={path => navigate(path)}
      user={{ name: user ? `${user.firstName} ${user.lastName}` : '', email: user?.email || '' }}
      orgName="SprinkSoft"
      breadcrumbs={[{ label: 'Designer' }]}
    >
      <div className="space-y-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Irrigation Designer</h1>
            <p className="text-sm text-text-secondary mt-1">Design irrigation systems and generate quotes</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/designer/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Design
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search designs..." />
        {filtered.length === 0 && !loading ? (
          <EmptyState
            icon={Ruler}
            title="No designs yet"
            description="Create your first irrigation system design"
            action={{ label: 'New Design', onClick: () => navigate('/designer/new') }}
          />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            rowKey={d => d.id}
            onRowClick={d => navigate(`/designer/${d.id}`)}
            pageSize={15}
          />
        )}
      </div>
    </AppShell>
  )
}