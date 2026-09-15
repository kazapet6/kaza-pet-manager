import type { PreferenciaFuncionario, ServicoResolvido } from '../motor/tipos.ts'

export type ModalidadeConfirmacao = 'sem_transporte' | 'taxidog'

export type ConfirmacaoAgendamentoIntent = {
  readonly chaveIdempotencia: string
  readonly petId: string
  readonly servicoIds: readonly string[]
  readonly data: string
  readonly horarioEscolhido: number | null
  readonly modalidade: ModalidadeConfirmacao
  readonly cicloTaxidogId: string | null
  readonly preferenciaFuncionario: PreferenciaFuncionario
  readonly funcionarioPreferidoId: string | null
  readonly funcionarioResponsavelId?: string | null
  readonly versaoConfiguracaoConsultada: number
  readonly versaoOcupacaoConsultada: number
}

export type IntencaoConfirmacaoNormalizada = Omit<
  ConfirmacaoAgendamentoIntent,
  'chaveIdempotencia' | 'servicoIds'
> & {
  readonly servicoIds: readonly string[]
}

export type CodigoDominioConfirmacao =
  | 'PET_INATIVO'
  | 'CADASTRO_PET_INCOMPLETO'
  | 'SERVICO_INATIVO'
  | 'SERVICO_INELEGIVEL'
  | 'CICLO_TAXIDOG_INVALIDO'
  | 'HORARIO_INDISPONIVEL'
  | 'FUNCIONARIO_OBRIGATORIO_INDISPONIVEL'
  | 'CONFIGURACAO_ALTERADA'
  | 'PRECO_ALTERADO'
  | 'IDEMPOTENCIA_CONFLITANTE'
  | 'INTENCAO_INVALIDA'

export type ResumoServicoConfirmado = Pick<
  ServicoResolvido,
  'id' | 'nome' | 'origem'
>

export type ConfirmacaoAgendamentoResposta =
  | {
      readonly status: 'confirmado'
      readonly codigo?: 'CONFIRMADO'
      readonly atendimentoId: string
      readonly grupoAgendamentoId: string
      readonly statusAtendimento: 'agendado' | 'confirmado'
      readonly horarioConfirmado: number
      readonly conclusaoPrevista: number
      readonly valorFinal: number
      readonly versaoConfiguracao: number
      readonly versaoOcupacao: number
      readonly reutilizadoPorIdempotencia: boolean
      readonly servicos: readonly ResumoServicoConfirmado[]
    }
  | {
      readonly status: 'disponibilidade_alterada'
      readonly codigo: 'HORARIO_INDISPONIVEL' | 'FUNCIONARIO_OBRIGATORIO_INDISPONIVEL' | 'CICLO_TAXIDOG_INVALIDO'
      readonly mensagem: string
      readonly versaoOcupacaoAtual: number
    }
  | {
      readonly status: 'configuracao_alterada'
      readonly codigo: 'CONFIGURACAO_ALTERADA' | 'PRECO_ALTERADO'
      readonly mensagem: string
      readonly versaoConfiguracaoConsultada: number
      readonly versaoConfiguracaoAtual: number
    }
  | {
      readonly status: 'invalido'
      readonly codigo: CodigoDominioConfirmacao
      readonly mensagem: string
      readonly campos?: readonly string[]
    }

export type ErroValidacaoIntencao = {
  readonly campo: keyof ConfirmacaoAgendamentoIntent
  readonly codigo: 'OBRIGATORIO' | 'FORMATO_INVALIDO' | 'COMBINACAO_INVALIDA'
  readonly mensagem: string
}

export interface ConfirmacaoAgendamentoClient {
  confirmar(
    intencao: ConfirmacaoAgendamentoIntent,
  ): Promise<ConfirmacaoAgendamentoResposta>
}

export function gerarChaveIdempotencia() {
  return crypto.randomUUID()
}

