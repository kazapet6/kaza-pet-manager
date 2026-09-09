export type ResultadoMaterializacaoCiclo =
  | { status: 'materializado'; cicloId: string; atendimentos: { ocorrenciaId: string; atendimentoId: string }[]; reutilizado: boolean }
  | { status: 'invalido' | 'conflito'; codigo: string; mensagem: string; cicloId: string }
