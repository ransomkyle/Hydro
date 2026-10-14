import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SearchInputProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  debounceMs?: number
  onClear?: () => void
  loading?: boolean
  disabled?: boolean
  autoFocus?: boolean
  fullWidth?: boolean
  className?: string
}

export function SearchInput({
  placeholder = 'Search...',
  value,
  onChange,
  debounceMs = 300,
  onClear,
  loading = false,
  disabled = false,
  autoFocus = false,
  fullWidth = false,
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      onChange(newValue)
    }, debounceMs)
  }

  const handleClear = () => {
    setLocalValue('')
    onChange('')
    onClear?.()
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      className={cn(
        'relative',
        fullWidth && 'w-full',
        className
      )}
    >
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        {loading ? (
          <Loader2 className="w-4 h-4 text-text-secondary animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-text-secondary" />
        )}
      </div>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'block w-full rounded-lg border border-border bg-white pl-10 pr-10 py-2 text-sm',
          'placeholder:text-text-secondary placeholder:text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          'transition-colors duration-150'
        )}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}