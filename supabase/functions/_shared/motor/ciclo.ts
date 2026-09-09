import type { ResultadoDisponibilidade, ResultadoDisponibilidadeCiclo } from './tipos.ts'

export function resumirDisponibilidadeDoCiclo(resultado: ResultadoDisponibilidade): ResultadoDisponibilidadeCiclo {
  const opcao = resultado.estado === 'OK' ? resultado.opcoes[0] ?? null : null
  return { estado: resultado.estado, data: resultado.data, disponivel: opcao !== null, opcao, motivos: resultado.motivos }
}
