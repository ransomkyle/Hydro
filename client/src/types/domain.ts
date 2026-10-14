// Domain Types for SprinkSoft

export type JobStatus =
  | 'scheduled'
  | 'en_route'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled'
  | 'draft'
  | 'emergency'

export type JobType =
  | 'installation'
  | 'winterization'
  | 'spring_activation'
  | 'repair'
  | 'maintenance'

export type UserRole = 'admin' | 'scheduler' | 'technician'

export type SubscriptionTier = 'Starter' | 'Pro' | 'Enterprise'

export interface Organization {
  id: string
  name: string
  subscriptionTier: SubscriptionTier
}

export interface User {
  id: string
  orgId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  phone?: string
  isActive: boolean
  avatar?: string
}

export interface Customer {
  id: string
  orgId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
  properties?: Property[]
  createdAt: string
}

export interface Property {
  id: string
  customerId: string
  orgId: string
  streetAddress: string
  city: string
  state: string
  zipCode: string
  latitude?: number
  longitude?: number
  irrigationZonesCount: number
  waterShutoffLocation?: string
}

export interface Job {
  id: string
  orgId: string
  propertyId: string
  assignedTechId?: string
  assignedTech?: User
  property?: Property
  customer?: Customer
  status: JobStatus
  jobType: JobType
  scheduledStart: string
  scheduledEnd: string
  actualStart?: string
  actualEnd?: string
  notes?: string
  routeSequence?: number
  partsUsed?: JobPartUsed[]
  createdAt: string
}

export interface Part {
  id: string
  orgId: string
  sku: string
  name: string
  description?: string
  category: string
  unitPrice: number
  costPrice: number
}

export interface Warehouse {
  id: string
  orgId: string
  name: string
  isMobile: boolean
  assignedUserId?: string
}

export interface StockLevel {
  partId: string
  warehouseId: string
  quantity: number
  minAlertThreshold: number
  part?: Part
  warehouse?: Warehouse
}

export interface JobPartUsed {
  id: string
  jobId: string
  partId: string
  warehouseId: string
  quantityUsed: number
  unitPriceCharged: number
  part?: Part
}

export interface Quote {
  id: string
  orgId: string
  propertyId: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  designData?: Record<string, unknown>
  totalAmount: number
  createdAt: string
}

export interface Invoice {
  id: string
  orgId: string
  customerId: string
  jobId?: string
  quoteId?: string
  status: 'unpaid' | 'paid' | 'void'
  totalAmount: number
  taxAmount: number
  dueDate: string
  createdAt: string
}

// Navigation
export interface NavItem {
  id: string
  label: string
  path: string
  icon: string
  badge?: number
  hidden?: boolean
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SortState {
  key: string
  direction: 'asc' | 'desc'
}

export interface FilterState {
  search?: string
  status?: string[]
  dateRange?: { start: string; end: string }
  techId?: string
  priority?: string
}

// ── AI Irrigation Designer Types ─────────────────────────────────────
export type SprinklerType = 'spray' | 'rotor' | 'drip'
export type DesignStatus = 'draft' | 'designed' | 'quoted' | 'approved'

export interface DesignZone {
  label: string
  sprinklerType: SprinklerType
  areaSqft: number
  headCount: number
  pipeLengthFt: number
  vertices: [number, number][] // [lng, lat] polygon vertices
  notes?: string
}

export interface Design {
  id: string
  orgId: string
  customerId: string
  propertyId: string
  status: DesignStatus
  zones: DesignZone[]
  createdAt: string
  updatedAt: string
  // joined fields
  customerName?: string
  propertyAddress?: string
  propertyLat?: number
  propertyLng?: number
}

export type BomCategory = 'Heads' | 'Pipe' | 'Fittings' | 'Valves' | 'Electrical' | 'Misc'

export interface BomItem {
  partName: string
  category: BomCategory
  quantity: number
  unitCost: number
  totalCost: number
}

export interface BomResponse {
  items: BomItem[]
  laborCost: number
  markupPercent: number
  subtotal: number
  grandTotal: number
}

export interface DesignQuoteResponse {
  quoteId: string
  pdfUrl: string
}