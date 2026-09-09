import type { ConclusaoDadosResposta, FinanceiroAtendimento } from '../conclusaoAtendimento/contrato.ts'
import type { AgendaDiariaFinanceiro } from '../types/AgendaDiaria.ts'

export function financeiroDaResposta(resposta: ConclusaoDadosResposta): AgendaDiariaFinanceiro | null {
  if (resposta.status !== 'carregado') return null
  return resumirFinanceiro(resposta.financeiro)
}

export function resumirFinanceiro(financeiro: FinanceiroAtendimento): AgendaDiariaFinanceiro {
  return {
    valorFinal: financeiro.valorFinal,
    totalRecebido: financeiro.totalRecebido,
    saldo: financeiro.saldo,
    situacao: financeiro.situacao,
  }
}

export function textoFinanceiro(financeiro: AgendaDiariaFinanceiro | null): string {
  if (!financeiro) return 'Financeiro indisponível'
  if (financeiro.situacao === 'isento') return 'Isento'
  if (financeiro.situacao === 'pago') return `Pago · ${moeda(financeiro.totalRecebido)}`
  const rotulo = financeiro.situacao === 'parcial' ? 'Parcial' : 'Pendente'
  return `${rotulo} · saldo ${moeda(financeiro.saldo)}`
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
