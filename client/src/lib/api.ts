const API_BASE = '/api'


async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

import type {
  Customer, Property, Job, User, Part, Warehouse, StockLevel, Quote, Invoice,
  Design, DesignZone, BomResponse, DesignQuoteResponse,
} from '@/types/domain'

export interface AuthUser {
  id: string
  orgId: string
  email: string
  firstName: string
  lastName: string
  role: string
}

export interface RegisterPayload {
  companyName: string
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const api = {
  auth: {
    register: (payload: RegisterPayload) =>
      request<AuthUser>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
    login: (payload: LoginPayload) =>
      request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
    me: () => request<AuthUser>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },
  customers: {
    list: () => request<Customer[]>('/customers'),
    search: (q: string) => request<Customer[]>(`/customers?search=${encodeURIComponent(q)}`),
    get: (id: string) => request<Customer>(`/customers/${id}`),
    create: (data: Partial<Customer>) =>
      request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Customer>) =>
      request<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
    properties: {
      list: (customerId: string) => request<Property[]>(`/customers/${customerId}/properties`),
      create: (customerId: string, data: Partial<Property>) =>
        request<Property>(`/customers/${customerId}/properties`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  jobs: {
    list: (params?: { status?: string; techId?: string; dateFrom?: string; dateTo?: string }) => {
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      if (params?.techId) qs.set('techId', params.techId)
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom)
      if (params?.dateTo) qs.set('dateTo', params.dateTo)
      return request<Job[]>(`/jobs${qs.toString() ? `?${qs.toString()}` : ''}`)
    },
    get: (id: string) => request<Job>(`/jobs/${id}`),
    create: (data: Partial<Job>) =>
      request<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Job>) =>
      request<Job>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request<Job>(`/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  users: {
    list: () => request<User[]>('/users'),
  },
  quotes: {
    list: (params?: { status?: string }) => {
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      return request<Quote[]>(`/quotes${qs.toString() ? `?${qs.toString()}` : ''}`)
    },
    get: (id: string) => request<Quote>(`/quotes/${id}`),
    create: (data: Partial<Quote>) =>
      request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Quote>) =>
      request<Quote>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    convertToInvoice: (id: string) =>
      request<Invoice>(`/quotes/${id}/convert-to-invoice`, { method: 'POST' }),
  },
  invoices: {
    list: (params?: { status?: string }) => {
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      return request<Invoice[]>(`/invoices${qs.toString() ? `?${qs.toString()}` : ''}`)
    },
    get: (id: string) => request<Invoice>(`/invoices/${id}`),
    markAsPaid: (id: string) =>
      request<Invoice>(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
  },
  parts: {
    list: (params?: { search?: string; category?: string }) => {
      const qs = new URLSearchParams()
      if (params?.search) qs.set('search', params.search)
      if (params?.category) qs.set('category', params.category)
      return request<Part[]>(`/parts${qs.toString() ? `?${qs.toString()}` : ''}`)
    },
    get: (id: string) => request<Part>(`/parts/${id}`),
  },
  warehouses: {
    list: () => request<Warehouse[]>('/warehouses'),
    stock: (warehouseId: string) => request<StockLevel[]>(`/warehouses/${warehouseId}/stock`),
  },
  // ── AI Irrigation Designer ────────────────────────────────────
  designs: {
    list: () => request<Design[]>('/designs'),
    get: (id: string) => request<Design>(`/designs/${id}`),
    create: (data: { propertyId: string; customerId: string }) =>
      request<Design>('/designs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { zones: DesignZone[] }) =>
      request<Design>(`/designs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/designs/${id}`, { method: 'DELETE' }),
    bom: (id: string) => request<BomResponse>(`/designs/${id}/bom`, { method: 'POST' }),
    quote: (id: string) => request<DesignQuoteResponse>(`/designs/${id}/quote`, { method: 'POST' }),
  },
}