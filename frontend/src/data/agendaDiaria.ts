import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgendaDiariaAtendimento,
  AgendaDiariaResultado,
  AgendaDiariaSecao,
} from '../types/AgendaDiaria.ts'

type Linha = Record<string, unknown>
type TabelasAgendaDiaria = {
  grupos: Linha[]
  atendimentos: Linha[]
  clientes: Linha[]
  pets: Linha[]
  servicos: Linha[]
  etapas: Linha[]
  reservasFuncionarios: Linha[]
  funcionarios: Linha[]
  reservasEquipamentos: Linha[]
  unidades: Linha[]
  equipamentos: Linha[]
  esperas: Linha[]
  vinculosContratuais: Linha[]
  ciclosContratuais: Linha[]
  ocorrenciasContratuais: Linha[]
  itensContratuais: Linha[]
}

export async function carregarAgendaDiaria(
  cliente: SupabaseClient,
  dataOperacional?: string,
): Promise<AgendaDiariaResultado> {
  const configuracao = await cliente.from('configuracao_agenda').select('timezone').eq('id', true).single()
  if (configuracao.error) throw configuracao.error
  const timezone = texto((configuracao.data as Linha).timezone) || 'America/Sao_Paulo'
  const data = dataOperacional || dataNoTimezone(new Date(), timezone)
  const gruposResposta = await cliente.from('grupos_agendamento').select(
    'id, cliente_id, modalidade, data_operacional, observacoes, taxidog_ciclo_id, taxidog_ciclo_nome_snapshot, taxidog_coleta_inicio_snapshot, taxidog_coleta_fim_snapshot, taxidog_conclusao_limite_snapshot',
  ).eq('data_operacional', data)
  if (gruposResposta.error) throw gruposResposta.error
  const grupos = linhas(gruposResposta.data)
  const gruposIds = ids(grupos)
  if (!gruposIds.length) return { dataOperacional: data, timezone, secoes: [] }

  const atendimentosResposta = await cliente.from('atendimentos').select(
    'id, grupo_agendamento_id, pet_id, status, inicio_operacional_planejado, conclusao_operacional_prevista, preferencia_funcionario, funcionario_preferido_id, funcionario_responsavel_id, observacoes, valor_final, pet_nome_snapshot, recebido_em, iniciado_em, finalizado_em, concluido_em',
  ).in('grupo_agendamento_id', gruposIds)
  if (atendimentosResposta.error) throw atendimentosResposta.error
  const atendimentos = linhas(atendimentosResposta.data)
  const atendimentoIds = ids(atendimentos)
  const clienteIds = unicos(grupos.map((item) => texto(item.cliente_id)))
  const petIds = unicos(atendimentos.map((item) => texto(item.pet_id)))

  const [clientes, pets, servicos, etapas, esperas, vinculosContratuais] = await Promise.all([
    consultarEm(cliente, 'clientes', 'id, nome', 'id', clienteIds),
    consultarEm(cliente, 'pets', 'id, nome', 'id', petIds),
    consultarEm(cliente, 'atendimento_servicos', 'id, atendimento_id, servico_id, nome_snapshot, ordem, origem', 'atendimento_id', atendimentoIds),
    consultarEm(cliente, 'atendimento_etapas', 'id, atendimento_id, nome_snapshot, ordem_snapshot, inicio_planejado, fim_planejado', 'atendimento_id', atendimentoIds),
    consultarEm(cliente, 'atendimento_esperas', 'id, atendimento_id, inicio, fim, motivo', 'atendimento_id', atendimentoIds),
    consultarEm(cliente, 'contrato_ciclo_ocorrencias', 'id, atendimento_id, ciclo_id, ordem', 'atendimento_id', atendimentoIds),
  ])
  const cicloIds = unicos(vinculosContratuais.map((item) => texto(item.ciclo_id)))
  const ocorrenciaIds = ids(vinculosContratuais)
  const [ciclosContratuais, ocorrenciasContratuais, itensContratuais] = await Promise.all([
    consultarEm(cliente, 'contrato_ciclos', 'id, contrato_id, numero, contratos(id, pacote_nome_snapshot)', 'id', cicloIds),
    consultarEm(cliente, 'contrato_ciclo_ocorrencias', 'id, ciclo_id, ordem, data_operacional', 'ciclo_id', cicloIds),
    consultarEm(cliente, 'contrato_ciclo_ocorrencia_itens', 'ocorrencia_id, contrato_itens(servico_id)', 'ocorrencia_id', ocorrenciaIds),
  ])
  const etapaIds = ids(etapas)
  const [reservasFuncionarios, reservasEquipamentos] = await Promise.all([
    consultarEm(cliente, 'atendimento_etapa_funcionarios', 'id, atendimento_etapa_id, funcionario_id', 'atendimento_etapa_id', etapaIds),
    consultarEm(cliente, 'atendimento_etapa_equipamentos', 'id, atendimento_etapa_id, equipamento_unidade_id', 'atendimento_etapa_id', etapaIds),
  ])
  const funcionarioIds = unicos([
    ...reservasFuncionarios.map((item) => texto(item.funcionario_id)),
    ...atendimentos.map((item) => texto(item.funcionario_responsavel_id)),
  ])
  const unidadeIds = unicos(reservasEquipamentos.map((item) => texto(item.equipamento_unidade_id)))
  const [funcionarios, unidades] = await Promise.all([
    consultarEm(cliente, 'funcionarios', 'id, nome', 'id', funcionarioIds),
    consultarEm(cliente, 'equipamento_unidades', 'id, equipamento_id, numero, nome', 'id', unidadeIds),
  ])
  const equipamentoIds = unicos(unidades.map((item) => texto(item.equipamento_id)))
  const equipamentos = await consultarEm(cliente, 'equipamentos', 'id, nome', 'id', equipamentoIds)

  return montarAgendaDiaria(data, timezone, {
    grupos, atendimentos, clientes, pets, servicos, etapas,
    reservasFuncionarios, funcionarios, reservasEquipamentos, unidades,
    equipamentos, esperas, vinculosContratuais, ciclosContratuais,
    ocorrenciasContratuais, itensContratuais,
  })
}

