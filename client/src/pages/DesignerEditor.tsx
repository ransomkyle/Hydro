import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  Plus, Trash2, Save, FileText, Download, ChevronLeft,
  Droplets, Zap, Wind, X, Check,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/Toast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { api } from '@/lib/api'
import type { Design, DesignZone, SprinklerType, BomResponse } from '@/types/domain'

// @ts-ignore - Mapbox token for demo
mapboxgl.accessToken = (window as any).MAPBOX_TOKEN || 'pk.eyJ1Ijoic3ByaW5rc29mdCIsImEiOiJjbHNwcm5rIn0.demo'

const ZONE_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
const COVERAGE_RATES: Record<SprinklerType, number> = { spray: 1500, rotor: 2500, drip: 800 } // sqft per head
const SPRINKLER_LABELS: Record<SprinklerType, string> = { spray: 'Spray', rotor: 'Rotor', drip: 'Drip' }

function calculatePolygonArea(vertices: [number, number][]): number {
  // Shoelace formula on lat/lng gives approximate area in sq degrees
  // Convert to approximate sqft using 111320 meters per degree * 3.28084 ft/meter
  let area = 0
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i]
    const [x2, y2] = vertices[(i + 1) % vertices.length]
    area += x1 * y2 - x2 * y1
  }
  area = Math.abs(area) / 2
  // Convert sq degrees to sqft (rough approximation)
  const metersPerDegLat = 111320
  const avgLat = vertices.reduce((s, v) => s + v[1], 0) / vertices.length
  const metersPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180)
  const sqMetersPerSqDeg = metersPerDegLat * metersPerDegLng
  return area * sqMetersPerSqDeg * 10.7639 // convert to sqft
}

