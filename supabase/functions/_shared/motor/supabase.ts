import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { horaParaMinutos } from './tempo.ts'
import type { DadosDisponibilidade, EntradaDisponibilidade, ExcecaoEstabelecimentoMotor, PetMotor } from './tipos.ts'

type Linha = Record<string, unknown>
const GRANULARIDADE_CANDIDATOS_V1 = 15
const STATUS_QUE_BLOQUEIAM = new Set(['agendado', 'confirmado', 'recebido', 'em_atendimento', 'aguardando_retirada', 'aguardando_entrega'])
export function statusBloqueiaDisponibilidade(status: string) { return STATUS_QUE_BLOQUEIAM.has(status) }

export async function carregarDadosDisponibilidadeComCliente(
  entrada: EntradaDisponibilidade,
  cliente: SupabaseClient,
  chaveIdempotenciaIgnorada?: string,
  atendimentoIdIgnorado?: string,
  ocorrenciaContratoIdIgnorada?: string,
): Promise<DadosDisponibilidade> {
  async function consultar(tabela: string, colunas = '*') {
    const { data, error } = await cliente.from(tabela).select(colunas)
    if (error) throw error
    return (data ?? []) as unknown as Linha[]
  }
  const [configuracoes, pets, servicos, dependencias, acoplamentos, especies, portes, racasBloqueadas, etapas, recursos, modificadores, blocos, excecoes, excecaoBlocos, funcionarios, jornadas, intervalos, funcionarioServicos, funcionarioEtapas, equipamentos, unidades, perfis, itensPerfis, atendimentos, atendimentoEtapas, reservasFuncionarios, reservasEquipamentos, reservasCiclos, ciclosTaxidog, cicloDias, gruposIgnorados] = await Promise.all([
    consultar('configuracao_agenda', 'timezone, espera_normal_minutos'),
    cliente.from('pets').select('id, cliente_id, nome, especie, raca_id, sexo, porte, pelagem, peso, temperamento, raca:racas!pets_raca_especie_fkey(nome)').eq('id', entrada.petId).then(({ data, error }) => { if (error) throw error; return (data ?? []) as unknown as Linha[] }),
    consultar('servicos', 'id, nome, ativo'),
    consultar('servico_dependencias', 'servico_id, dependencia_servico_id, ativo'),
    consultar('servico_acoplamentos', 'servico_id, etapa_alvo_id, ativo'),
    consultar('servico_especies', 'servico_id, especie, ativo'),
    consultar('servico_portes', 'servico_id, porte, ativo'),
    consultar('servico_racas_bloqueadas', 'servico_id, raca_id, ativo'),
    consultar('servico_etapas', 'id, servico_id, nome, ordem, duracao_minutos, ativo, politica_espera_antes, espera_antes_minutos'),
    consultar('servico_etapa_recursos', 'id, servico_etapa_id, tipo, equipamento_id, quantidade, ativo'),
    consultar('servico_modificadores', 'id, servico_id, servico_etapa_id, criterio, acrescimo_minutos, ativo, raca_id, porte, pelagem, temperamento, peso_min, peso_max'),
    consultar('estabelecimento_blocos', 'dia_semana, inicio, fim, ativo'),
    consultar('estabelecimento_excecoes', 'id, data, fechado'),
    consultar('estabelecimento_excecao_blocos', 'excecao_id, inicio, fim'),
    consultar('funcionarios', 'id, nome, ativo'),
    consultar('funcionario_jornadas', 'funcionario_id, dia_semana, inicio, fim, ativo'),
    consultar('funcionario_intervalos', 'funcionario_id, dia_semana, inicio, fim, ativo'),
    consultar('funcionario_servicos', 'funcionario_id, servico_id, ativo'),
    consultar('funcionario_etapas', 'funcionario_id, servico_etapa_id, ativo'),
    consultar('equipamentos', 'id, nome, ativo, separar_por_sexo, exige_supervisao_humana'),
    consultar('equipamento_unidades', 'id, equipamento_id, numero, nome, ativo'),
    consultar('equipamento_perfis_capacidade', 'id, equipamento_id, ativo'),
    consultar('equipamento_perfil_itens', 'perfil_id, porte, quantidade, ativo'),
    consultar('atendimentos', 'id, status, grupo_agendamento_id'),
    consultar('atendimento_etapas', 'id, atendimento_id'),
    consultar('atendimento_etapa_funcionarios', 'id, atendimento_etapa_id, funcionario_id, inicio_planejado, fim_planejado'),
    consultar('atendimento_etapa_equipamentos', 'id, atendimento_etapa_id, equipamento_unidade_id, inicio_planejado, fim_planejado, porte_snapshot, sexo_snapshot'),
    cliente.from('contrato_ciclo_ocorrencias').select('id,data_operacional,plano_operacional').eq('estado','reservada').is('atendimento_id',null).eq('data_operacional',entrada.data).then(({data,error})=>{if(error)throw error;return((data??[]) as unknown as Linha[]).filter((item)=>texto(item.id)!==ocorrenciaContratoIdIgnorada)}),
    consultar('taxidog_ciclos', 'id, nome, ordem, coleta_inicio, coleta_fim, conclusao_limite, ativo'),
    consultar('taxidog_ciclo_dias', 'ciclo_id, dia_semana, ativo'),
    chaveIdempotenciaIgnorada
      ? cliente.from('grupos_agendamento').select('id').eq(
        'chave_idempotencia', chaveIdempotenciaIgnorada,
      ).then(({ data, error }) => {
        if (error) throw error
        return (data ?? []) as unknown as Linha[]
      })
      : Promise.resolve([] as Linha[]),
  ])

  const configuracao = configuracoes[0]
  if (!configuracao) throw new Error('Configuração da Agenda não encontrada.')
  const timezone = texto(configuracao.timezone)
  const gruposIgnoradosIds = new Set(gruposIgnorados.map((item) => texto(item.id)))
  const atendimentosAtivos = new Set(atendimentos.filter((item) =>
    statusBloqueiaDisponibilidade(texto(item.status))
    && texto(item.id) !== atendimentoIdIgnorado
    && !gruposIgnoradosIds.has(texto(item.grupo_agendamento_id)),
  ).map((item) => texto(item.id)))
  const etapasAtivas = new Set(atendimentoEtapas.filter((item) => atendimentosAtivos.has(texto(item.atendimento_id))).map((item) => texto(item.id)))

  return {
    configuracao: { granularidadeMinutos: GRANULARIDADE_CANDIDATOS_V1, esperaNormalMinutos: numero(configuracao.espera_normal_minutos), timezone },
    pets: pets.map(paraPet),
    servicos: servicos.map((item) => ({ id: texto(item.id), nome: texto(item.nome), ativo: Boolean(item.ativo) })),
    dependencias: dependencias.map((item) => ({ servicoId: texto(item.servico_id), dependenciaServicoId: texto(item.dependencia_servico_id), ativo: Boolean(item.ativo) })),
    acoplamentos: acoplamentos.map((item) => ({ servicoId: texto(item.servico_id), etapaAlvoId: texto(item.etapa_alvo_id), ativo: Boolean(item.ativo) })),
    elegibilidade: {
      especies: especies.map((item) => ({ servicoId: texto(item.servico_id), especie: texto(item.especie) as NonNullable<PetMotor['especie']>, ativo: Boolean(item.ativo) })),
      portes: portes.map((item) => ({ servicoId: texto(item.servico_id), porte: texto(item.porte) as NonNullable<PetMotor['porte']>, ativo: Boolean(item.ativo) })),
      racasBloqueadas: racasBloqueadas.map((item) => ({ servicoId: texto(item.servico_id), racaId: texto(item.raca_id), ativo: Boolean(item.ativo) })),
    },
    etapas: etapas.map((item) => ({ id: texto(item.id), servicoId: texto(item.servico_id), nome: texto(item.nome), ordem: numero(item.ordem), duracaoMinutos: numero(item.duracao_minutos), ativo: Boolean(item.ativo), politicaEsperaAntes: texto(item.politica_espera_antes) as DadosDisponibilidade['etapas'][number]['politicaEsperaAntes'], esperaAntesMinutos: nuloOuNumero(item.espera_antes_minutos) })),
    recursosEtapas: recursos.map((item) => ({ id: texto(item.id), servicoEtapaId: texto(item.servico_etapa_id), tipo: texto(item.tipo) as 'funcionario' | 'equipamento', equipamentoId: nuloOuTexto(item.equipamento_id), quantidade: numero(item.quantidade), ativo: Boolean(item.ativo) })),
    modificadoresDuracao: modificadores.map((item) => ({ id: texto(item.id), servicoId: texto(item.servico_id), servicoEtapaId: nuloOuTexto(item.servico_etapa_id), criterio: texto(item.criterio) as DadosDisponibilidade['modificadoresDuracao'][number]['criterio'], acrescimoMinutos: numero(item.acrescimo_minutos), ativo: Boolean(item.ativo), racaId: nuloOuTexto(item.raca_id), porte: nuloOuTexto(item.porte) as DadosDisponibilidade['modificadoresDuracao'][number]['porte'], pelagem: nuloOuTexto(item.pelagem) as DadosDisponibilidade['modificadoresDuracao'][number]['pelagem'], temperamento: nuloOuTexto(item.temperamento) as DadosDisponibilidade['modificadoresDuracao'][number]['temperamento'], pesoMin: nuloOuNumero(item.peso_min), pesoMax: nuloOuNumero(item.peso_max) })),
    funcionamentoConfigurado: blocos.length > 0,
    blocosEstabelecimento: blocos.map((item) => ({ diaSemana: numero(item.dia_semana), inicio: horaParaMinutos(texto(item.inicio)), fim: horaParaMinutos(texto(item.fim)), ativo: Boolean(item.ativo) })),
    excecoesEstabelecimento: montarExcecoes(excecoes, excecaoBlocos),
    funcionarios: funcionarios.map((item) => ({ id: texto(item.id), nome: texto(item.nome), ativo: Boolean(item.ativo) })),
    jornadas: jornadas.map((item) => ({ funcionarioId: texto(item.funcionario_id), diaSemana: numero(item.dia_semana), inicio: horaParaMinutos(texto(item.inicio)), fim: horaParaMinutos(texto(item.fim)), ativo: Boolean(item.ativo) })),
    intervalosFuncionarios: intervalos.map((item) => ({ funcionarioId: texto(item.funcionario_id), diaSemana: numero(item.dia_semana), inicio: horaParaMinutos(texto(item.inicio)), fim: horaParaMinutos(texto(item.fim)), ativo: Boolean(item.ativo) })),
    habilitacoes: {
      servicos: funcionarioServicos.map((item) => ({ funcionarioId: texto(item.funcionario_id), servicoId: texto(item.servico_id), ativo: Boolean(item.ativo) })),
      etapas: funcionarioEtapas.map((item) => ({ funcionarioId: texto(item.funcionario_id), servicoEtapaId: texto(item.servico_etapa_id), ativo: Boolean(item.ativo) })),
    },
    equipamentos: equipamentos.map((item) => ({ id: texto(item.id), nome: texto(item.nome), ativo: Boolean(item.ativo), separarPorSexo: Boolean(item.separar_por_sexo), exigeSupervisaoHumana: Boolean(item.exige_supervisao_humana) })),
    unidadesEquipamentos: unidades.map((item) => ({ id: texto(item.id), equipamentoId: texto(item.equipamento_id), numero: numero(item.numero), nome: texto(item.nome), ativo: Boolean(item.ativo) })),
    perfisCapacidade: perfis.map((item) => ({ id: texto(item.id), equipamentoId: texto(item.equipamento_id), ativo: Boolean(item.ativo) })),
    itensPerfisCapacidade: itensPerfis.map((item) => ({ perfilId: texto(item.perfil_id), porte: texto(item.porte) as NonNullable<PetMotor['porte']>, quantidade: numero(item.quantidade), ativo: Boolean(item.ativo) })),
    reservasFuncionarios: [...reservasFuncionarios.filter((item) => etapasAtivas.has(texto(item.atendimento_etapa_id))).flatMap((item) => periodoNaData(item, entrada.data, timezone) ? [{ id: texto(item.id), funcionarioId: texto(item.funcionario_id), ...periodoNaData(item, entrada.data, timezone)! }] : []),...reservasPlanoFuncionarios(reservasCiclos)],
    reservasEquipamentos: [...reservasEquipamentos.filter((item) => etapasAtivas.has(texto(item.atendimento_etapa_id))).flatMap((item) => periodoNaData(item, entrada.data, timezone) ? [{ id: texto(item.id), unidadeId: texto(item.equipamento_unidade_id), porte: texto(item.porte_snapshot) as NonNullable<PetMotor['porte']>, sexo: texto(item.sexo_snapshot) as NonNullable<PetMotor['sexo']>, ...periodoNaData(item, entrada.data, timezone)! }] : []),...reservasPlanoEquipamentos(reservasCiclos)],
    ciclosTaxidog: ciclosTaxidog.map((item) => ({
      id: texto(item.id), nome: texto(item.nome), ordem: numero(item.ordem),
      coletaInicio: horaParaMinutos(texto(item.coleta_inicio)),
      coletaFim: horaParaMinutos(texto(item.coleta_fim)),
      conclusaoLimite: horaParaMinutos(texto(item.conclusao_limite)),
      ativo: Boolean(item.ativo),
      diasSemana: cicloDias.filter((dia) => texto(dia.ciclo_id) === texto(item.id) && Boolean(dia.ativo)).map((dia) => numero(dia.dia_semana)),
    })),
  }
}

