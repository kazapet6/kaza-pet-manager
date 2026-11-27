export type EstadoMaterializacaoCiclo = 'pendente' | 'materializando' | 'materializado' | 'erro'

export type ResultadoMaterializacaoCiclo =
  | { status: 'materializado'; cicloId: string; atendimentos: { ocorrenciaId: string; atendimentoId: string }[]; reutilizado: boolean }
  | { status: 'materializando'; codigo: 'MATERIALIZACAO_EM_ANDAMENTO'; mensagem: string; cicloId: string }
  | { status: 'erro'; codigo: string; mensagem: string; cicloId: string; campos?: readonly string[] }
  | { status: 'invalido' | 'conflito'; codigo: string; mensagem: string; cicloId: string; campos?: readonly string[] }
