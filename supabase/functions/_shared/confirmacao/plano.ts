import type { ConfirmacaoAgendamentoIntent } from './contrato.ts'
import type {
  DadosDisponibilidade,
  OpcaoDisponibilidade,
  ResultadoPrecificacao,
  ServicoResolvido,
} from '../motor/tipos.ts'

export type PlanoConfirmacaoRpc = Record<string, unknown>
export type DiagnosticoInvariantePlano = {
  codigo: 'SERVICO_SOLICITADO_COM_PAI_CANONICO' | 'DEPENDENCIA_SEM_PAI_CANONICO'
  campo: 'servicos[].pai_canonico_id'
  servicoId: string
  esperado: 'null' | 'uuid-presente'
  recebido: 'null' | 'uuid-presente'
}

export function montarPlanoConfirmacaoRpc(
  intencao: ConfirmacaoAgendamentoIntent,
  dados: DadosDisponibilidade,
  opcao: OpcaoDisponibilidade,
  precificacao: ResultadoPrecificacao,
  hashRequisicao: string,
): PlanoConfirmacaoRpc {
  const pet = dados.pets.find((item) => item.id === intencao.petId)
  const timezone = dados.configuracao.timezone
  if (!pet?.clienteId || !timezone) {
    throw new Error('Dados obrigatorios do pet ou timezone ausentes.')
  }

  const idsServicos = new Map(opcao.servicos.map((servico) => [servico.id, crypto.randomUUID()]))
  const idsEtapas = new Map(opcao.etapas.map((etapa) => [etapa.etapaId, crypto.randomUUID()]))
  const servicosPorId = new Map(opcao.servicos.map((servico) => [servico.id, servico]))
  const precosPorId = new Map(precificacao.servicos.map((servico) => [servico.servicoId, servico]))
  const reservasEquipamentos: Record<string, unknown>[] = []
  const supervisoes: Record<string, unknown>[] = []

  const servicos = opcao.servicos.map((servico) => {
    const preco = precosPorId.get(servico.id)
    if (!preco) throw new Error(`Preco ausente para o servico ${servico.id}.`)
    const pais = servico.paisDiretos
      .map((id) => servicosPorId.get(id))
      .filter((item) => item !== undefined)
      .sort((a, b) => a.ordem - b.ordem || comparar(idsServicos.get(a.id)!, idsServicos.get(b.id)!))
    return {
      id: idsServicos.get(servico.id), servico_id: servico.id,
      ordem: servico.ordem, origem: servico.origem,
      pai_canonico_id: paiCanonicoPlano(servico, pais, idsServicos),
      nome_snapshot: preco.servicoNome,
      preco_base_snapshot: preco.precoBaseSnapshot,
      valor_calculado: preco.valorCalculado, valor_final: preco.valorCalculado,
    }
  })

  const etapas = opcao.etapas.map((etapa) => {
    const inicio = instanteLocal(intencao.data, etapa.inicio, timezone)
    const fim = instanteLocal(intencao.data, etapa.fim, timezone)
    for (const equipamento of etapa.equipamentos) {
      const reservaId = crypto.randomUUID()
      reservasEquipamentos.push({
        id: reservaId, atendimento_etapa_id: idsEtapas.get(etapa.etapaId),
        equipamento_unidade_id: equipamento.unidadeId,
        inicio_planejado: inicio, fim_planejado: fim,
      })
      for (const supervisor of equipamento.supervisores) {
        supervisoes.push({
          id: crypto.randomUUID(), atendimento_etapa_equipamento_id: reservaId,
          funcionario_id: supervisor.id,
          inicio: instanteLocal(intencao.data, supervisor.inicio, timezone),
          fim: instanteLocal(intencao.data, supervisor.fim, timezone),
        })
      }
    }
    const etapaCatalogo = dados.etapas.find((item) => item.id === etapa.etapaId)
    return {
      id: idsEtapas.get(etapa.etapaId), servico_etapa_id: etapa.etapaId,
      inicio_planejado: inicio, fim_planejado: fim,
      atendimento_servico_id: idsServicos.get(etapa.servicoId),
      nome_snapshot: etapa.nome, ordem_snapshot: etapaCatalogo?.ordem ?? 0,
      duracao_minutos_snapshot: etapa.duracaoMinutos,
      recursos_snapshot: recursosSnapshot(dados, etapa.etapaId),
    }
  })

  const contribuicoes = opcao.etapas.flatMap((etapa) =>
    etapa.contribuicoesAcopladas.map((contribuicao, indice) => ({
      id: crypto.randomUUID(), atendimento_etapa_id: idsEtapas.get(etapa.etapaId),
      atendimento_servico_id: idsServicos.get(contribuicao.servicoId),
      servico_etapa_origem_id: contribuicao.etapaId, ordem: indice + 1,
      etapa_nome_snapshot: contribuicao.etapaNome,
      duracao_base_snapshot: contribuicao.duracaoBase,
      duracao_calculada_snapshot: contribuicao.duracaoCalculada,
      recursos_snapshot: contribuicao.recursos,
      habilitacoes_snapshot: contribuicao.habilitacoesNecessarias,
    })),
  )
  const funcionarios = opcao.etapas.flatMap((etapa) => etapa.funcionarios.map((funcionario) => ({
    id: crypto.randomUUID(), atendimento_etapa_id: idsEtapas.get(etapa.etapaId),
    funcionario_id: funcionario.id,
    inicio_planejado: instanteLocal(intencao.data, etapa.inicio, timezone),
    fim_planejado: instanteLocal(intencao.data, etapa.fim, timezone),
  })))
  const esperas = opcao.esperas.map((espera) => {
    const indice = opcao.etapas.findIndex((etapa) => etapa.etapaId === espera.antesDaEtapaId)
    return {
      id: crypto.randomUUID(),
      etapa_anterior_id: indice > 0 ? idsEtapas.get(opcao.etapas[indice - 1].etapaId) : null,
      etapa_seguinte_id: indice >= 0 ? idsEtapas.get(opcao.etapas[indice].etapaId) : null,
      inicio: instanteLocal(intencao.data, espera.inicio, timezone),
      fim: instanteLocal(intencao.data, espera.fim, timezone), motivo: 'operacional',
    }
  })
  const ciclo = opcao.cicloTaxidog
  const inicio = instanteLocal(intencao.data, opcao.inicioOperacional, timezone)
  const conclusao = instanteLocal(intencao.data, opcao.conclusaoPrevista, timezone)

  return {
    grupo: {
      chaveIdempotencia: intencao.chaveIdempotencia,
      hashRequisicao, configuracaoVersao: intencao.versaoConfiguracaoConsultada,
      clienteId: pet.clienteId,
      modalidade: intencao.modalidade === 'taxidog' ? 'taxidog' : 'normal',
      dataOperacional: intencao.data,
      horarioChegadaComprometido: intencao.modalidade === 'taxidog'
        ? null : instanteLocal(intencao.data, opcao.horarioApresentado, timezone),
      retiradaPrevista: conclusao, observacoes: '',
      taxidogCicloId: ciclo?.id ?? null,
      taxidogCicloNomeSnapshot: ciclo?.nome ?? null,
      taxidogCicloOrdemSnapshot: ciclo?.ordem ?? null,
      taxidogColetaInicioSnapshot: ciclo ? hora(ciclo.coletaInicio) : null,
      taxidogColetaFimSnapshot: ciclo ? hora(ciclo.coletaFim) : null,
      taxidogConclusaoLimiteSnapshot: ciclo ? hora(ciclo.conclusaoLimite) : null,
    },
    atendimento: {
      petId: pet.id, inicioOperacionalPlanejado: inicio,
      conclusaoOperacionalPrevista: conclusao,
      preferenciaFuncionario: intencao.preferenciaFuncionario,
      funcionarioPreferidoId: intencao.funcionarioPreferidoId,
      funcionarioResponsavelId: intencao.funcionarioResponsavelId ?? null,
      petNomeSnapshot: pet.nome, petEspecieSnapshot: pet.especie,
      petRacaIdSnapshot: pet.racaId, petRacaNomeSnapshot: pet.racaNome,
      petSexoSnapshot: pet.sexo, petPorteSnapshot: pet.porte,
      petPelagemSnapshot: pet.pelagem, petPesoSnapshot: pet.peso,
      petTemperamentoSnapshot: pet.temperamento,
      valorCalculado: precificacao.valorCalculadoAtendimento,
      valorFinal: precificacao.valorCalculadoAtendimento, observacoes: '',
    },
    servicos,
    origens: opcao.servicos.flatMap((filho) => filho.paisDiretos.map((paiId) => ({
      atendimento_servico_id: idsServicos.get(filho.id),
      originado_por_atendimento_servico_id: idsServicos.get(paiId),
    }))),
    acrescimos: precificacao.servicos.flatMap((servico) => servico.acrescimos.map((acrescimo) => ({
      id: crypto.randomUUID(), atendimento_servico_id: idsServicos.get(servico.servicoId),
      tipo: 'preco', criterio: acrescimo.criterio,
      regra_preco_id: acrescimo.regraPrecoId, modificador_id: null,
      descricao_snapshot: acrescimo.descricaoSnapshot,
      valor_referencia_snapshot: acrescimo.valorReferenciaSnapshot,
      acrescimo_valor: acrescimo.acrescimoValor, acrescimo_minutos: 0,
    }))),
    etapas, contribuicoes, funcionarios, equipamentos: reservasEquipamentos,
    supervisoes, esperas,
  }
}

