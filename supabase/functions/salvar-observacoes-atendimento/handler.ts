import { lerObservacoesIntent, type ObservacoesIntent, type ObservacoesResposta } from '../../../frontend/src/observacoesAtendimento/contrato.ts'

type Usuario = { app_metadata?: Record<string, unknown> }
export type DependenciasObservacoes = { validarToken(token: string): Promise<Usuario | null>; executar(intencao: ObservacoesIntent): Promise<ObservacoesResposta> }
type ClienteAuth = { auth: { getUser(token: string): Promise<{ data: { user: Usuario | null }; error: unknown }> } }

export function criarHandlerObservacoes(dependencias: DependenciasObservacoes, origensPermitidas: ReadonlySet<string>) {
  return async (requisicao: Request) => {
    const origem = requisicao.headers.get('origin')
    const cors: Record<string, string> = origem && origensPermitidas.has(origem) ? { 'access-control-allow-origin': origem, vary: 'Origin' } : {}
    if (origem && !origensPermitidas.has(origem)) return json(403, { mensagem: 'Origem nao permitida.' })
    if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } })
    if (requisicao.method !== 'POST') return json(405, { mensagem: 'Metodo nao permitido.' }, cors)
    const token = bearer(requisicao.headers.get('authorization'))
    if (!token) return json(401, { mensagem: 'Autenticacao obrigatoria.' }, cors)
    const usuario = await dependencias.validarToken(token)
    if (!usuario) return json(401, { mensagem: 'Sessao invalida ou expirada.' }, cors)
    if (usuario.app_metadata?.role !== 'internal') return json(403, { mensagem: 'Acesso nao autorizado.' }, cors)
    let corpo: unknown
    try { corpo = await requisicao.json() } catch { return json(400, invalida('JSON invalido.'), cors) }
    const intencao = lerObservacoesIntent(corpo)
    if (!intencao) return json(400, invalida('Intencao de observacoes invalida.'), cors)
    try { return json(200, await dependencias.executar(intencao), cors) } catch (erro) {
      console.error({ evento: 'observacoes_atendimento_edge_erro', tipo: erro instanceof Error ? erro.name : 'ErroDesconhecido', mensagem: 'Falha interna ao processar observacoes.' })
      return json(500, { mensagem: 'Nao foi possivel processar as observacoes.' }, cors)
    }
  }
}
export function criarValidadorTokenObservacoes(cliente: ClienteAuth) { return async (token: string) => { const { data, error } = await cliente.auth.getUser(token); return error ? null : data.user } }
function bearer(valor: string | null) { return /^Bearer\s+(.+)$/i.exec(valor ?? '')?.[1] ?? null }
function invalida(mensagem: string): ObservacoesResposta { return { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem } }
function json(status: number, corpo: unknown, headers: Record<string, string> = {}) { return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } }) }
