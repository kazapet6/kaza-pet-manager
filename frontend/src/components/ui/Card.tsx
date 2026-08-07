import type { ReactNode, CSSProperties } from 'react'

type CardProps = {
  children: ReactNode
  style?: CSSProperties
}

export default function Card({
  children,
  style,
}: CardProps) {
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--space-lg)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}