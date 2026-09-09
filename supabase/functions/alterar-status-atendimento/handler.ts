import { lerAlterarStatusIntent, type AlterarStatusIntent, type AlterarStatusResposta } from '../_shared/status-atendimento.ts'

type Usuario = { id: string; app_metadata?: Record<string, unknown> }
export type DependenciasStatus = {
  validarToken(token: string): Promise<Usuario | null>
  alterar(intencao: AlterarStatusIntent, usuarioId: string): Promise<AlterarStatusResposta>
}
type ClienteAuth = { auth: { getUser(token: string): Promise<{ data: { user: Usuario | null }; error: unknown }> } }

export function criarHandlerStatus(dependencias: DependenciasStatus, origensPermitidas: ReadonlySet<string>) {
  return async (requisicao: Request) => {
    const origem = requisicao.headers.get('origin')
    const cors: Record<string, string> = origem && origensPermitidas.has(origem) ? { 'access-control-allow-origin': origem, vary: 'Origin' } : {}
    if (origem && !origensPermitidas.has(origem)) return json(403, { mensagem: 'Origem nao permitida.' })
    if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } })
    if (requisicao.method !== 'POST') return json(405, { mensagem: 'Metodo nao permitido.' }, cors)
    if (!requisicao.headers.get('content-type')?.toLowerCase().includes('application/json')) return json(415, { mensagem: 'Content-Type deve ser application/json.' }, cors)
    const token = bearer(requisicao.headers.get('authorization'))
    if (!token) return json(401, { mensagem: 'Autenticacao obrigatoria.' }, cors)
    const usuario = await dependencias.validarToken(token)
    if (!usuario) return json(401, { mensagem: 'Sessao invalida ou expirada.' }, cors)
    if (usuario.app_metadata?.role !== 'internal') return json(403, { mensagem: 'Acesso nao autorizado.' }, cors)
    let corpo: unknown
    try { corpo = await requisicao.json() } catch { return json(400, invalida('JSON invalido.'), cors) }
    const intencao = lerAlterarStatusIntent(corpo)
    if (!intencao) return json(400, invalida('Intencao de status invalida.'), cors)
    try { return json(200, await dependencias.alterar(intencao, usuario.id), cors) } catch (erro) {
      console.error({ evento: 'status_atendimento_edge_erro', tipo: nomeSeguroErro(erro), mensagem: 'Falha interna ao alterar status.' })
      return json(500, { mensagem: 'Nao foi possivel atualizar o atendimento.' }, cors)
    }
  }
}
export function criarValidadorTokenStatus(cliente: ClienteAuth) { return async (token: string) => { const { data, error } = await cliente.auth.getUser(token); return error ? null : data.user } }
function bearer(valor: string | null) { return /^Bearer\s+(.+)$/i.exec(valor ?? '')?.[1] ?? null }
function nomeSeguroErro(erro: unknown) { return erro instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(erro.name) ? erro.name : 'ErroDesconhecido' }
function invalida(mensagem: string): AlterarStatusResposta { return { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem } }
function json(status: number, corpo: unknown, headers: Record<string, string> = {}) { return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } }) }
