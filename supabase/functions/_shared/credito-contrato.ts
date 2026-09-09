export const ESTADOS_CREDITO_CONTRATO = [
  'reservado', 'disponivel', 'aguardando_decisao', 'revisao_legado', 'consumido', 'perdido',
] as const

export type EstadoCreditoContrato = typeof ESTADOS_CREDITO_CONTRATO[number]

export type ContagemCreditos = {
  contratados: number
  consumidos: number
  perdidos: number
  reservados: number
  livres: number
  pendentes: number
  disponiveis: number
  consumoPercentual: number
  disponibilidadePercentual: number
}

export type CreditoBase = { estadoComercial: EstadoCreditoContrato }

export type ResumoCicloCredito = ContagemCreditos & {
  id: string; numero: number; estado: string; inicio: string; fim: string
  atual: boolean; encerramentoPendente: boolean; valor: number | null
}
export type ResumoContratoCreditos = { status: 'carregado'; contratoId: string; ciclos: ResumoCicloCredito[] }
export type UnidadeCredito = CreditoBase & {
  ocorrenciaId: string; contratoItemId: string; cicloId: string; ordinal: number
  ocorrenciaOrdem: number; data: string; horarioInicio: string; horarioFim: string
  atendimentoId: string | null; statusAtendimento: string | null; versao: number
}
export type ResumoServicoCredito = ContagemCreditos & {
  contratoItemId: string; servicoId: string; nome: string; ordem: number
  intervaloQuantidade: number; intervaloUnidade: string; unidades: UnidadeCredito[]
}
export type DetalheCicloCreditos = ResumoCicloCredito & { status: 'carregado'; servicos: ResumoServicoCredito[] }
export type EventoCredito = {
  id: string; tipo: string; estadoAnterior: EstadoCreditoContrato | null; estadoNovo: EstadoCreditoContrato
  responsavelId: string | null; motivo: string | null; ocorridoEm: string
}
export type DetalheUnidadeCredito = UnidadeCredito & {
  status: 'carregado'; servicoNome: string; modalidade: string; cicloNumero: number
  cicloEncerramentoPendente: boolean; statusAnteriorConclusao: string | null; eventos: EventoCredito[]
}

export function agregarCreditos(itens: readonly CreditoBase[]): ContagemCreditos {
  const contratados = itens.length
  const contar = (estado: EstadoCreditoContrato) => itens.filter((item) => item.estadoComercial === estado).length
  const consumidos = contar('consumido')
  const perdidos = contar('perdido')
  const reservados = contar('reservado')
  const livres = contar('disponivel')
  const pendentes = contar('aguardando_decisao') + contar('revisao_legado')
  const disponiveis = reservados + livres
  return {
    contratados, consumidos, perdidos, reservados, livres, pendentes, disponiveis,
    consumoPercentual: percentual(consumidos, contratados),
    disponibilidadePercentual: percentual(disponiveis, contratados),
  }
}

export function faixaDisponibilidade(contagem: Pick<ContagemCreditos, 'disponibilidadePercentual'>) {
  if (contagem.disponibilidadePercentual === 0) return 'esgotado' as const
  if (contagem.disponibilidadePercentual <= 50) return 'atencao' as const
  return 'disponivel' as const
}

export function estadoCredito(valor: unknown): valor is EstadoCreditoContrato {
  return typeof valor === 'string' && (ESTADOS_CREDITO_CONTRATO as readonly string[]).includes(valor)
}

function percentual(parte: number, total: number) {
  return total ? Math.round((parte / total) * 100) : 0
}