export function montarAgendaDiaria(
  dataOperacional: string,
  timezone: string,
  tabelas: TabelasAgendaDiaria,
): AgendaDiariaResultado {
  const porId = (itens: Linha[]) => new Map(itens.map((item) => [texto(item.id), item]))
  const grupos = porId(tabelas.grupos)
  const clientes = porId(tabelas.clientes)
  const pets = porId(tabelas.pets)
  const funcionarios = porId(tabelas.funcionarios)
  const unidades = porId(tabelas.unidades)
  const equipamentos = porId(tabelas.equipamentos)
  const vinculosPorAtendimento = new Map(tabelas.vinculosContratuais.map((item) => [texto(item.atendimento_id), item]))
  const ciclosContratuais = porId(tabelas.ciclosContratuais)
  const ocorrenciasPorCiclo = agruparPor(tabelas.ocorrenciasContratuais, 'ciclo_id')
  const servicosContratadosPorOcorrencia = new Map<string, Set<string>>()
  for (const item of tabelas.itensContratuais) {
    const ocorrenciaId = texto(item.ocorrencia_id)
    const servicoId = texto(relacao(item.contrato_itens).servico_id)
    if (ocorrenciaId && servicoId) {
      const existentes = servicosContratadosPorOcorrencia.get(ocorrenciaId) ?? new Set<string>()
      existentes.add(servicoId)
      servicosContratadosPorOcorrencia.set(ocorrenciaId, existentes)
    }
  }
  const atendimentos: AgendaDiariaAtendimento[] = tabelas.atendimentos.map((atendimento) => {
    const grupo = grupos.get(texto(atendimento.grupo_agendamento_id)) ?? {}
    const etapas = tabelas.etapas
      .filter((item) => texto(item.atendimento_id) === texto(atendimento.id))
      .map((etapa) => {
        const alocados = tabelas.reservasFuncionarios
          .filter((item) => texto(item.atendimento_etapa_id) === texto(etapa.id))
          .map((item) => funcionarios.get(texto(item.funcionario_id)))
          .filter((item): item is Linha => Boolean(item))
          .map((item) => ({ id: texto(item.id), nome: texto(item.nome) || 'Funcionário' }))
          .sort(compararFuncionario)
        const recursos = tabelas.reservasEquipamentos
          .filter((item) => texto(item.atendimento_etapa_id) === texto(etapa.id))
          .map((item) => unidades.get(texto(item.equipamento_unidade_id)))
          .filter((item): item is Linha => Boolean(item))
          .map((unidade) => ({
            id: texto(unidade.id),
            nome: texto(equipamentos.get(texto(unidade.equipamento_id))?.nome) || 'Equipamento',
            unidade: texto(unidade.nome) || `Unidade ${numero(unidade.numero)}`,
          }))
          .sort((a, b) => comparar(a.nome, b.nome) || comparar(a.id, b.id))
        return {
          id: texto(etapa.id), nome: texto(etapa.nome_snapshot) || 'Etapa',
          ordem: numero(etapa.ordem_snapshot), inicio: texto(etapa.inicio_planejado),
          fim: texto(etapa.fim_planejado), funcionarios: alocados,
          equipamentos: recursos,
        }
      })
      .sort((a, b) => comparar(a.inicio, b.inicio) || a.ordem - b.ordem || comparar(a.id, b.id))
    const funcionarioResponsavelId = texto(atendimento.funcionario_responsavel_id)
    const funcionarioResponsavelLinha = funcionarios.get(funcionarioResponsavelId)
    const pet = pets.get(texto(atendimento.pet_id))
    const cliente = clientes.get(texto(grupo.cliente_id))
    const ocorrenciaContrato = vinculosPorAtendimento.get(texto(atendimento.id))
    const cicloContrato = ciclosContratuais.get(texto(ocorrenciaContrato?.ciclo_id))
    const contrato = relacao(cicloContrato?.contratos)
    const ocorrenciasDoCiclo = ocorrenciasPorCiclo.get(texto(cicloContrato?.id)) ?? []
    const datasDoCiclo = ocorrenciasDoCiclo.map((item) => texto(item.data_operacional)).filter(Boolean).sort()
    const contratoId = texto(cicloContrato?.contrato_id)
    const pacoteNome = texto(contrato.pacote_nome_snapshot)
    const vinculoContrato: AgendaDiariaAtendimento['vinculoContrato'] = ocorrenciaContrato && cicloContrato && contratoId && pacoteNome && ocorrenciasDoCiclo.length
      ? {
          contratoId, pacoteNome, cicloId: texto(cicloContrato.id), cicloNumero: numero(cicloContrato.numero),
          periodoInicio: datasDoCiclo[0] ?? '', periodoFim: datasDoCiclo.at(-1) ?? '',
          ocorrenciaOrdem: numero(ocorrenciaContrato.ordem), totalOcorrencias: ocorrenciasDoCiclo.length,
        }
      : null
    const servicosContratados = servicosContratadosPorOcorrencia.get(texto(ocorrenciaContrato?.id)) ?? new Set<string>()
    const modalidade: AgendaDiariaAtendimento['modalidade'] = texto(grupo.modalidade) === 'taxidog' ? 'taxidog' : 'normal'
    const observacoes = [texto(atendimento.observacoes), texto(grupo.observacoes)]
      .map((item) => item.trim()).filter(Boolean).filter((item, indice, todos) => todos.indexOf(item) === indice).join(' · ')
    return {
      id: texto(atendimento.id), grupoId: texto(grupo.id),
      clienteId: texto(grupo.cliente_id), petId: texto(atendimento.pet_id), dataOperacional,
      inicio: texto(atendimento.inicio_operacional_planejado),
      conclusao: texto(atendimento.conclusao_operacional_prevista),
      petNome: texto(atendimento.pet_nome_snapshot) || texto(pet?.nome) || 'Pet não identificado',
      tutorNome: texto(cliente?.nome) || 'Tutor não identificado',
      servicos: [...new Map(tabelas.servicos
        .filter((item) => texto(item.atendimento_id) === texto(atendimento.id))
        .map((item) => [texto(item.id), item])).values()]
        .map((item) => ({
          id: texto(item.id), servicoId: texto(item.servico_id),
          nome: texto(item.nome_snapshot) || 'Serviço',
          origem: texto(item.origem) === 'dependencia' ? 'dependencia' as const : 'solicitado' as const,
          ordem: numero(item.ordem),
          contratado: Boolean(vinculoContrato && servicosContratados.has(texto(item.servico_id))),
        }))
        .sort((a, b) => a.ordem - b.ordem || comparar(a.nome, b.nome)),
      status: texto(atendimento.status) || 'desconhecido', modalidade,
      observacoes, valorFinal: numero(atendimento.valor_final), financeiro: null, vinculoContrato,
      historicoOperacional: montarHistoricoOperacional(atendimento),
      preferenciaFuncionario: preferenciaFuncionario(atendimento.preferencia_funcionario),
      funcionarioPreferidoId: nuloOuTexto(atendimento.funcionario_preferido_id),
      funcionarioResponsavelId: funcionarioResponsavelId || null,
      funcionarioResponsavel: funcionarioResponsavelLinha
        ? { id: texto(funcionarioResponsavelLinha.id), nome: texto(funcionarioResponsavelLinha.nome) || 'Funcionário' }
        : null,
      etapas,
      esperas: tabelas.esperas
        .filter((item) => texto(item.atendimento_id) === texto(atendimento.id))
        .map((item) => ({ id: texto(item.id), inicio: texto(item.inicio), fim: texto(item.fim), motivo: texto(item.motivo) }))
        .sort((a, b) => comparar(a.inicio, b.inicio) || comparar(a.id, b.id)),
      taxidog: modalidade === 'taxidog' ? {
        cicloId: texto(grupo.taxidog_ciclo_id),
        cicloNome: texto(grupo.taxidog_ciclo_nome_snapshot) || 'TaxiDog',
        coletaInicio: texto(grupo.taxidog_coleta_inicio_snapshot),
        coletaFim: texto(grupo.taxidog_coleta_fim_snapshot),
        conclusaoLimite: texto(grupo.taxidog_conclusao_limite_snapshot),
      } : null,
    }
  }).sort(compararAtendimento)

  const secoes = new Map<string, AgendaDiariaSecao>()
  for (const atendimento of atendimentos) {
    const chave = atendimento.funcionarioResponsavel?.id ?? '__sem_funcionario__'
    const existente = secoes.get(chave) ?? {
      chave, funcionario: atendimento.funcionarioResponsavel, atendimentos: [],
    }
    existente.atendimentos.push(atendimento)
    secoes.set(chave, existente)
  }
  return {
    dataOperacional, timezone,
    secoes: [...secoes.values()]
      .map((secao) => ({ ...secao, atendimentos: [...secao.atendimentos].sort(compararAtendimento) }))
      .sort((a, b) => {
        if (!a.funcionario) return 1
        if (!b.funcionario) return -1
        return comparar(a.funcionario.nome, b.funcionario.nome) || comparar(a.chave, b.chave)
      }),
  }
}