function paraPet(item: Linha): PetMotor {
  const raca = Array.isArray(item.raca) ? item.raca[0] as Linha | undefined : item.raca as Linha | undefined
  return { id: texto(item.id), clienteId: texto(item.cliente_id), nome: texto(item.nome), especie: nuloOuTexto(item.especie) as PetMotor['especie'], racaId: nuloOuTexto(item.raca_id), racaNome: nuloOuTexto(raca?.nome), sexo: nuloOuTexto(item.sexo) as PetMotor['sexo'], porte: nuloOuTexto(item.porte) as PetMotor['porte'], pelagem: nuloOuTexto(item.pelagem) as PetMotor['pelagem'], peso: nuloOuNumero(item.peso), temperamento: nuloOuTexto(item.temperamento) as PetMotor['temperamento'] }
}

function montarExcecoes(excecoes: Linha[], blocos: Linha[]): ExcecaoEstabelecimentoMotor[] {
  return excecoes.map((item) => ({ data: texto(item.data), fechado: Boolean(item.fechado), blocos: blocos.filter((bloco) => texto(bloco.excecao_id) === texto(item.id)).map((bloco) => ({ inicio: horaParaMinutos(texto(bloco.inicio)), fim: horaParaMinutos(texto(bloco.fim)) })) }))
}

