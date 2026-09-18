type Props = {
  pagina: number
  total: number
  quantidade: number
  onChange: (pagina: number) => void
}

export default function Paginacao({ pagina, total, quantidade, onChange }: Props) {
  if (quantidade === 0) return null
  const numeros = Array.from({ length: total }, (_, i) => i + 1)
    .filter(n => n === 1 || n === total || Math.abs(n - pagina) <= 1)
  return <nav className="paginacao" aria-label="Paginação da listagem">
    <p role="status">{(pagina - 1) * 20 + 1}–{Math.min(pagina * 20, quantidade)} de {quantidade} registros</p>
    <div className="paginacao-controles">
      <button type="button" disabled={pagina === 1} onClick={() => onChange(pagina - 1)}>Anterior</button>
      {numeros.map((n, i) => <span key={n}>
        {i > 0 && n - numeros[i - 1] > 1 && <span className="paginacao-reticencias" aria-hidden="true">…</span>}
        <button type="button" aria-label={`Página ${n}`} aria-current={n === pagina ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button>
      </span>)}
      <button type="button" disabled={pagina === total} onClick={() => onChange(pagina + 1)}>Próximo</button>
    </div>
  </nav>
}
