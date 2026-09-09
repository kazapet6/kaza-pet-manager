export type ErroLeituraMaterializacao = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export type RespostaLeituraMaterializacao<T> = {
  data: T | null
  error: ErroLeituraMaterializacao | null
  status?: number
  statusText?: string
}

type ContextoLeitura = {
  cicloId: string
  etapa: string
}

type NivelLog = 'error' | 'warn'
type Registrador = (nivel: NivelLog, dados: Record<string, unknown>) => void

export async function executarLeituraMaterializacao<T>(
  executar: () => PromiseLike<RespostaLeituraMaterializacao<T>>,
  contexto: ContextoLeitura,
  registrar: Registrador = registrarNoConsole,
): Promise<RespostaLeituraMaterializacao<T>> {
  const primeira = await executar()
  if (!primeira.error) return primeira

  registrar('error', logErro(contexto, primeira, 1))
  if (primeira.error.code !== 'PGRST303') return primeira

  const segunda = await executar()
  if (segunda.error) {
    registrar('error', logErro(contexto, segunda, 2))
    return segunda
  }

  registrar('warn', {
    evento: 'materializacao_carregamento_recuperado',
    ciclo_id: contexto.cicloId,
    etapa: contexto.etapa,
    tentativa: 2,
    erro_anterior: 'PGRST303',
  })
  return segunda
}

function logErro<T>(
  contexto: ContextoLeitura,
  resposta: RespostaLeituraMaterializacao<T>,
  tentativa: number,
) {
  return {
    evento: 'materializacao_carregamento_erro',
    ciclo_id: contexto.cicloId,
    etapa: contexto.etapa,
    tentativa,
    status: resposta.status ?? null,
    error: {
      code: sanitizar(resposta.error?.code),
      message: sanitizar(resposta.error?.message),
      details: sanitizar(resposta.error?.details),
      hint: sanitizar(resposta.error?.hint),
    },
  }
}

function sanitizar(valor: string | null | undefined) {
  if (!valor) return null
  return valor
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, '[KEY REDACTED]')
    .slice(0, 1000)
}

function registrarNoConsole(nivel: NivelLog, dados: Record<string, unknown>) {
  if (nivel === 'warn') console.warn(dados)
  else console.error(dados)
}
