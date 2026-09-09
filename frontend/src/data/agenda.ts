import { supabase } from '../lib/supabase'
import type {
  Atendimento,
  AtendimentoEtapa,
  Equipamento,
  EquipamentoPerfilCapacidade,
  EquipamentoPerfilItem,
  EquipamentoUnidade,
  EstruturaAgenda,
  Funcionario,
  FuncionarioIntervalo,
  FuncionarioEtapa,
  FuncionarioJornada,
  FuncionarioServico,
  JanelaTransporte,
  TaxidogCiclo,
  TaxidogCicloDia,
  Servico,
  ServicoEtapa,
  ServicoEtapaRecurso,
  ServicoModificador,
  ServicoDependencia,
  ServicoAcoplamento,
  ServicoEspecie,
  ServicoPorte,
  ServicoRacaBloqueada,
  ServicoRegraPreco,
} from '../types/Agenda'

async function consultar<T>(tabela: string, colunas: string) {
  const { data, error } = await supabase.from(tabela).select(colunas)

  if (error) throw error
  return data as T[]
}

async function consultarServicos(): Promise<Servico[]> {
  const { data, error } = await supabase
    .from('servicos')
    .select('id, nome, descricao, ativo, preco_base, agendamento_cliente, created_at')

  if (error) throw error

  return (data ?? []).map((servico) => ({
    id: servico.id as string,
    nome: servico.nome as string,
    descricao: servico.descricao as string,
    ativo: servico.ativo as boolean,
    precoBase: normalizarNumero(servico.preco_base),
    agendamentoCliente: Boolean(servico.agendamento_cliente),
    criadoEm: servico.created_at as string,
  }))
}

