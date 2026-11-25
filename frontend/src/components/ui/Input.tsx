import type { ChangeEvent, ComponentProps, CSSProperties } from 'react'

type InputProps = {
  placeholder?: string
  value?: string
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'time' | 'date'
  style?: CSSProperties
  disabled?: boolean
  inputMode?: ComponentProps<'input'>['inputMode']
}

export default function Input({
  placeholder,
  value = '',
  onChange,
  type = 'text',
  style,
  disabled,
  inputMode,
}: InputProps) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      inputMode={inputMode}
      style={{
        width: '100%',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        outline: 'none',
        fontSize: '15px',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}
