import type { Pet } from './Pet.ts'
import type { StatusAtendimento } from '../statusAtendimento/contrato.ts'

export type { StatusAtendimento } from '../statusAtendimento/contrato.ts'

export type RecursoEtapa = 'funcionario' | 'equipamento' | 'nenhum'
export type PoliticaEsperaEtapa =
  | 'padrao'
  | 'personalizada'
  | 'sem_limite_operacional'
export type Servico = {
  id: string
  nome: string
  descricao: string
  ativo: boolean
  precoBase: number
  agendamentoCliente: boolean
  criadoEm: string
}

export type ServicoEtapa = {
  id: string
  servicoId: string
  nome: string
  ordem: number
  duracaoMinutos: number
  recurso: RecursoEtapa
  equipamentoId: string | null
  ativo: boolean
  politicaEsperaAntes: PoliticaEsperaEtapa
  esperaAntesMinutos: number | null
}

export type ServicoEtapaRecurso = {
  id: string
  servicoEtapaId: string
  tipo: 'funcionario' | 'equipamento'
  equipamentoId: string | null
  quantidade: number
  ativo: boolean
}

export type ServicoModificador = {
  id: string
  servicoId: string
  servicoEtapaId: string | null
  criterio: 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
  valor: string
  acrescimoMinutos: number
  ativo: boolean
  racaId: string | null
  porte: Pet['porte'] | null
  pelagem: Pet['pelagem'] | null
  temperamento: Pet['temperamento'] | null
  pesoMin: number | null
  pesoMax: number | null
}

export type ServicoRegraPreco = {
  id: string
  servicoId: string
  criterio: 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
  porte: Pet['porte'] | null
  pelagem: Pet['pelagem'] | null
  racaId: string | null
  pesoMin: number | null
  pesoMax: number | null
  temperamento: Pet['temperamento'] | null
  acrescimoValor: number
  ativo: boolean
}

export type ServicoEspecie = { servicoId: string; especie: Pet['especie']; ativo: boolean }
export type ServicoPorte = { servicoId: string; porte: Pet['porte']; ativo: boolean }
export type ServicoRacaBloqueada = { servicoId: string; racaId: string; ativo: boolean }
export type ServicoDependencia = { servicoId: string; dependenciaServicoId: string; ativo: boolean }
export type ServicoAcoplamento = { servicoId: string; etapaAlvoId: string; ativo: boolean }

export type Funcionario = {
  id: string
  nome: string
  ativo: boolean
  criadoEm: string
}

export type FuncionarioJornada = {
  id: string
  funcionarioId: string
  diaSemana: number
  inicio: string
  fim: string
  ativo: boolean
}

export type FuncionarioIntervalo = {
  id: string
  funcionarioId: string
  diaSemana: number
  inicio: string
  fim: string
  descricao: string
  ativo: boolean
}

export type FuncionarioServico = {
  funcionarioId: string
  servicoId: string
  ativo: boolean
}

export type FuncionarioEtapa = {
  funcionarioId: string
  servicoEtapaId: string
  ativo: boolean
}

export type Equipamento = {
  id: string
  nome: string
  tipo: string
  quantidadeUnidades: number
  ativo: boolean
  criadoEm: string
  separarPorSexo: boolean
  exigeSupervisaoHumana: boolean
}

export type EquipamentoPerfilCapacidade = {
  id: string
  equipamentoId: string
  nome: string
  ativo: boolean
}

export type EquipamentoPerfilItem = {
  id: string
  perfilId: string
  porte: Pet['porte']
  quantidade: number
  ativo: boolean
}

export type EquipamentoUnidade = { id: string; equipamentoId: string; numero: number; nome: string; ativo: boolean }

export type JanelaTransporte = {
  id: string
  nome: string
  coletaInicio: string
  coletaFim: string
  operacaoInicio: string
  operacaoFim: string
  entregaInicio: string | null
  ativo: boolean
}

export type TaxidogCiclo = {
  id: string
  nome: string
  ordem: number
  coletaInicio: string
  coletaFim: string
  conclusaoLimite: string
  ativo: boolean
}

export type TaxidogCicloDia = {
  cicloId: string
  diaSemana: number
  ativo: boolean
}

export type Atendimento = {
  id: string
  petId: string
  servicoId: string
  inicioPlanejado: string | null
  status: StatusAtendimento
  transporte: boolean
  janelaTransporteId: string | null
  valorTransporte: number
  observacoes: string
  criadoEm: string
  atualizadoEm: string
}

export type AtendimentoEtapa = {
  id: string
  atendimentoId: string
  servicoEtapaId: string
  inicioPlanejado: string
  fimPlanejado: string
  funcionarioId: string | null
  equipamentoId: string | null
  unidadeEquipamento: number | null
}

export type EstruturaAgenda = {
  servicos: Servico[]
  servicoEtapas: ServicoEtapa[]
  servicoEtapaRecursos: ServicoEtapaRecurso[]
  servicoModificadores: ServicoModificador[]
  servicoRegrasPreco: ServicoRegraPreco[]
  servicoEspecies: ServicoEspecie[]
  servicoPortes: ServicoPorte[]
  servicoRacasBloqueadas: ServicoRacaBloqueada[]
  servicoDependencias: ServicoDependencia[]
  servicoAcoplamentos: ServicoAcoplamento[]
  funcionarios: Funcionario[]
  funcionarioJornadas: FuncionarioJornada[]
  funcionarioIntervalos: FuncionarioIntervalo[]
  funcionarioServicos: FuncionarioServico[]
  funcionarioEtapas: FuncionarioEtapa[]
  equipamentos: Equipamento[]
  equipamentoPerfis: EquipamentoPerfilCapacidade[]
  equipamentoPerfilItens: EquipamentoPerfilItem[]
  equipamentoUnidades: EquipamentoUnidade[]
  janelasTransporte: JanelaTransporte[]
  taxidogCiclos: TaxidogCiclo[]
  taxidogCicloDias: TaxidogCicloDia[]
  atendimentos: Atendimento[]
  atendimentoEtapas: AtendimentoEtapa[]
}
