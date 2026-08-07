import type { ReactNode } from 'react'

type ModalProps = {
  aberto: boolean
  titulo: string
  children: ReactNode
  onClose: () => void
}

export default function Modal({
  aberto,
  titulo,
  children,
  onClose,
}: ModalProps) {
  if (!aberto) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(evento) => evento.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--color-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-xl)',
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