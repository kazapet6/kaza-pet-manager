import type { ChangeEvent } from 'react'

type Option = {
  value: string
  label: string
}

type SelectProps = {
  value?: string
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
  options: Option[]
}

export default function Select({
  value,
  onChange,
  options,
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={onChange}
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
      }}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
  )
}