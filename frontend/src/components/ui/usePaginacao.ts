import { useRef, useState } from 'react'

export function usePaginacao<T>(itens: T[], pesquisa: string) {
  const [estado, setEstado] = useState({ pagina: 1, pesquisa })
  const inicio = useRef<HTMLDivElement>(null)
  const total = Math.max(1, Math.ceil(itens.length / 20))
  const pagina = pesquisa !== estado.pesquisa ? 1 : Math.min(estado.pagina, total)
  // Ajustar também o estado impede que uma página inválida reapareça quando a lista crescer.
  if (pagina !== estado.pagina || pesquisa !== estado.pesquisa) setEstado({ pagina, pesquisa })
  function mudarPagina(nova: number) {
    setEstado({ pagina: Math.max(1, Math.min(nova, total)), pesquisa })
    const alvo = inicio.current
    const principal = alvo?.closest('main')
    if (alvo && principal) {
      principal.scrollTo({ top: principal.scrollTop + alvo.getBoundingClientRect().top - principal.getBoundingClientRect().top, behavior: 'instant' })
      alvo.focus({ preventScroll: true })
    }
  }
  return { pagina, total, inicio, mudarPagina, itensPagina: itens.slice((pagina - 1) * 20, pagina * 20) }
}