export function validarIntencaoConfirmacao(
  intencao: ConfirmacaoAgendamentoIntent,
): readonly ErroValidacaoIntencao[] {
  const erros: ErroValidacaoIntencao[] = []
  if (!uuidValido(intencao.chaveIdempotencia)) erros.push(erro('chaveIdempotencia', 'FORMATO_INVALIDO', 'A chave de idempotência deve ser um UUID válido.'))
  if (!intencao.petId.trim()) erros.push(erro('petId', 'OBRIGATORIO', 'Informe o pet.'))
  if (!intencao.servicoIds.length || intencao.servicoIds.some((id) => !id.trim())) erros.push(erro('servicoIds', 'OBRIGATORIO', 'Informe ao menos um serviço válido.'))
  if (!dataValida(intencao.data)) erros.push(erro('data', 'FORMATO_INVALIDO', 'Informe uma data válida no formato AAAA-MM-DD.'))
  if (intencao.modalidade === 'sem_transporte' && (!Number.isInteger(intencao.horarioEscolhido) || Number(intencao.horarioEscolhido) < 0 || Number(intencao.horarioEscolhido) >= 24 * 60)) erros.push(erro('horarioEscolhido', 'FORMATO_INVALIDO', 'Sem transporte exige um minuto válido do dia.'))
  if (intencao.modalidade === 'taxidog' && intencao.horarioEscolhido !== null) erros.push(erro('horarioEscolhido', 'COMBINACAO_INVALIDA', 'TaxiDog escolhe o ciclo, não um horário operacional interno.'))
  if (!Number.isSafeInteger(intencao.versaoConfiguracaoConsultada) || intencao.versaoConfiguracaoConsultada <= 0) erros.push(erro('versaoConfiguracaoConsultada', 'FORMATO_INVALIDO', 'A versão de configuração deve ser positiva.'))
  if (!Number.isSafeInteger(intencao.versaoOcupacaoConsultada) || intencao.versaoOcupacaoConsultada <= 0) erros.push(erro('versaoOcupacaoConsultada', 'FORMATO_INVALIDO', 'A versão de ocupação deve ser positiva.'))

  if (intencao.modalidade === 'taxidog' && !intencao.cicloTaxidogId?.trim()) erros.push(erro('cicloTaxidogId', 'OBRIGATORIO', 'TaxiDog exige um ciclo selecionado.'))
  if (intencao.modalidade === 'sem_transporte' && intencao.cicloTaxidogId !== null) erros.push(erro('cicloTaxidogId', 'COMBINACAO_INVALIDA', 'Sem transporte não aceita ciclo TaxiDog.'))
  if (intencao.preferenciaFuncionario === 'automatico' && intencao.funcionarioPreferidoId !== null) erros.push(erro('funcionarioPreferidoId', 'COMBINACAO_INVALIDA', 'A preferência automática não aceita funcionário escolhido.'))
  if (intencao.preferenciaFuncionario !== 'automatico' && !intencao.funcionarioPreferidoId?.trim()) erros.push(erro('funcionarioPreferidoId', 'OBRIGATORIO', 'A preferência informada exige um funcionário.'))
  if (intencao.preferenciaFuncionario === 'obrigatorio' && !intencao.funcionarioResponsavelId?.trim()) erros.push(erro('funcionarioResponsavelId', 'OBRIGATORIO', 'Informe o funcionário responsável.'))
  if (intencao.funcionarioResponsavelId && intencao.funcionarioResponsavelId !== intencao.funcionarioPreferidoId) erros.push(erro('funcionarioResponsavelId', 'COMBINACAO_INVALIDA', 'O responsável deve ser o funcionário validado pelo Motor.'))
  return erros
}

export function normalizarIntencaoParaHash(
  intencao: ConfirmacaoAgendamentoIntent,
): IntencaoConfirmacaoNormalizada {
  return {
    petId: intencao.petId,
    servicoIds: [...new Set(intencao.servicoIds)].sort(compararIds),
    data: intencao.data,
    horarioEscolhido: intencao.horarioEscolhido,
    modalidade: intencao.modalidade,
    cicloTaxidogId: intencao.cicloTaxidogId,
    preferenciaFuncionario: intencao.preferenciaFuncionario,
    funcionarioPreferidoId: intencao.funcionarioPreferidoId,
    funcionarioResponsavelId: intencao.funcionarioResponsavelId ?? null,
    versaoConfiguracaoConsultada: intencao.versaoConfiguracaoConsultada,
    versaoOcupacaoConsultada: intencao.versaoOcupacaoConsultada,
  }
}

export function serializarIntencaoParaHash(
  intencao: ConfirmacaoAgendamentoIntent,
) {
  return JSON.stringify(normalizarIntencaoParaHash(intencao))
}

