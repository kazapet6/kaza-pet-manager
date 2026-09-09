import type { DadosDisponibilidade, OpcaoDisponibilidade } from '../motorDisponibilidade/tipos.ts'
import type { RemarcacaoIntent } from './contrato.ts'

export function montarPlanoRemarcacaoRpc(
  intencao: RemarcacaoIntent,
  dados: DadosDisponibilidade,
  opcao: OpcaoDisponibilidade,
  servicosMaterializados: ReadonlyMap<string, string>,
  hashRequisicao: string,
) {
  const pet = dados.pets[0]
  const timezone = dados.configuracao.timezone
  if (!pet || !timezone) throw new Error('Pet ou timezone da remarcacao nao encontrado.')
  const idsEtapas = new Map(opcao.etapas.map((etapa) => [etapa.etapaId, crypto.randomUUID()]))
  const equipamentos: Record<string, unknown>[] = []
  const supervisoes: Record<string, unknown>[] = []
  const etapas = opcao.etapas.map((etapa) => {
    const atendimentoServicoId = servicosMaterializados.get(etapa.servicoId)
    if (!atendimentoServicoId) throw new Error('O plano recalculado alterou os servicos contratados.')
    const inicio = instanteLocal(intencao.data, etapa.inicio, timezone)
    const fim = instanteLocal(intencao.data, etapa.fim, timezone)
    for (const recurso of etapa.equipamentos) {
      const reservaId = crypto.randomUUID()
      equipamentos.push({ id: reservaId, atendimento_etapa_id: idsEtapas.get(etapa.etapaId), equipamento_unidade_id: recurso.unidadeId, inicio_planejado: inicio, fim_planejado: fim })
      for (const supervisor of recurso.supervisores) supervisoes.push({
        id: crypto.randomUUID(), atendimento_etapa_equipamento_id: reservaId,
        funcionario_id: supervisor.id,
        inicio: instanteLocal(intencao.data, supervisor.inicio, timezone),
        fim: instanteLocal(intencao.data, supervisor.fim, timezone),
      })
    }
    const catalogo = dados.etapas.find((item) => item.id === etapa.etapaId)
    return {
      id: idsEtapas.get(etapa.etapaId), servico_etapa_id: etapa.etapaId,
      atendimento_servico_id: atendimentoServicoId, inicio_planejado: inicio,
      fim_planejado: fim, nome_snapshot: etapa.nome, ordem_snapshot: catalogo?.ordem ?? 0,
      duracao_minutos_snapshot: etapa.duracaoMinutos,
      recursos_snapshot: dados.recursosEtapas.filter((r) => r.ativo && r.servicoEtapaId === etapa.etapaId)
        .map((r) => ({ tipo: r.tipo, equipamento_id: r.equipamentoId, quantidade: r.quantidade })),
    }
  })
  const contribuicoes = opcao.etapas.flatMap((etapa) => etapa.contribuicoesAcopladas.map((item, indice) => ({
    id: crypto.randomUUID(), atendimento_etapa_id: idsEtapas.get(etapa.etapaId),
    atendimento_servico_id: servicosMaterializados.get(item.servicoId),
    servico_etapa_origem_id: item.etapaId, ordem: indice + 1,
    etapa_nome_snapshot: item.etapaNome, duracao_base_snapshot: item.duracaoBase,
    duracao_calculada_snapshot: item.duracaoCalculada, recursos_snapshot: item.recursos,
    habilitacoes_snapshot: item.habilitacoesNecessarias,
  })))
  const funcionarios = opcao.etapas.flatMap((etapa) => etapa.funcionarios.map((item) => ({
    id: crypto.randomUUID(), atendimento_etapa_id: idsEtapas.get(etapa.etapaId), funcionario_id: item.id,
    inicio_planejado: instanteLocal(intencao.data, etapa.inicio, timezone),
    fim_planejado: instanteLocal(intencao.data, etapa.fim, timezone),
  })))
  const esperas = opcao.esperas.map((espera) => {
    const indice = opcao.etapas.findIndex((etapa) => etapa.etapaId === espera.antesDaEtapaId)
    return { id: crypto.randomUUID(), etapa_anterior_id: indice > 0 ? idsEtapas.get(opcao.etapas[indice - 1].etapaId) : null,
      etapa_seguinte_id: indice >= 0 ? idsEtapas.get(opcao.etapas[indice].etapaId) : null,
      inicio: instanteLocal(intencao.data, espera.inicio, timezone),
      fim: instanteLocal(intencao.data, espera.fim, timezone), motivo: 'operacional' }
  })
  const ciclo = opcao.cicloTaxidog
  return {
    atendimentoId: intencao.atendimentoId, grupoAgendamentoIdEsperado: intencao.grupoAgendamentoIdEsperado,
    statusEsperado: intencao.statusEsperado, inicioOperacionalEsperado: intencao.inicioOperacionalEsperado,
    funcionarioResponsavelIdEsperado: intencao.funcionarioResponsavelIdEsperado,
    funcionarioResponsavelId: intencao.funcionarioResponsavelId,
    chaveIdempotencia: intencao.chaveIdempotencia, hashRequisicao,
    configuracaoVersao: intencao.versaoConfiguracaoConsultada,
    horarioConfirmado: opcao.horarioApresentado,
    conclusaoPrevista: opcao.conclusaoPrevista,
    grupo: { dataOperacional: intencao.data, horarioChegadaComprometido: intencao.modalidade === 'taxidog' ? null : instanteLocal(intencao.data, opcao.horarioApresentado, timezone),
      retiradaPrevista: instanteLocal(intencao.data, opcao.conclusaoPrevista, timezone),
      taxidogCicloId: ciclo?.id ?? null, taxidogCicloNomeSnapshot: ciclo?.nome ?? null,
      taxidogCicloOrdemSnapshot: ciclo?.ordem ?? null, taxidogColetaInicioSnapshot: ciclo ? hora(ciclo.coletaInicio) : null,
      taxidogColetaFimSnapshot: ciclo ? hora(ciclo.coletaFim) : null,
      taxidogConclusaoLimiteSnapshot: ciclo ? hora(ciclo.conclusaoLimite) : null },
    atendimento: { inicioOperacionalPlanejado: instanteLocal(intencao.data, opcao.inicioOperacional, timezone),
      conclusaoOperacionalPrevista: instanteLocal(intencao.data, opcao.conclusaoPrevista, timezone) },
    etapas, contribuicoes, funcionarios, equipamentos, supervisoes, esperas,
  }
}

function instanteLocal(data: string, minutos: number, timezone: string) {
  const [ano, mes, dia] = data.split('-').map(Number); const alvo = Date.UTC(ano, mes - 1, dia, Math.floor(minutos / 60), minutos % 60); let instante = alvo
  for (let i = 0; i < 3; i += 1) { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante)); const n = (t: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === t)?.value); instante += alvo - Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) }
  return new Date(instante).toISOString()
}
function hora(minutos: number) { return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00` }
