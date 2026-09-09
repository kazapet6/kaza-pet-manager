import type { ConfirmacaoAgendamentoIntent } from './contrato.ts'

type ErroRpc = {
  code?: unknown
  message?: unknown
  details?: unknown
  hint?: unknown
}

type ClienteRpc = {
  rpc(
    nome: string,
    argumentos: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: ErroRpc | null }>
}

export async function executarRpcConfirmacao(
  admin: ClienteRpc,
  plano: Record<string, unknown>,
  intencao: ConfirmacaoAgendamentoIntent,
) {
  const { data, error } = await admin.rpc('confirmar_agendamento_transacional', {
    p_plano: plano,
  })
  if (error) {
    console.error({
      evento: 'confirmacao_rpc_erro',
      ...campoSanitizado('codigo', error.code),
      ...campoSanitizado('mensagem', error.message),
      ...campoSanitizado('details', error.details),
      ...campoSanitizado('hint', error.hint),
      chaveIdempotencia: intencao.chaveIdempotencia,
      petId: intencao.petId,
      horarioEscolhido: intencao.horarioEscolhido,
    })
    throw error
  }
  return data
}

function campoSanitizado(nome: string, valor: unknown) {
  if (typeof valor !== 'string' || !valor.trim()) return {}
  return { [nome]: sanitizar(valor) }
}

function sanitizar(valor: string) {
  return valor
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT_REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, '[KEY_REDACTED]')
    .replace(/\b(authorization|service[_-]?role|password|senha)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 1000)
}
