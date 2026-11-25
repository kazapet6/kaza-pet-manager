import type { OpcaoDisponibilidade, ResultadoDisponibilidade } from './tipos.ts'

export function funcionarioResponsavelDaOpcao(opcao: Pick<OpcaoDisponibilidade, 'etapas'>): string | null {
  const ids = new Set(opcao.etapas.flatMap((etapa) => etapa.funcionarios.map((funcionario) => funcionario.id)))
  return ids.size === 1 ? [...ids][0] : null
}

export function exigirResponsavelUnico(resultado: ResultadoDisponibilidade): ResultadoDisponibilidade {
  if (resultado.estado !== 'OK') return resultado
  const opcoes = resultado.opcoes.filter((opcao) => funcionarioResponsavelDaOpcao(opcao) !== null)
  return opcoes.length
    ? { ...resultado, opcoes }
    : {
        ...resultado,
        estado: 'SEM_DISPONIBILIDADE',
        opcoes: [],
        motivos: ['Nenhum funcionário possui capacidade para assumir o atendimento completo.'],
      }
}
