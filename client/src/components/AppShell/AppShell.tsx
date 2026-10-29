import { useState } from 'react'
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Map,
  Users,
  Package,
  Receipt,
  FileSpreadsheet,
  Settings,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
  Droplets,
  Ruler,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { NavItem } from '@/types/domain'

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { id: 'schedule', label: 'Schedule', path: '/schedule', icon: 'Calendar' },
  { id: 'jobs', label: 'Jobs', path: '/jobs', icon: 'ClipboardList' },
  { id: 'routes', label: 'Routes', path: '/routes', icon: 'Map' },
  { id: 'customers', label: 'Customers', path: '/customers', icon: 'Users' },
  { id: 'inventory', label: 'Inventory', path: '/inventory', icon: 'Package' },
  { id: 'invoices', label: 'Invoices', path: '/invoices', icon: 'Receipt' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: 'FileSpreadsheet' },
  { id: 'team', label: 'Team', path: '/team', icon: 'Users' },
  { id: 'designer', label: 'Designer', path: '/designer', icon: 'Ruler' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: 'Settings', hidden: true },
]

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Map,
  Users,
  Package,
  Receipt,
  FileSpreadsheet,
  Settings,
  Ruler,
}

export interface TopNavProps {
  orgName: string
  userName: string
  notificationCount?: number
  onNotificationsClick?: () => void
  onUserMenuClick?: (action: 'profile' | 'settings' | 'logout') => void
  breadcrumbs?: { label: string; href?: string }[]
  onMobileMenuToggle?: () => void
}

function TopNav({
  userName,
  notificationCount = 0,
  onNotificationsClick,
  onUserMenuClick,
  breadcrumbs,
  onMobileMenuToggle,
}: TopNavProps) {
  return (
    <header className="h-16 border-b border-border bg-white flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Mobile: hamburger + org name */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5 text-text-primary" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-primary hidden sm:inline">SprinkSoft</span>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="hidden sm:flex items-center gap-1.5 text-sm text-text-secondary">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.label} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-text-secondary/50">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-primary transition-colors">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-text-primary font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button
          type="button"
          onClick={onNotificationsClick}
          className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-text-secondary" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative group">
          <button
            type="button"
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="User menu"
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:inline text-sm font-medium text-text-primary">{userName}</span>
            <ChevronDown className="w-4 h-4 text-text-secondary hidden md:inline" />
          </button>

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-dropdown border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-40">
            <div className="py-1">
              <button
                type="button"
                onClick={() => onUserMenuClick?.('profile')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4" /> Profile
              </button>
              <button
                type="button"
                onClick={() => onUserMenuClick?.('settings')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4" /> Settings
              </button>
              <hr className="my-1 border-border" />
              <button
                type="button"
                onClick={() => onUserMenuClick?.('logout')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export interface SidebarNavProps {
  items: NavItem[]
  currentPath: string
  onNavigate: (path: string) => void
  collapsed?: boolean
}

function SidebarNav({ items, currentPath, onNavigate, collapsed = false }: SidebarNavProps) {
  const visibleItems = items.filter((item) => !item.hidden)

  return (
    <nav className="flex flex-col gap-1 px-2 py-4">
      {visibleItems.map((item) => {
        const Icon = ICON_MAP[item.icon]
        const isActive = currentPath.startsWith(item.path)

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
            )}
            title={collapsed ? item.label : undefined}
          >
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            {!collapsed && (
              <>
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ml-auto bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {item.badge}
                  </span>
                )}
              </>
            )}
            {collapsed && item.badge != null && item.badge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// Bottom tab bar for mobile
export interface MobileTabBarProps {
  items: NavItem[]
  currentPath: string
  onNavigate: (path: string) => void
}

function MobileTabBar({ items, currentPath, onNavigate }: MobileTabBarProps) {
  // Show at most 5 primary items on the tab bar
  const tabItems = items
    .filter((item) => !item.hidden)
    .filter((_, i) => i < 5)

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border flex items-center justify-around px-2 pb-safe z-30 lg:hidden">
      {tabItems.map((item) => {
        const Icon = ICON_MAP[item.icon]
        const isActive = currentPath.startsWith(item.path)

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 transition-colors relative',
              isActive ? 'text-primary' : 'text-text-secondary'
            )}
          >
            {Icon && <Icon className="w-5 h-5" />}
            <span className="text-[10px] font-medium truncate max-w-full">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="absolute top-0.5 right-1 w-3.5 h-3.5 bg-danger text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

interface AppShellProps {
  navItems?: NavItem[]
  currentPath: string
  onNavigate: (path: string) => void
  user: { name: string; email: string; avatar?: string }
  notificationCount?: number
  orgName: string
  children: React.ReactNode
  onNotificationsClick?: () => void
  onUserMenuClick?: (action: 'profile' | 'settings' | 'logout') => void
  breadcrumbs?: { label: string; href?: string }[]
}

export function AppShell({
  navItems = DEFAULT_NAV_ITEMS,
  currentPath,
  onNavigate,
  user,
  notificationCount = 0,
  orgName = 'SprinkSoft',
  children,
  onNotificationsClick,
  onUserMenuClick,
  breadcrumbs,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-white shrink-0">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-primary">SprinkSoft</span>
        </div>
        <SidebarNav items={navItems} currentPath={currentPath} onNavigate={onNavigate} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white z-50 lg:hidden shadow-xl animate-[slideInLeft_200ms_ease-out]">
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Droplets className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-primary">SprinkSoft</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNav items={navItems} currentPath={currentPath} onNavigate={onNavigate} />
          </aside>
        </>
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav
          orgName={orgName}
          userName={user.name}
          notificationCount={notificationCount}
          onNotificationsClick={onNotificationsClick}
          onUserMenuClick={onUserMenuClick}
          breadcrumbs={breadcrumbs}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        {/* Mobile tab bar */}
        <MobileTabBar items={navItems} currentPath={currentPath} onNavigate={onNavigate} />
      </div>
    </div>
  )
}