export function DesignerEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [design, setDesign] = useState<Design | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Drawing state
  const [drawMode, setDrawMode] = useState(false)
  const [currentVertices, setCurrentVertices] = useState<[number, number][]>([])

  // Zone editing
  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number | null>(null)
  const [editingZone, setEditingZone] = useState<DesignZone | null>(null)

  // BOM
  const [bom, setBom] = useState<BomResponse | null>(null)
  const [generatingBom, setGeneratingBom] = useState(false)
  const [generatingQuote, setGeneratingQuote] = useState(false)

  // Confirm delete zone
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Load design
  useEffect(() => {
    if (!id) return
    api.designs.get(id)
      .then(d => {
        setDesign(d)
        if (d.zones && d.zones.length > 0) setSelectedZoneIdx(0)
      })
      .catch(() => addToast({ type: 'error', title: 'Failed to load design' }))
      .finally(() => setLoading(false))
  }, [id])

  // Initialize map
  useEffect(() => {
    if (!design || !mapContainerRef.current || mapRef.current) return
    const lat = design.propertyLat || 47.6062
    const lng = design.propertyLng || -122.3321

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [lng, lat],
      zoom: 19,
      pitch: 45,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-right')

    map.on('load', () => {
      // Add existing zones
      if (design.zones) design.zones.forEach((zone, i) => addZoneLayer(map, zone.vertices, i))
    })

    map.on('click', (e) => {
      if (!drawMode) return
      const newVertices = [...currentVertices, [e.lngLat.lng, e.lngLat.lat] as [number, number]]
      setCurrentVertices(newVertices)
      updateDrawingLayer(map, newVertices)
    })

    mapRef.current = map
    return () => { map.remove() }
  }, [design?.id])

  // Update existing zone layers when design changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !design?.zones) return
    // Clear and re-add all zone layers
    design.zones.forEach((zone, i) => {
      const sourceId = `zone-${i}`
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [zone.vertices.map(v => [v[0], v[1]])] },
        })
      } else {
        addZoneLayer(map, zone.vertices, i)
      }
    })
  }, [design?.zones])

  // Sync editingZone when selectedZoneIdx changes
  useEffect(() => {
    if (selectedZoneIdx !== null && design?.zones[selectedZoneIdx]) {
      setEditingZone({ ...design.zones[selectedZoneIdx] })
    } else {
      setEditingZone(null)
    }
  }, [selectedZoneIdx, design?.zones])

  // ── Zone Drawing ──────────────────────────────────────────────────
  const addZoneLayer = (map: mapboxgl.Map, vertices: [number, number][], idx: number) => {
    if (vertices.length < 3) return
    const sourceId = `zone-${idx}`
    const fillId = `zone-fill-${idx}`
    const outlineId = `zone-outline-${idx}`
    const color = ZONE_COLORS[idx % ZONE_COLORS.length]

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [vertices.map(v => [v[0], v[1]])] },
      })
      return
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [vertices.map(v => [v[0], v[1]])] } },
    })

    map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': color, 'fill-opacity': 0.3 } })
    map.addLayer({ id: outlineId, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': 2 } })

    // Click handler for zone selection
    map.on('click', fillId, () => setSelectedZoneIdx(idx))
    map.on('mouseenter', fillId, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', fillId, () => { map.getCanvas().style.cursor = drawMode ? 'crosshair' : '' })
  }

  const updateDrawingLayer = (map: mapboxgl.Map, vertices: [number, number][]) => {
    const sourceId = 'drawing'
    if (vertices.length < 2) {
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData({
          type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] },
        })
      }
      return
    }

    const geojson = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: vertices.map(v => [v[0], v[1]]) },
    }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: geojson })
      map.addLayer({ id: 'drawing-line', type: 'line', source: sourceId, paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [4, 2] } })
      // Also add vertex dots
      map.addLayer({ id: 'drawing-dots', type: 'circle', source: sourceId, paint: { 'circle-radius': 5, 'circle-color': '#f59e0b' } })
    } else {
      (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geojson)
    }
  }

  const finishDrawing = () => {
    if (currentVertices.length < 3) {
      addToast({ type: 'error', title: 'Need at least 3 points for a zone' })
      return
    }
    const area = calculatePolygonArea(currentVertices)
    const newZone: DesignZone = {
      label: `Zone ${(design?.zones?.length ?? 0) + 1}`,
      sprinklerType: 'spray',
      areaSqft: Math.round(area),
      headCount: Math.max(1, Math.round(area / COVERAGE_RATES.spray)),
      pipeLengthFt: Math.round(Math.sqrt(area) * 2),
      vertices: currentVertices,
    }
    const updated = { ...design!, zones: [...(design?.zones || []), newZone] }
    setDesign(updated)
    setCurrentVertices([])
    setDrawMode(false)
    setSelectedZoneIdx(updated.zones.length - 1)

    // Clear drawing layer
    const map = mapRef.current
    if (map) {
      const sourceId = 'drawing'
      if (map.getLayer('drawing-dots')) map.removeLayer('drawing-dots')
      if (map.getLayer('drawing-line')) map.removeLayer('drawing-line')
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }

  const cancelDrawing = () => {
    setDrawMode(false)
    setCurrentVertices([])
    const map = mapRef.current
    if (map) {
      if (map.getLayer('drawing-dots')) map.removeLayer('drawing-dots')
      if (map.getLayer('drawing-line')) map.removeLayer('drawing-line')
      if (map.getSource('drawing')) map.removeSource('drawing')
    }
  }

  // ── Zone Management ────────────────────────────────────────────────
  const updateZoneConfig = (field: keyof DesignZone, value: any) => {
    if (!editingZone || selectedZoneIdx === null || !design) return
    const updated = { ...editingZone, [field]: value }

    // Auto-recalculate when sprinkler type or area changes
    if (field === 'sprinklerType') {
      updated.headCount = Math.max(1, Math.round(updated.areaSqft / COVERAGE_RATES[value as SprinklerType]))
    }
    if (field === 'areaSqft') {
      updated.headCount = Math.max(1, Math.round(value / COVERAGE_RATES[updated.sprinklerType]))
      updated.pipeLengthFt = Math.round(Math.sqrt(value) * 2)
    }

    setEditingZone(updated)
    const zones = [...design.zones]
    zones[selectedZoneIdx] = updated
    setDesign({ ...design, zones })
  }

  const deleteZone = (idx: number) => {
    if (!design) return
    const map = mapRef.current
    const sourceId = `zone-${idx}`
    if (map) {
      if (map.getLayer(`zone-fill-${idx}`)) map.removeLayer(`zone-fill-${idx}`)
      if (map.getLayer(`zone-outline-${idx}`)) map.removeLayer(`zone-outline-${idx}`)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    const zones = design.zones.filter((_, i) => i !== idx)
    setDesign({ ...design, zones })
    setSelectedZoneIdx(null)
    setDeleteConfirm(null)
  }

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!design) return
    setSaving(true)
    try {
      const updated = await api.designs.update(design.id, { zones: design.zones })
      setDesign(updated)
      addToast({ type: 'success', title: 'Design saved' })
    } catch {
      addToast({ type: 'error', title: 'Failed to save design' })
    } finally {
      setSaving(false)
    }
  }

  // ── BOM ────────────────────────────────────────────────────────────
  const handleGenerateBom = async () => {
    if (!design) return
    setGeneratingBom(true)
    try {
      const result = await api.designs.bom(design.id)
      setBom(result)
    } catch {
      addToast({ type: 'error', title: 'Failed to generate BOM' })
    } finally {
      setGeneratingBom(false)
    }
  }

  // ── Quote ──────────────────────────────────────────────────────────
  const handleGenerateQuote = async () => {
    if (!design) return
    setGeneratingQuote(true)
    try {
      const result = await api.designs.quote(design.id)
      addToast({ type: 'success', title: 'Quote generated!' })
      window.open(result.pdfUrl, '_blank')
    } catch {
      addToast({ type: 'error', title: 'Failed to generate quote' })
    } finally {
      setGeneratingQuote(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (!authLoading && !user) return null
  if (authLoading || loading) return <LoadingSkeleton variant="page" />
  if (!design) return <LoadingSkeleton variant="page" />

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="h-14 border-b border-border bg-white flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/designer')} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{design.customerName || 'Design'} — {design.propertyAddress || 'Property'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!drawMode ? (
            <button type="button" onClick={() => setDrawMode(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark">
              <Plus className="w-3.5 h-3.5" /> Add Zone
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-warning font-medium">{currentVertices.length} points</span>
              <button type="button" onClick={finishDrawing} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-success text-white rounded-lg text-xs font-medium">
                <Check className="w-3.5 h-3.5" /> Finish
              </button>
              <button type="button" onClick={cancelDrawing} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-200 text-text-primary rounded-lg text-xs font-medium">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          )}
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main content: Map + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="absolute inset-0" />
          {drawMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-warning text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg z-10">
              Click to place zone vertices — at least 3 needed
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l border-border bg-white overflow-y-auto shrink-0 flex flex-col">
          {/* Zone list */}
          <div className="p-3 border-b border-border">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Zones ({design.zones?.length || 0})</h3>
            <div className="space-y-1">
              {(!design.zones || design.zones.length === 0) && (
                <p className="text-xs text-text-secondary py-2">No zones yet. Click "Add Zone" to start drawing.</p>
              )}
              {design.zones?.map((zone, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedZoneIdx(i)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                    selectedZoneIdx === i ? 'bg-primary/10 border border-primary/30' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                  <span className="flex-1 truncate font-medium">{zone.label}</span>
                  <span className="text-text-secondary">{SPRINKLER_LABELS[zone.sprinklerType]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Zone config */}
          {editingZone && selectedZoneIdx !== null && (
            <div className="p-3 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Zone Config</h3>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(selectedZoneIdx)}
                  className="p-1 rounded hover:bg-red-50 text-text-secondary hover:text-danger transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Name</label>
                <input
                  type="text"
                  value={editingZone.label}
                  onChange={e => updateZoneConfig('label', e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Sprinkler Type</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['spray', 'rotor', 'drip'] as SprinklerType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateZoneConfig('sprinklerType', t)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        editingZone.sprinklerType === t ? 'bg-primary text-white' : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                      }`}
                    >
                      {t === 'spray' && <Droplets className="w-3 h-3 inline mr-0.5" />}
                      {t === 'rotor' && <Zap className="w-3 h-3 inline mr-0.5" />}
                      {t === 'drip' && <Wind className="w-3 h-3 inline mr-0.5" />}
                      {SPRINKLER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Area (sqft)</label>
                  <input
                    type="number"
                    value={editingZone.areaSqft}
                    onChange={e => updateZoneConfig('areaSqft', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Heads</label>
                  <input
                    type="number"
                    value={editingZone.headCount}
                    onChange={e => updateZoneConfig('headCount', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Pipe Length (ft)</label>
                <input
                  type="number"
                  value={editingZone.pipeLengthFt}
                  onChange={e => updateZoneConfig('pipeLengthFt', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Notes</label>
                <textarea
                  value={editingZone.notes || ''}
                  onChange={e => updateZoneConfig('notes', e.target.value)}
                  rows={2}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs resize-none"
                  placeholder="Zone notes..."
                />
              </div>
            </div>
          )}

          {/* BOM Preview */}
          <div className="p-3 border-b border-border">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Bill of Materials</h3>
            {!bom ? (
              <button
                type="button"
                onClick={handleGenerateBom}
                disabled={generatingBom || !design.zones?.length}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark disabled:opacity-50"
              >
                {generatingBom ? 'Generating...' : 'Generate BOM'}
                <FileText className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="space-y-2">
                {bom.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{item.partName}</span>
                      <span className="text-text-secondary">{item.category} × {item.quantity}</span>
                    </div>
                    <span className="font-medium shrink-0 ml-2">{formatCurrency(item.totalCost)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-xs"><span>Subtotal</span><span className="font-medium">{formatCurrency(bom.subtotal)}</span></div>
                  <div className="flex justify-between text-xs"><span>Labor</span><span className="font-medium">{formatCurrency(bom.laborCost)}</span></div>
                  <div className="flex justify-between text-xs"><span>Markup ({bom.markupPercent}%)</span><span className="font-medium">{formatCurrency(bom.grandTotal - bom.subtotal - bom.laborCost)}</span></div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(bom.grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quote Generation */}
          <div className="p-3">
            <button
              type="button"
              onClick={handleGenerateQuote}
              disabled={generatingQuote || !design.zones?.length}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-success text-white rounded-lg text-sm font-medium hover:bg-success/90 disabled:opacity-50"
            >
              {generatingQuote ? 'Generating Quote...' : 'Generate Quote PDF'}
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete zone confirm */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm !== null && deleteZone(deleteConfirm)}
        title="Delete Zone"
        message="Are you sure you want to delete this zone? This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  )
}