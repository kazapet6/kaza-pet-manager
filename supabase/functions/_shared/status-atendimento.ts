export const STATUS_ATENDIMENTO = [
  'agendado', 'confirmado', 'recebido', 'em_atendimento',
  'aguardando_retirada', 'aguardando_entrega', 'concluido', 'cancelado', 'faltou',
] as const
export const STATUS_OPERACIONAIS_EDITAVEIS = [
  'agendado', 'confirmado', 'recebido', 'em_atendimento',
  'aguardando_retirada', 'aguardando_entrega', 'concluido',
] as const
export const ACOES_EXCEPCIONAIS_ATENDIMENTO = ['cancelar', 'registrar_falta'] as const

export type StatusAtendimento = typeof STATUS_ATENDIMENTO[number]
export type StatusOperacionalEditavel = typeof STATUS_OPERACIONAIS_EDITAVEIS[number]
export type AcaoExcepcionalAtendimento = typeof ACOES_EXCEPCIONAIS_ATENDIMENTO[number]
type Base = { atendimentoId: string; statusEsperado: StatusAtendimento }
export type AlterarStatusIntent = Base & (
  | { novoStatus: StatusOperacionalEditavel; acao?: never }
  | { acao: AcaoExcepcionalAtendimento; novoStatus?: never }
)
export type AlterarStatusResposta =
  | { status: 'atualizado'; atendimentoId: string; statusAnterior: StatusAtendimento; statusAtual: StatusAtendimento; reutilizado: boolean }
  | { status: 'conflito'; codigo: 'STATUS_ALTERADO'; mensagem: string; statusAtual: StatusAtendimento }
  | { status: 'invalido'; codigo: 'INTENCAO_INVALIDA' | 'ATENDIMENTO_NAO_ENCONTRADO' | 'TRANSICAO_INVALIDA'; mensagem: string }

export const opcoesStatusOperacional = STATUS_OPERACIONAIS_EDITAVEIS.map((valor) => ({ valor, rotulo: rotuloStatusAtendimento(valor) }))
export function podeEditarStatus(status: string): status is StatusOperacionalEditavel { return (STATUS_OPERACIONAIS_EDITAVEIS as readonly string[]).includes(status) }
export function podeExecutarAcaoExcepcional(status: StatusAtendimento, acao: AcaoExcepcionalAtendimento) {
  if (acao === 'registrar_falta') return status === 'agendado' || status === 'confirmado'
  return ['agendado', 'confirmado', 'recebido', 'em_atendimento', 'aguardando_retirada', 'aguardando_entrega'].includes(status)
}
export function statusDaAcaoExcepcional(acao: AcaoExcepcionalAtendimento): StatusAtendimento { return acao === 'cancelar' ? 'cancelado' : 'faltou' }
export function rotuloStatusAtendimento(status: string) { return ({ agendado: 'Agendado', confirmado: 'Confirmado', recebido: 'Recebido', em_atendimento: 'Em atendimento', aguardando_retirada: 'Aguardando retirada', aguardando_entrega: 'Aguardando entrega', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou' } as Record<string, string>)[status] ?? status.replaceAll('_', ' ') }
export function statusAtendimento(valor: unknown): valor is StatusAtendimento { return typeof valor === 'string' && (STATUS_ATENDIMENTO as readonly string[]).includes(valor) }
export function statusOperacionalEditavel(valor: unknown): valor is StatusOperacionalEditavel { return typeof valor === 'string' && (STATUS_OPERACIONAIS_EDITAVEIS as readonly string[]).includes(valor) }
export function acaoExcepcionalAtendimento(valor: unknown): valor is AcaoExcepcionalAtendimento { return typeof valor === 'string' && (ACOES_EXCEPCIONAIS_ATENDIMENTO as readonly string[]).includes(valor) }
export function lerAlterarStatusIntent(valor: unknown): AlterarStatusIntent | null {
  if (!objeto(valor) || typeof valor.atendimentoId !== 'string' || !valor.atendimentoId.trim() || !statusAtendimento(valor.statusEsperado)) return null
  if (statusOperacionalEditavel(valor.novoStatus) && valor.acao === undefined) return { atendimentoId: valor.atendimentoId, statusEsperado: valor.statusEsperado, novoStatus: valor.novoStatus }
  if (acaoExcepcionalAtendimento(valor.acao) && valor.novoStatus === undefined) return { atendimentoId: valor.atendimentoId, statusEsperado: valor.statusEsperado, acao: valor.acao }
  return null
}
export function respostaAlterarStatusValida(valor: unknown): valor is AlterarStatusResposta {
  if (!objeto(valor) || !['atualizado', 'conflito', 'invalido'].includes(String(valor.status))) return false
  if (valor.status === 'atualizado') return typeof valor.atendimentoId === 'string' && statusAtendimento(valor.statusAnterior) && statusAtendimento(valor.statusAtual) && typeof valor.reutilizado === 'boolean'
  if (valor.status === 'conflito') return valor.codigo === 'STATUS_ALTERADO' && typeof valor.mensagem === 'string' && statusAtendimento(valor.statusAtual)
  return ['INTENCAO_INVALIDA', 'ATENDIMENTO_NAO_ENCONTRADO', 'TRANSICAO_INVALIDA'].includes(String(valor.codigo)) && typeof valor.mensagem === 'string'
}
function objeto(valor: unknown): valor is Record<string, unknown> { return typeof valor === 'object' && valor !== null && !Array.isArray(valor) }
