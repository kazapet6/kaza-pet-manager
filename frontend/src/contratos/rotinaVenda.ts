import { ocorrenciasDoCiclo, opcoesDistribuicaoHidratacao } from '../../../supabase/functions/_shared/recorrencia-contrato.ts'
import type { ResultadoDisponibilidade, ResultadoDisponibilidadeCiclo } from '../motorDisponibilidade/tipos.ts'
import type { PacoteServico } from '../pacotes/contrato.ts'

export type OcorrenciaVenda = {
  ordem: number
  data: string
  servicoIds: string[]
}

export function opcoesHidratacaoDaVenda(servicos: readonly PacoteServico[], dataAncora: string) {
  return opcoesDistribuicaoHidratacao(itensRecorrentes(servicos), dataAncora)
}

function itensRecorrentes(servicos: readonly PacoteServico[]) {
  return servicos.map((item) => ({
    servicoId: item.servicoId,
    servicoNome: item.servicoNome ?? '',
    quantidadePorCiclo: item.quantidadePorCiclo,
    intervaloQuantidade: item.intervaloQuantidade,
    intervaloUnidade: item.intervaloUnidade,
    offsetInicialQuantidade: item.offsetInicialQuantidade,
    offsetInicialUnidade: item.offsetInicialUnidade,
  }))
}

export function ocorrenciasDaVenda(servicos: readonly PacoteServico[], dataAncora: string, hidratacoes?: readonly number[]): OcorrenciaVenda[] {
  return ocorrenciasDoCiclo(itensRecorrentes(servicos), dataAncora, hidratacoes).map((ocorrencia) => ({
    ordem: ocorrencia.ordem,
    data: ocorrencia.data,
    servicoIds: ocorrencia.itens.map((item) => item.servicoId),
  }))
}

export function frequenciaDaRotina(servicos: readonly PacoteServico[], dataAncora: string): 'semanal' | 'quinzenal' | 'personalizada' {
  const ocorrencias = ocorrenciasDaVenda(servicos, dataAncora)
  if (ocorrencias.length > 1) {
    const intervalos = ocorrencias.slice(1).map((item, indice) => diasEntre(ocorrencias[indice].data, item.data))
    if (intervalos.every((dias) => dias === 7)) return 'semanal'
    if (intervalos.every((dias) => dias === 14)) return 'quinzenal'
    return 'personalizada'
  }
  const semanas = servicos.map((item) => item.intervaloUnidade === 'semana' ? item.intervaloQuantidade : null)
  if (semanas.length && semanas.every((valor) => valor === 1)) return 'semanal'
  if (semanas.length && semanas.every((valor) => valor === 2)) return 'quinzenal'
  return 'personalizada'
}

export function consolidarDisponibilidadeSemTransporte(
  resultados: readonly { data: string; resultado: ResultadoDisponibilidade }[],
): ResultadoDisponibilidade | null {
  const primeiro = resultados[0]?.resultado
  if (!primeiro) return null
  const falha = resultados.find(({ resultado }) => resultado.estado !== 'OK')
  if (falha) return {
    ...primeiro,
    estado: falha.resultado.estado,
    opcoes: [],
    motivos: [`A rotina não possui capacidade em ${falha.data}.`, ...falha.resultado.motivos],
    erro: falha.resultado.erro,
  }
  const horariosComuns = primeiro.opcoes.filter((opcao) => resultados.every(({ resultado }) =>
    resultado.opcoes.some((candidata) => candidata.horarioApresentado === opcao.horarioApresentado)
  ))
  return horariosComuns.length ? { ...primeiro, opcoes: horariosComuns } : {
    ...primeiro,
    estado: 'SEM_DISPONIBILIDADE',
    opcoes: [],
    motivos: ['Nenhum horário possui capacidade em todas as ocorrências do ciclo.'],
  }
}

export function consolidarDisponibilidadeTaxiDog(
  resultados: readonly { data: string; resultado: ResultadoDisponibilidadeCiclo }[],
): ResultadoDisponibilidadeCiclo | null {
  const primeiro = resultados[0]?.resultado
  if (!primeiro) return null
  const falha = resultados.find(({ resultado }) => !resultado.disponivel || !resultado.opcao)
  if (!falha) return primeiro
  return {
    ...primeiro,
    estado: falha.resultado.estado,
    disponivel: false,
    opcao: null,
    motivos: [`A janela TaxiDog não possui capacidade em ${falha.data}.`, ...falha.resultado.motivos],
    erro: falha.resultado.erro,
  }
}

function diasEntre(inicio: string, fim: string) {
  return (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000
}
