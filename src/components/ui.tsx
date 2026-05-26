// Shared UI primitives. One source of truth for the look of buttons, inputs,
// cards, and badges so individual screens don't re-spell long class strings.
// Each accepts a `className` escape hatch for one-off layout tweaks.
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type HTMLAttributes } from 'react'

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger'
type ButtonSize = 'sm' | 'md'

const BTN_BASE =
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed'
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 disabled:bg-gray-400',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300 disabled:opacity-50',
  danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-gray-400',
}
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
}

export function Button({
  variant = 'primary', size = 'md', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`} {...props} />
}

// ── Input ─────────────────────────────────────────────────────────────────────
// forwardRef so callers using uncontrolled refs (e.g. Settings) keep working.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 ${className}`}
      {...props}
    />
  )
)
Input.displayName = 'Input'

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-white rounded-xl shadow p-6 ${className}`} {...props} />
}

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'brand'
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  info:    'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  brand:   'bg-brand-100 text-brand-800',
}

export function Badge({
  tone = 'neutral', className = '', ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${BADGE_TONE[tone]} ${className}`}
      {...props}
    />
  )
}
