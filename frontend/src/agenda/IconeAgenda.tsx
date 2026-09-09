import type { ReactNode, SVGProps } from 'react'

type NomeIcone = 'banho' | 'calendario' | 'carro' | 'caixa' | 'gota' | 'relogio' | 'tesoura'

export default function IconeAgenda({ nome, ...props }: SVGProps<SVGSVGElement> & { nome: NomeIcone }) {
  const caminhos: Record<NomeIcone, ReactNode> = {
    banho: <><path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z"/><path d="M7 12V7a3 3 0 0 1 6 0"/><path d="M13 7h3"/><path d="M7 20v2M17 20v2"/></>,
    calendario: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    carro: <><path d="m5 11 2-5h10l2 5"/><path d="M3 11h18v7H3z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    caixa: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
    gota: <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"/>,
    relogio: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    tesoura: <><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11 7.5M8.5 15.5 19.5 8"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{caminhos[nome]}</svg>
}