export async function calcularHashIntencao(
  intencao: ConfirmacaoAgendamentoIntent,
) {
  const bytes = new TextEncoder().encode(serializarIntencaoParaHash(intencao))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function lerIntencaoConfirmacao(
  valor: unknown,
): ConfirmacaoAgendamentoIntent | null {
  if (!registro(valor)) return null
  if (!Array.isArray(valor.servicoIds)
    || valor.servicoIds.some((item) => typeof item !== 'string')
    || !['sem_transporte', 'taxidog'].includes(texto(valor.modalidade))
    || !['automatico', 'preferencial', 'obrigatorio']
      .includes(texto(valor.preferenciaFuncionario))) return null
  const intencao: ConfirmacaoAgendamentoIntent = {
    chaveIdempotencia: texto(valor.chaveIdempotencia),
    petId: texto(valor.petId),
    servicoIds: valor.servicoIds as string[],
    data: texto(valor.data),
    horarioEscolhido: valor.horarioEscolhido === null ? null : numero(valor.horarioEscolhido),
    modalidade: valor.modalidade === 'taxidog' ? 'taxidog' : 'sem_transporte',
    cicloTaxidogId: textoNulo(valor.cicloTaxidogId),
    preferenciaFuncionario: valor.preferenciaFuncionario === 'preferencial'
      || valor.preferenciaFuncionario === 'obrigatorio'
      ? valor.preferenciaFuncionario
      : 'automatico',
    funcionarioPreferidoId: textoNulo(valor.funcionarioPreferidoId),
    funcionarioResponsavelId: textoNulo(valor.funcionarioResponsavelId),
    versaoConfiguracaoConsultada: numero(valor.versaoConfiguracaoConsultada),
    versaoOcupacaoConsultada: numero(valor.versaoOcupacaoConsultada),
  }
  return validarIntencaoConfirmacao(intencao).length ? null : intencao
}

export function respostaConfirmacaoValida(
  valor: unknown,
): valor is ConfirmacaoAgendamentoResposta {
  if (!registro(valor) || typeof valor.status !== 'string') return false
  if (valor.status === 'confirmado') {
    return (valor.codigo === undefined || valor.codigo === 'CONFIRMADO')
      && textoPreenchido(valor.atendimentoId)
      && textoPreenchido(valor.grupoAgendamentoId)
      && ['agendado', 'confirmado'].includes(texto(valor.statusAtendimento))
      && numeroFinito(valor.horarioConfirmado)
      && numeroFinito(valor.conclusaoPrevista)
      && numeroFinito(valor.valorFinal)
      && inteiroPositivo(valor.versaoConfiguracao)
      && inteiroPositivo(valor.versaoOcupacao)
      && typeof valor.reutilizadoPorIdempotencia === 'boolean'
      && Array.isArray(valor.servicos)
      && valor.servicos.every(servicoConfirmadoValido)
  }
  if (valor.status === 'disponibilidade_alterada') {
    return ['HORARIO_INDISPONIVEL', 'FUNCIONARIO_OBRIGATORIO_INDISPONIVEL', 'CICLO_TAXIDOG_INVALIDO']
      .includes(texto(valor.codigo))
      && textoPreenchido(valor.mensagem)
      && inteiroPositivo(valor.versaoOcupacaoAtual)
  }
  if (valor.status === 'configuracao_alterada') {
    return ['CONFIGURACAO_ALTERADA', 'PRECO_ALTERADO'].includes(texto(valor.codigo))
      && textoPreenchido(valor.mensagem)
      && inteiroPositivo(valor.versaoConfiguracaoConsultada)
      && inteiroPositivo(valor.versaoConfiguracaoAtual)
  }
  if (valor.status === 'invalido') {
    return CODIGOS_DOMINIO.has(texto(valor.codigo) as CodigoDominioConfirmacao)
      && textoPreenchido(valor.mensagem)
  }
  return false
}

const CODIGOS_DOMINIO = new Set<CodigoDominioConfirmacao>([
  'PET_INATIVO', 'CADASTRO_PET_INCOMPLETO', 'SERVICO_INATIVO', 'SERVICO_INELEGIVEL',
  'CICLO_TAXIDOG_INVALIDO', 'HORARIO_INDISPONIVEL',
  'FUNCIONARIO_OBRIGATORIO_INDISPONIVEL', 'CONFIGURACAO_ALTERADA',
  'PRECO_ALTERADO', 'IDEMPOTENCIA_CONFLITANTE', 'INTENCAO_INVALIDA',
])

function servicoConfirmadoValido(valor: unknown) {
  return registro(valor)
    && textoPreenchido(valor.id)
    && textoPreenchido(valor.nome)
    && ['solicitado', 'dependencia'].includes(texto(valor.origem))
}

function textoPreenchido(valor: unknown) {
  return typeof valor === 'string' && valor.trim().length > 0
}

function numeroFinito(valor: unknown) {
  return typeof valor === 'number' && Number.isFinite(valor)
}

function inteiroPositivo(valor: unknown) {
  return Number.isSafeInteger(valor) && Number(valor) > 0
}

function erro(
  campo: keyof ConfirmacaoAgendamentoIntent,
  codigo: ErroValidacaoIntencao['codigo'],
  mensagem: string,
): ErroValidacaoIntencao {
  return { campo, codigo, mensagem }
}

function uuidValido(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

function dataValida(valor: string) {
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (!correspondencia) return false
  const ano = Number(correspondencia[1])
  const mes = Number(correspondencia[2])
  const dia = Number(correspondencia[3])
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1
    && data.getUTCDate() === dia
}

function compararIds(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function registro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor : ''
}

function textoNulo(valor: unknown) {
  return valor === null ? null : texto(valor) || null
}

function numero(valor: unknown) {
  return typeof valor === 'number' ? valor : Number.NaN
}
