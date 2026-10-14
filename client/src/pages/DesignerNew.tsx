import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, User, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AppShell } from '@/components/AppShell'
import { useToast } from '@/components/Toast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { api } from '@/lib/api'
import type { Customer, Property } from '@/types/domain'

export function DesignerNewPage() {
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.customers.list()
      .then(setCustomers)
      .catch(() => addToast({ type: 'error', title: 'Failed to load customers' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedCustomerId) { setProperties([]); return }
    setProperties([])
    api.customers.properties.list(selectedCustomerId)
      .then(setProperties)
      .catch(() => addToast({ type: 'error', title: 'Failed to load properties' }))
  }, [selectedCustomerId])

  const handleCreate = async () => {
    if (!selectedCustomerId || !selectedPropertyId) return
    setCreating(true)
    try {
      const design = await api.designs.create({
        customerId: selectedCustomerId,
        propertyId: selectedPropertyId,
      })
      navigate(`/designer/${design.id}`)
    } catch {
      addToast({ type: 'error', title: 'Failed to create design' })
    } finally {
      setCreating(false)
    }
  }

  if (!authLoading && !user) return null
  if (authLoading || loading) return <LoadingSkeleton variant="page" />

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)
  const selectedProperty = properties.find(p => p.id === selectedPropertyId)

  return (
    <AppShell
      currentPath="/designer/new"
      onNavigate={path => navigate(path)}
      user={{ name: user ? `${user.firstName} ${user.lastName}` : '', email: user?.email || '' }}
      orgName="SprinkSoft"
      breadcrumbs={[{ label: 'Designer', href: '/designer' }, { label: 'New Design' }]}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">New Design</h1>
          <p className="text-sm text-text-secondary mt-1">Select a customer and property to begin designing</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-6 space-y-5">
          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              <User className="w-4 h-4 inline mr-1.5" /> Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => { setSelectedCustomerId(e.target.value); setSelectedPropertyId('') }}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select a customer...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
          {/* Property */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              <MapPin className="w-4 h-4 inline mr-1.5" /> Property
            </label>
            <select
              value={selectedPropertyId}
              onChange={e => setSelectedPropertyId(e.target.value)}
              disabled={!selectedCustomerId || properties.length === 0}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-text-secondary"
            >
              <option value="">
                {!selectedCustomerId ? 'Select a customer first' : properties.length === 0 ? 'No properties found' : 'Select a property...'}
              </option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.address} {p.city ? `— ${p.city}, ${p.state}` : ''}
                </option>
              ))}
            </select>
          </div>
          {/* Preview */}
          {selectedProperty && (
            <div className="bg-surface rounded-lg p-3 text-sm text-text-secondary space-y-1">
              <p><strong>Customer:</strong> {selectedCustomer?.firstName} {selectedCustomer?.lastName}</p>
              <p><strong>Address:</strong> {selectedProperty.address}</p>
              {selectedProperty.city && <p><strong>Location:</strong> {selectedProperty.city}, {selectedProperty.state} {selectedProperty.zip}</p>}
              {selectedProperty.lat && <p className="text-xs text-text-secondary">Lat: {selectedProperty.lat}, Lng: {selectedProperty.lng}</p>}
            </div>
          )}
          <button
            type="button"
            disabled={!selectedCustomerId || !selectedPropertyId || creating}
            onClick={handleCreate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Start Designing'}
            {!creating && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </AppShell>
  )
}