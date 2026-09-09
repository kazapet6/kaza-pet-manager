export type RemarcacaoIntent = {
  readonly chaveIdempotencia: string
  readonly atendimentoId: string
  readonly grupoAgendamentoIdEsperado: string
  readonly statusEsperado: 'agendado' | 'confirmado'
  readonly inicioOperacionalEsperado: string
  readonly funcionarioResponsavelIdEsperado: string | null
  readonly funcionarioResponsavelId: string
  readonly data: string
  readonly horarioEscolhido: number | null
  readonly modalidade: 'sem_transporte' | 'taxidog'
  readonly cicloTaxidogId: string | null
  readonly versaoConfiguracaoConsultada: number
  readonly versaoOcupacaoConsultada: number
}

export type RemarcacaoResposta =
  | { status: 'remarcado'; codigo: 'REMARCADO'; atendimentoId: string; grupoAgendamentoId: string; funcionarioResponsavelId: string; dataOperacional: string; horarioConfirmado: number; conclusaoPrevista: number; versaoOcupacao: number; reutilizadoPorIdempotencia: boolean }
  | { status: 'disponibilidade_alterada'; codigo: 'HORARIO_INDISPONIVEL' | 'CICLO_TAXIDOG_INVALIDO'; mensagem: string; versaoOcupacaoAtual: number }
  | { status: 'configuracao_alterada'; codigo: 'CONFIGURACAO_ALTERADA'; mensagem: string; versaoConfiguracaoAtual: number }
  | { status: 'conflito'; codigo: 'ATENDIMENTO_ALTERADO' | 'IDEMPOTENCIA_CONFLITANTE'; mensagem: string }
  | { status: 'invalido'; codigo: 'INTENCAO_INVALIDA' | 'STATUS_NAO_PERMITE_REMARCACAO'; mensagem: string }

export function lerRemarcacaoIntent(valor: unknown): RemarcacaoIntent | null {
  if (!registro(valor)) return null
  const modalidade = valor.modalidade === 'taxidog' ? 'taxidog' : valor.modalidade === 'sem_transporte' ? 'sem_transporte' : null
  const status = valor.statusEsperado === 'agendado' || valor.statusEsperado === 'confirmado' ? valor.statusEsperado : null
  const intencao: RemarcacaoIntent = {
    chaveIdempotencia: texto(valor.chaveIdempotencia), atendimentoId: texto(valor.atendimentoId),
    grupoAgendamentoIdEsperado: texto(valor.grupoAgendamentoIdEsperado), statusEsperado: status!,
    inicioOperacionalEsperado: texto(valor.inicioOperacionalEsperado), data: texto(valor.data),
    funcionarioResponsavelIdEsperado: valor.funcionarioResponsavelIdEsperado === null ? null : texto(valor.funcionarioResponsavelIdEsperado),
    funcionarioResponsavelId: texto(valor.funcionarioResponsavelId),
    horarioEscolhido: valor.horarioEscolhido === null ? null : Number(valor.horarioEscolhido),
    modalidade: modalidade!, cicloTaxidogId: valor.cicloTaxidogId === null ? null : texto(valor.cicloTaxidogId),
    versaoConfiguracaoConsultada: Number(valor.versaoConfiguracaoConsultada),
    versaoOcupacaoConsultada: Number(valor.versaoOcupacaoConsultada),
  }
  return modalidade && status && validarRemarcacaoIntent(intencao) ? intencao : null
}

export function validarRemarcacaoIntent(item: RemarcacaoIntent) {
  return uuid(item.chaveIdempotencia) && uuid(item.atendimentoId)
    && uuid(item.grupoAgendamentoIdEsperado) && Boolean(Date.parse(item.inicioOperacionalEsperado))
    && (item.funcionarioResponsavelIdEsperado === null || uuid(item.funcionarioResponsavelIdEsperado))
    && uuid(item.funcionarioResponsavelId)
    && /^\d{4}-\d{2}-\d{2}$/.test(item.data)
    && Number.isSafeInteger(item.versaoConfiguracaoConsultada) && item.versaoConfiguracaoConsultada > 0
    && Number.isSafeInteger(item.versaoOcupacaoConsultada) && item.versaoOcupacaoConsultada > 0
    && (item.modalidade === 'taxidog'
      ? item.horarioEscolhido === null && Boolean(item.cicloTaxidogId)
      : Number.isInteger(item.horarioEscolhido) && item.horarioEscolhido! >= 0
        && item.horarioEscolhido! < 1440 && item.cicloTaxidogId === null)
}

export async function calcularHashRemarcacao(item: RemarcacaoIntent) {
  const normalizado = { ...item, chaveIdempotencia: undefined }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalizado)))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function respostaRemarcacaoValida(valor: unknown): valor is RemarcacaoResposta {
  if (!registro(valor) || typeof valor.status !== 'string' || typeof valor.codigo !== 'string') return false
  if (valor.status === 'remarcado') return valor.codigo === 'REMARCADO' && texto(valor.atendimentoId) !== '' && texto(valor.grupoAgendamentoId) !== '' && uuid(texto(valor.funcionarioResponsavelId))
  return ['disponibilidade_alterada', 'configuracao_alterada', 'conflito', 'invalido'].includes(valor.status)
    && typeof valor.mensagem === 'string'
}
function registro(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v) }
function texto(v: unknown) { return typeof v === 'string' ? v : '' }
function uuid(v: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) }
