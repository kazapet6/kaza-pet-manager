import type { ObservacoesAtendimento, ObservacoesResposta } from '../observacoesAtendimento/contrato.ts'
import type { ConclusaoDadosResposta, DadosConclusao, ServicoRetorno } from './contrato.ts'

export type EstadoCarregamentoConclusao =
  | { estado: 'carregando' }
  | { estado: 'pronto'; observacoes: ObservacoesAtendimento; dados: DadosConclusao }
  | { estado: 'erro'; mensagem: string }

export type EtapaConclusao = 0 | 1 | 2 | 3

type DependenciasCarregamento = {
  carregarObservacoes: () => Promise<ObservacoesResposta>
  carregarDados: () => Promise<ConclusaoDadosResposta>
}

export async function carregarEstadoConclusao(
  dependencias: DependenciasCarregamento,
): Promise<EstadoCarregamentoConclusao> {
  try {
    const [observacoes, dados] = await Promise.all([
      dependencias.carregarObservacoes(),
      dependencias.carregarDados(),
    ])
    if (observacoes.status !== 'carregado') {
      return { estado: 'erro', mensagem: mensagemResposta(observacoes, 'Nao foi possivel carregar as observacoes da conclusao.') }
    }
    if (dados.status !== 'carregado') {
      return { estado: 'erro', mensagem: mensagemResposta(dados, 'Nao foi possivel carregar os dados da conclusao.') }
    }
    return { estado: 'pronto', observacoes, dados }
  } catch {
    return { estado: 'erro', mensagem: 'Nao foi possivel carregar os dados da conclusao.' }
  }
}

export function proximaEtapaConclusao(etapa: EtapaConclusao): EtapaConclusao {
  return Math.min(3, etapa + 1) as EtapaConclusao
}

export function etapaAnteriorConclusao(etapa: EtapaConclusao): EtapaConclusao {
  return Math.max(0, etapa - 1) as EtapaConclusao
}

export function acaoPrincipalConclusao(etapa: EtapaConclusao): 'avancar' | 'concluir' {
  return etapa === 3 ? 'concluir' : 'avancar'
}

export function retornosForamAlterados(
  retornos: readonly ServicoRetorno[],
  intervalos: Readonly<Record<string, string>>,
) {
  return retornos.some((item) =>
    (intervalos[item.atendimentoServicoId] ?? '') !== (item.intervaloDias?.toString() ?? ''),
  )
}

function mensagemResposta(resposta: unknown, padrao: string) {
  return typeof resposta === 'object'
    && resposta !== null
    && 'mensagem' in resposta
    && typeof resposta.mensagem === 'string'
    ? resposta.mensagem
    : padrao
}
