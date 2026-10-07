import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs))
}

// Format currency
export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value)
}

// Format date
export const formatDate = (date: Date | string | any) => {
  if (!date) return 'N/A'

  const d =
    date instanceof Date
      ? date
      : new Date(date?.toDate?.() || date)

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

// Format date and time
export const formatDateTime = (date: Date | string | any) => {
  if (!date) return 'N/A'

  const d =
    date instanceof Date
      ? date
      : new Date(date?.toDate?.() || date)

  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}