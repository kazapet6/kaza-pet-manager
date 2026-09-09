import type { ReactNode } from 'react'

type ModalProps = {
  aberto: boolean
  titulo: ReactNode
  children: ReactNode
  onClose: () => void
  maxWidth?: string
  className?: string
  overlayClassName?: string
}

export default function Modal({
  aberto,
  titulo,
  children,
  onClose,
  maxWidth = '620px',
  className,
  overlayClassName,
}: ModalProps) {
  if (!aberto) return null

  return (
    <div
      className={overlayClassName}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 3vw, 20px)',
        zIndex: 1000,
      }}
    >
      <div
        className={className}
        onClick={(evento) => evento.stopPropagation()}
        style={{
          width: '100%',
          minWidth: 0,
          maxWidth,
          maxHeight: 'calc(100dvh - 2 * clamp(8px, 3vw, 20px))',
          overflowY: 'auto',
          background: 'var(--color-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'clamp(16px, 3vw, 32px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <h2 style={{ margin: 0 }}>{titulo}</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '24px',
              color: 'var(--color-text-muted)',
            }}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
