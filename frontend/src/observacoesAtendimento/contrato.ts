import { tipoOcorrencia, type TipoOcorrenciaAtendimento } from './catalogo.ts'

export const LIMITE_OBSERVACAO_ATENDIMENTO = 1000
export type ObservacoesAtendimento = { atendimentoId: string; versao: number; ocorrencias: TipoOcorrenciaAtendimento[]; observacao: string | null; editavel: boolean }
export type SalvarObservacoesIntent = { operacao: 'salvar'; atendimentoId: string; versaoEsperada: number; ocorrencias: TipoOcorrenciaAtendimento[]; observacao: string | null }
export type CarregarObservacoesIntent = { operacao: 'carregar'; atendimentoId: string }
export type ObservacoesIntent = SalvarObservacoesIntent | CarregarObservacoesIntent
export type ObservacoesResposta =
  | ({ status: 'carregado' } & ObservacoesAtendimento)
  | { status: 'salvo'; atendimentoId: string; versao: number; ocorrencias: TipoOcorrenciaAtendimento[]; observacao: string | null }
  | { status: 'conflito'; codigo: 'OBSERVACOES_ALTERADAS'; mensagem: string; oficial: ObservacoesAtendimento }
  | { status: 'invalido'; codigo: string; mensagem: string }

export function normalizarOcorrencias(valores: readonly TipoOcorrenciaAtendimento[]) { return [...new Set(valores)].sort() }
export function alternarOcorrencia(valores: readonly TipoOcorrenciaAtendimento[], tipo: TipoOcorrenciaAtendimento) { return valores.includes(tipo) ? valores.filter((item) => item !== tipo) : normalizarOcorrencias([...valores, tipo]) }
export function normalizarObservacao(valor: string | null | undefined) { const item = valor?.trim() ?? ''; return item || null }
export function podeEditarObservacoes(status: string) { return ['agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega'].includes(status) }
export function lerObservacoesIntent(valor: unknown): ObservacoesIntent | null {
  if (!objeto(valor) || typeof valor.atendimentoId !== 'string' || !valor.atendimentoId) return null
  if (valor.operacao === 'carregar') return { operacao: 'carregar', atendimentoId: valor.atendimentoId }
  if (valor.operacao !== 'salvar' || !Number.isSafeInteger(valor.versaoEsperada) || Number(valor.versaoEsperada) < 0 || !Array.isArray(valor.ocorrencias) || !valor.ocorrencias.every(tipoOcorrencia) || (valor.observacao !== null && typeof valor.observacao !== 'string')) return null
  const observacao = normalizarObservacao(valor.observacao as string | null)
  if ((observacao?.length ?? 0) > LIMITE_OBSERVACAO_ATENDIMENTO) return null
  return { operacao: 'salvar', atendimentoId: valor.atendimentoId, versaoEsperada: Number(valor.versaoEsperada), ocorrencias: normalizarOcorrencias(valor.ocorrencias), observacao }
}
function objeto(valor: unknown): valor is Record<string, unknown> { return typeof valor === 'object' && valor !== null && !Array.isArray(valor) }
