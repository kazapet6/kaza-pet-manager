import type { ResultadoMaterializacaoCiclo } from '../_shared/materializacao-contrato.ts'

type Usuario = { id: string; app_metadata?: Record<string, unknown> }
type Dependencias = {
  validarToken(token: string): Promise<Usuario | null>
  materializar(cicloId: string, usuarioId: string): Promise<ResultadoMaterializacaoCiclo>
}

export function criarHandlerMaterializacao(deps: Dependencias, origens: ReadonlySet<string>) {
  return async (req: Request) => {
    const origem = req.headers.get('origin')
    const cors: Record<string, string> = origem && origens.has(origem) ? { 'access-control-allow-origin': origem, vary: 'Origin' } : {}
    if (origem && !origens.has(origem)) return json(403, { mensagem: 'Origem não permitida.' })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } })
    if (req.method !== 'POST') return json(405, { mensagem: 'Método não permitido.' }, cors)
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
    if (!token) return json(401, { mensagem: 'Autenticação obrigatória.' }, cors)
    const usuario = await deps.validarToken(token)
    if (!usuario) return json(401, { mensagem: 'Sessão inválida.' }, cors)
    if (usuario.app_metadata?.role !== 'internal') return json(403, { mensagem: 'Acesso não autorizado.' }, cors)
    try {
      const corpo = await req.json() as Record<string, unknown>
      const cicloId = typeof corpo.cicloId === 'string' ? corpo.cicloId : ''
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cicloId)) return json(400, { status: 'invalido', codigo: 'CICLO_INVALIDO', mensagem: 'Informe um Ciclo válido.' }, cors)
      return json(200, await deps.materializar(cicloId, usuario.id), cors)
    } catch (erro) {
      console.error({ evento: 'materializar_ciclo_edge_erro', mensagem: erro instanceof Error ? erro.message : 'Falha desconhecida' })
      return json(500, { mensagem: 'Não foi possível criar a Agenda do Ciclo.' }, cors)
    }
  }
}

export function criarValidadorMaterializacao(cliente: { auth: { getUser(token: string): Promise<{ data: { user: Usuario | null }; error: unknown }> } }) {
  return async (token: string) => { const resposta = await cliente.auth.getUser(token); return resposta.error ? null : resposta.data.user }
}
function json(status: number, body: unknown, headers: Record<string, string> = {}) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } }) }
