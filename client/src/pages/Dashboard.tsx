import { useState } from 'react'
import { Users, DollarSign, Clock, Truck } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { StatusBadge } from '@/components/StatusBadge'
import { KPICard } from '@/components/KPICard'
import { DataTable } from '@/components/DataTable'
import { SearchInput } from '@/components/SearchInput'
import type { Job } from '@/types/domain'


const DEMO_JOBS: Job[] = [
  { id: '1', orgId: 'org1', propertyId: 'p1', status: 'in_progress', jobType: 'installation', scheduledStart: '2026-06-15T08:00:00Z', scheduledEnd: '2026-06-15T11:00:00Z', createdAt: '2026-06-10' },
  { id: '2', orgId: 'org1', propertyId: 'p2', status: 'scheduled', jobType: 'repair', scheduledStart: '2026-06-15T10:00:00Z', scheduledEnd: '2026-06-15T12:00:00Z', createdAt: '2026-06-11' },
  { id: '3', orgId: 'org1', propertyId: 'p3', status: 'completed', jobType: 'winterization', scheduledStart: '2026-06-14T09:00:00Z', scheduledEnd: '2026-06-14T11:00:00Z', createdAt: '2026-06-09' },
  { id: '4', orgId: 'org1', propertyId: 'p4', status: 'emergency', jobType: 'repair', scheduledStart: '2026-06-15T13:00:00Z', scheduledEnd: '2026-06-15T14:00:00Z', createdAt: '2026-06-15' },
]

export function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <AppShell
      currentPath="/dashboard"
      onNavigate={path => window.location.href = path}
      user={{ name: 'Alice Adams', email: 'alice@sprinksoft.com' }}
      orgName="GreenWay Irrigation"
      notificationCount={3}
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Jobs Today" value="8" icon={Clock} trend={{ direction: 'up', percentage: 12, label: 'vs yesterday' }} variant="primary" />
          <KPICard label="Revenue (Week)" value="$12,400" icon={DollarSign} trend={{ direction: 'up', percentage: 8, label: 'vs last week' }} variant="success" />
          <KPICard label="Open Tickets" value="3" icon={Users} trend={{ direction: 'down', percentage: 25, label: 'vs yesterday' }} variant="warning" />
          <KPICard label="Techs On Route" value="4/5" icon={Truck} variant="default" />
        </div>
        <div className="max-w-md">
          <SearchInput placeholder="Search jobs..." value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Today's Jobs</h2>
          <DataTable
            data={DEMO_JOBS.filter(j => j.jobType.toLowerCase().includes(searchQuery.toLowerCase()))}
            columns={[
              { key: 'status', header: 'Status', render: (j: Job) => <StatusBadge status={j.status} size="sm" />, sortable: true },
              { key: 'jobType', header: 'Type', render: (j: Job) => <span className="capitalize">{j.jobType}</span>, sortable: true, hideOnMobile: true },
              { key: 'scheduledStart', header: 'Date', render: (j: Job) => new Date(j.scheduledStart).toLocaleDateString(), sortable: true },
              { key: 'scheduledEnd', header: 'Time', render: (j: Job) => `${new Date(j.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, hideOnMobile: true },
            ]}
            rowKey={(j: Job) => j.id}
            pageSize={10}
          />
        </div>
      </div>
    </AppShell>
  )
}