import type { ReactNode } from 'react'
type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  type?: 'button' | 'submit'
  onClick?: () => void
}

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
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
      style={{
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontWeight: 600,
        transition: '.2s',
        ...cores[variant],
      }}
    >
      {children}
    </button>
  )
}