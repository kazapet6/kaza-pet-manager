import type { ReactNode } from 'react'
type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled,
}: ButtonProps) {
  const cores = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-text-light)',
      border: 'none',
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    danger: {
      background: 'var(--color-error)',
      color: 'white',
      border: 'none',
    },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .65 : 1,
        fontWeight: 600,
        transition: '.2s',
        ...cores[variant],
      }}
    >
      {children}
    </button>
  )
}