export function paiCanonicoPlano(
  servico: Pick<ServicoResolvido, 'origem'>,
  paisOrdenados: readonly Pick<ServicoResolvido, 'id'>[],
  idsServicos: ReadonlyMap<string, string>,
) {
  if (servico.origem !== 'dependencia') return null
  return paisOrdenados[0] ? idsServicos.get(paisOrdenados[0].id) ?? null : null
}

export function diagnosticarInvariantesPlanoConfirmacao(
  plano: PlanoConfirmacaoRpc,
): DiagnosticoInvariantePlano[] {
  const servicos = Array.isArray(plano.servicos) ? plano.servicos : []
  const diagnosticos: DiagnosticoInvariantePlano[] = []
  for (const valor of servicos) {
    const servico = registro(valor)
    const origem = servico.origem
    const paiPresente = typeof servico.pai_canonico_id === 'string'
      && servico.pai_canonico_id.length > 0
    if (origem === 'solicitado' && paiPresente) {
      diagnosticos.push({
        codigo: 'SERVICO_SOLICITADO_COM_PAI_CANONICO',
        campo: 'servicos[].pai_canonico_id',
        servicoId: texto(servico.servico_id),
        esperado: 'null', recebido: 'uuid-presente',
      })
    }
    if (origem === 'dependencia' && !paiPresente) {
      diagnosticos.push({
        codigo: 'DEPENDENCIA_SEM_PAI_CANONICO',
        campo: 'servicos[].pai_canonico_id',
        servicoId: texto(servico.servico_id),
        esperado: 'uuid-presente', recebido: 'null',
      })
    }
  }
  return diagnosticos
}

function instanteLocal(data: string, minutos: number, timezone: string) {
  const [ano, mes, dia] = data.split('-').map(Number)
  const alvo = Date.UTC(ano, mes - 1, dia, Math.floor(minutos / 60), minutos % 60)
  let instante = alvo
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instante))
    const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value)
    const observado = Date.UTC(valor('year'), valor('month') - 1, valor('day'), valor('hour'), valor('minute'), valor('second'))
    instante += alvo - observado
  }
  return new Date(instante).toISOString()
}

function hora(minutos: number) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00`
}

function recursosSnapshot(
  dados: DadosDisponibilidade,
  etapaId: string,
) {
  return dados.recursosEtapas
    .filter((recurso) => recurso.servicoEtapaId === etapaId && recurso.ativo)
    .sort((a, b) => a.tipo.localeCompare(b.tipo)
      || comparar(a.equipamentoId ?? '', b.equipamentoId ?? '')
      || comparar(a.id, b.id))
    .map((recurso) => ({
      tipo: recurso.tipo,
      equipamento_id: recurso.equipamentoId,
      quantidade: recurso.quantidade,
    }))
}

function comparar(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown> : {}
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor : ''
}
