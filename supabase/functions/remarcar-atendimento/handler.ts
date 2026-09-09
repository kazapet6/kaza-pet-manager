import { lerRemarcacaoIntent, type RemarcacaoIntent, type RemarcacaoResposta } from '../../../frontend/src/remarcacao/contrato.ts'

type Usuario = { app_metadata?: Record<string, unknown> }
type ClienteAuth = { auth: { getUser(token: string): Promise<{ data: { user: Usuario | null }; error: unknown }> } }
export type DependenciasRemarcacao = { validarToken(token: string): Promise<Usuario | null>; remarcar(item: RemarcacaoIntent): Promise<RemarcacaoResposta> }

export function criarHandlerRemarcacao(deps: DependenciasRemarcacao, origens: ReadonlySet<string>) {
  return async (request: Request) => {
    const origem = request.headers.get('origin'); const cors: Record<string, string> = origem && origens.has(origem) ? { 'access-control-allow-origin': origem, vary: 'Origin' } : {}
    if (origem && !origens.has(origem)) return json(403, { mensagem: 'Origem nao permitida.' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } })
    if (request.method !== 'POST') return json(405, { mensagem: 'Metodo nao permitido.' }, cors)
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json(415, { mensagem: 'Content-Type deve ser application/json.' }, cors)
    const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return json(401, { mensagem: 'Autenticacao obrigatoria.' }, cors)
    const usuario = await deps.validarToken(token)
    if (!usuario) return json(401, { mensagem: 'Sessao invalida ou expirada.' }, cors)
    if (usuario.app_metadata?.role !== 'internal') return json(403, { mensagem: 'Acesso nao autorizado.' }, cors)
    let corpo: unknown; try { corpo = await request.json() } catch { return json(400, invalida('JSON invalido.'), cors) }
    const intencao = lerRemarcacaoIntent(corpo)
    if (!intencao) return json(400, invalida('Intencao de remarcacao invalida.'), cors)
    try { return json(200, await deps.remarcar(intencao), cors) } catch (erro) {
      console.error({ evento: 'remarcacao_edge_erro', tipo: erro instanceof Error ? erro.name : 'ErroDesconhecido', mensagem: 'Falha interna durante a remarcacao.' })
      return json(500, { mensagem: 'Nao foi possivel remarcar o atendimento.' }, cors)
    }
  }
}
export function criarValidadorTokenRemarcacao(cliente: ClienteAuth) { return async (token: string) => { const { data, error } = await cliente.auth.getUser(token); return error ? null : data.user } }
function invalida(mensagem: string): RemarcacaoResposta { return { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem } }
function json(status: number, corpo: unknown, headers: Record<string, string> = {}) { return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } }) }