export function montarHistoricoOperacional(atendimento: Linha) {
  return ([
    ['recebido', 'Recebido', atendimento.recebido_em],
    ['iniciado', 'Início do atendimento', atendimento.iniciado_em],
    ['finalizado', 'Finalização', atendimento.finalizado_em],
    ['concluido', 'Concluído', atendimento.concluido_em],
  ] as const).flatMap(([tipo, rotulo, ocorridoEm]) => {
    const valor = nuloOuTexto(ocorridoEm)
    return valor ? [{ tipo, rotulo, ocorridoEm: valor }] : []
  })
}

export function dataNoTimezone(data: Date, timezone: string) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(data)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

async function consultarEm(cliente: SupabaseClient, tabela: string, colunas: string, coluna: string, valores: string[]) {
  if (!valores.length) return []
  const resposta = await cliente.from(tabela).select(colunas).in(coluna, valores)
  if (resposta.error) throw resposta.error
  return linhas(resposta.data)
}

function compararAtendimento(a: AgendaDiariaAtendimento, b: AgendaDiariaAtendimento) {
  return comparar(a.inicio, b.inicio) || comparar(a.id, b.id)
}
function compararFuncionario(a: { id: string; nome: string }, b: { id: string; nome: string }) {
  return comparar(a.id, b.id)
}
function comparar(a: string, b: string) { return a.localeCompare(b, 'pt-BR') }
function linhas(valor: unknown) { return Array.isArray(valor) ? valor as Linha[] : [] }
function relacao(valor: unknown): Linha { return Array.isArray(valor) ? (valor[0] as Linha ?? {}) : valor && typeof valor === 'object' ? valor as Linha : {} }
function agruparPor(itens: Linha[], campo: string) {
  const grupos = new Map<string, Linha[]>()
  for (const item of itens) {
    const chave = texto(item[campo])
    if (chave) grupos.set(chave, [...(grupos.get(chave) ?? []), item])
  }
  return grupos
}
function ids(itens: Linha[]) { return unicos(itens.map((item) => texto(item.id))) }
function unicos(itens: string[]) { return [...new Set(itens.filter(Boolean))] }
function texto(valor: unknown) { return valor === null || valor === undefined ? '' : String(valor) }
function numero(valor: unknown) { const convertido = Number(valor); return Number.isFinite(convertido) ? convertido : 0 }
function nuloOuTexto(valor: unknown) { return valor === null || valor === undefined ? null : String(valor) }
function preferenciaFuncionario(valor: unknown): AgendaDiariaAtendimento['preferenciaFuncionario'] {
  return valor === 'preferencial' || valor === 'obrigatorio' ? valor : 'automatico'
}