function periodoNaData(item: Linha, data: string, timezone: string) {
  const inicio = partesData(texto(item.inicio_planejado), timezone)
  const fim = partesData(texto(item.fim_planejado), timezone)
  if (inicio.data !== data || fim.data !== data) return null
  return { inicio: inicio.minutos, fim: fim.minutos }
}

function reservasPlanoFuncionarios(ocorrencias: Linha[]) {
  return ocorrencias.flatMap((ocorrencia) => {
    const plano = registro(ocorrencia.plano_operacional)
    const etapas = Array.isArray(plano.etapas) ? plano.etapas : []
    return etapas.flatMap((valor, etapaIndice) => {
      const etapa = registro(valor)
      const funcionarios = Array.isArray(etapa.funcionarios) ? etapa.funcionarios : []
      return funcionarios.map((funcionario, indice) => ({
        id: `ciclo:${texto(ocorrencia.id)}:f:${etapaIndice}:${indice}`,
        funcionarioId: texto(registro(funcionario).id),
        inicio: numero(etapa.inicio), fim: numero(etapa.fim),
      }))
    })
  })
}

function reservasPlanoEquipamentos(ocorrencias: Linha[]) {
  return ocorrencias.flatMap((ocorrencia) => {
    const plano = registro(ocorrencia.plano_operacional)
    const etapas = Array.isArray(plano.etapas) ? plano.etapas : []
    return etapas.flatMap((valor, etapaIndice) => {
      const etapa = registro(valor)
      const equipamentos = Array.isArray(etapa.equipamentos) ? etapa.equipamentos : []
      return equipamentos.map((equipamento, indice) => {
        const item = registro(equipamento)
        return {
          id: `ciclo:${texto(ocorrencia.id)}:e:${etapaIndice}:${indice}`,
          unidadeId: texto(item.unidadeId), inicio: numero(etapa.inicio), fim: numero(etapa.fim),
          porte: texto(plano.petPorte) as NonNullable<PetMotor['porte']>, sexo: texto(plano.petSexo) as NonNullable<PetMotor['sexo']>,
        }
      })
    })
  })
}

function registro(valor: unknown): Linha {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Linha : {}
}

function partesData(valor: string, timezone: string) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(valor))
  const obter = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? ''
  return { data: `${obter('year')}-${obter('month')}-${obter('day')}`, minutos: Number(obter('hour')) * 60 + Number(obter('minute')) }
}

function texto(valor: unknown) { return valor === null || valor === undefined ? '' : String(valor) }
function nuloOuTexto(valor: unknown) { return valor === null || valor === undefined ? null : String(valor) }
function numero(valor: unknown) { const convertido = Number(valor); return Number.isFinite(convertido) ? convertido : 0 }
function nuloOuNumero(valor: unknown) { return valor === null || valor === undefined ? null : numero(valor) }