function normalizarNumero(valor: unknown) {
  if (valor === null || valor === undefined || valor === '') return 0
  const numero = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

export async function carregarEstruturaAgenda(): Promise<EstruturaAgenda> {
  const [
    servicos,
    servicoEtapas,
    servicoEtapaRecursos,
    servicoModificadores,
    servicoRegrasPreco,
    servicoEspecies,
    servicoPortes,
    servicoRacasBloqueadas,
    servicoDependencias,
    servicoAcoplamentos,
    funcionarios,
    funcionarioJornadas,
    funcionarioIntervalos,
    funcionarioServicos,
    funcionarioEtapas,
    equipamentos,
    equipamentoPerfis,
    equipamentoPerfilItens,
    equipamentoUnidades,
    janelasTransporte,
    taxidogCiclos,
    taxidogCicloDias,
    atendimentos,
    atendimentoEtapas,
  ] = await Promise.all([
    consultarServicos(),
    consultar<ServicoEtapa>(
      'servico_etapas',
      'id, servicoId:servico_id, nome, ordem, duracaoMinutos:duracao_minutos, recurso, equipamentoId:equipamento_id, ativo, politicaEsperaAntes:politica_espera_antes, esperaAntesMinutos:espera_antes_minutos',
    ),
    consultar<ServicoEtapaRecurso>(
      'servico_etapa_recursos',
      'id, servicoEtapaId:servico_etapa_id, tipo, equipamentoId:equipamento_id, quantidade, ativo',
    ),
    consultar<ServicoModificador>(
      'servico_modificadores',
      'id, servicoId:servico_id, servicoEtapaId:servico_etapa_id, criterio, valor, acrescimoMinutos:acrescimo_minutos, ativo, racaId:raca_id, porte, pelagem, temperamento, pesoMin:peso_min, pesoMax:peso_max',
    ),
    consultar<ServicoRegraPreco>(
      'servico_regras_preco',
      'id, servicoId:servico_id, criterio, porte, pelagem, racaId:raca_id, pesoMin:peso_min, pesoMax:peso_max, temperamento, acrescimoValor:acrescimo_valor, ativo',
    ),
    consultar<ServicoEspecie>('servico_especies', 'servicoId:servico_id, especie, ativo'),
    consultar<ServicoPorte>('servico_portes', 'servicoId:servico_id, porte, ativo'),
    consultar<ServicoRacaBloqueada>('servico_racas_bloqueadas', 'servicoId:servico_id, racaId:raca_id, ativo'),
    consultar<ServicoDependencia>('servico_dependencias', 'servicoId:servico_id, dependenciaServicoId:dependencia_servico_id, ativo'),
    consultar<ServicoAcoplamento>('servico_acoplamentos', 'servicoId:servico_id, etapaAlvoId:etapa_alvo_id, ativo'),
    consultar<Funcionario>(
      'funcionarios',
      'id, nome, ativo, criadoEm:created_at',
    ),
    consultar<FuncionarioJornada>(
      'funcionario_jornadas',
      'id, funcionarioId:funcionario_id, diaSemana:dia_semana, inicio, fim, ativo',
    ),
    consultar<FuncionarioIntervalo>(
      'funcionario_intervalos',
      'id, funcionarioId:funcionario_id, diaSemana:dia_semana, inicio, fim, descricao, ativo',
    ),
    consultar<FuncionarioServico>(
      'funcionario_servicos',
      'funcionarioId:funcionario_id, servicoId:servico_id, ativo',
    ),
    consultar<FuncionarioEtapa>(
      'funcionario_etapas',
      'funcionarioId:funcionario_id, servicoEtapaId:servico_etapa_id, ativo',
    ),
    consultar<Equipamento>(
      'equipamentos',
      'id, nome, tipo, quantidadeUnidades:quantidade_unidades, ativo, criadoEm:created_at, separarPorSexo:separar_por_sexo, exigeSupervisaoHumana:exige_supervisao_humana',
    ),
    consultar<EquipamentoPerfilCapacidade>(
      'equipamento_perfis_capacidade',
      'id, equipamentoId:equipamento_id, nome, ativo',
    ),
    consultar<EquipamentoPerfilItem>(
      'equipamento_perfil_itens',
      'id, perfilId:perfil_id, porte, quantidade, ativo',
    ),
    consultar<EquipamentoUnidade>(
      'equipamento_unidades',
      'id, equipamentoId:equipamento_id, numero, nome, ativo',
    ),
    consultar<JanelaTransporte>(
      'janelas_transporte',
      'id, nome, coletaInicio:coleta_inicio, coletaFim:coleta_fim, operacaoInicio:operacao_inicio, operacaoFim:operacao_fim, entregaInicio:entrega_inicio, ativo',
    ),
    consultar<TaxidogCiclo>(
      'taxidog_ciclos',
      'id, nome, ordem, coletaInicio:coleta_inicio, coletaFim:coleta_fim, conclusaoLimite:conclusao_limite, ativo',
    ),
    consultar<TaxidogCicloDia>(
      'taxidog_ciclo_dias',
      'cicloId:ciclo_id, diaSemana:dia_semana, ativo',
    ),
    consultar<Atendimento>(
      'atendimentos',
      'id, petId:pet_id, servicoId:servico_id, inicioPlanejado:inicio_planejado, status, transporte, janelaTransporteId:janela_transporte_id, valorTransporte:valor_transporte, observacoes, criadoEm:created_at, atualizadoEm:updated_at',
    ),
    consultar<AtendimentoEtapa>(
      'atendimento_etapas',
      'id, atendimentoId:atendimento_id, servicoEtapaId:servico_etapa_id, inicioPlanejado:inicio_planejado, fimPlanejado:fim_planejado, funcionarioId:funcionario_id, equipamentoId:equipamento_id, unidadeEquipamento:unidade_equipamento',
    ),
  ])

  return {
    servicos,
    servicoEtapas,
    servicoEtapaRecursos,
    servicoModificadores,
    servicoRegrasPreco,
    servicoEspecies,
    servicoPortes,
    servicoRacasBloqueadas,
    servicoDependencias,
    servicoAcoplamentos,
    funcionarios,
    funcionarioJornadas,
    funcionarioIntervalos,
    funcionarioServicos,
    funcionarioEtapas,
    equipamentos,
    equipamentoPerfis,
    equipamentoPerfilItens,
    equipamentoUnidades,
    janelasTransporte,
    taxidogCiclos,
    taxidogCicloDias,
    atendimentos,
    atendimentoEtapas,
  }
}
