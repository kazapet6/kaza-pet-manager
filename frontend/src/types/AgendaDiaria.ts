export type AgendaDiariaFuncionario = { id: string; nome: string }

export type AgendaDiariaFinanceiro = {
  valorFinal: number
  totalRecebido: number
  saldo: number
  situacao: 'pendente' | 'parcial' | 'pago' | 'isento'
}

export type AgendaDiariaEtapa = {
  id: string
  nome: string
  ordem: number
  inicio: string
  fim: string
  funcionarios: AgendaDiariaFuncionario[]
  equipamentos: { id: string; nome: string; unidade: string }[]
}

export type AgendaDiariaVinculoContrato = {
  contratoId: string
  pacoteNome: string
  cicloId: string
  cicloNumero: number
  periodoInicio: string
  periodoFim: string
  ocorrenciaOrdem: number
  totalOcorrencias: number
}

export type AgendaDiariaAtendimento = {
  id: string
  grupoId: string
  clienteId: string
  petId: string
  dataOperacional: string
  inicio: string
  conclusao: string
  petNome: string
  tutorNome: string
  servicos: { id: string; servicoId: string; nome: string; origem: 'solicitado' | 'dependencia'; ordem: number; contratado: boolean }[]
  status: string
  modalidade: 'normal' | 'taxidog'
  observacoes: string
  valorFinal: number
  financeiro: AgendaDiariaFinanceiro | null
  vinculoContrato: AgendaDiariaVinculoContrato | null
  historicoOperacional: {
    tipo: 'recebido' | 'iniciado' | 'finalizado' | 'concluido'
    rotulo: string
    ocorridoEm: string
  }[]
  preferenciaFuncionario: 'automatico' | 'preferencial' | 'obrigatorio'
  funcionarioPreferidoId: string | null
  funcionarioResponsavelId: string | null
  funcionarioResponsavel: AgendaDiariaFuncionario | null
  etapas: AgendaDiariaEtapa[]
  esperas: { id: string; inicio: string; fim: string; motivo: string }[]
  taxidog: {
    cicloId: string
    cicloNome: string
    coletaInicio: string
    coletaFim: string
    conclusaoLimite: string
  } | null
}

export type AgendaDiariaSecao = {
  chave: string
  funcionario: AgendaDiariaFuncionario | null
  atendimentos: AgendaDiariaAtendimento[]
}

export type AgendaDiariaResultado = {
  dataOperacional: string
  timezone: string
  secoes: AgendaDiariaSecao[]
}
