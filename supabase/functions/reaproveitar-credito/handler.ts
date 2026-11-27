import { lerIntencao044, type Intencao044, type Resposta044 } from '../_shared/reaproveitamento-044.ts'
type Deps = { validarToken(token: string): Promise<{ id: string; app_metadata?: Record<string, unknown> } | null>; executar(i: Intencao044, usuarioId: string): Promise<Resposta044> }
export function criarHandler044(d: Deps, origens: ReadonlySet<string>) { return async (req: Request) => {
 const origem = req.headers.get('origin'), cors: Record<string, string> = origem && origens.has(origem) ? { 'access-control-allow-origin': origem, vary: 'Origin' } : {}
 if (origem && !origens.has(origem)) return json(403, { mensagem: 'Origem não permitida.' })
 if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } })
 if (req.method !== 'POST') return json(405, { mensagem: 'Método não permitido.' }, cors)
 const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
 if (!token) return json(401, { mensagem: 'Autenticação obrigatória.' }, cors)
 try {
  const user = await d.validarToken(token)
  if (!user) return json(401, { mensagem: 'Sessão inválida.' }, cors)
  if (user.app_metadata?.role !== 'internal') return json(403, { mensagem: 'Acesso não autorizado.' }, cors)
  let body: unknown
  try { body = await req.json() } catch { return json(400, { status: 'invalido', codigo: 'JSON_INVALIDO', mensagem: 'JSON inválido.' }, cors) }
  const i = lerIntencao044(body)
  if (!i) return json(400, { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem: 'Dados de reaproveitamento inválidos.' }, cors)
  return json(200, await d.executar(i, user.id), cors)
 } catch { console.error({ evento: 'reaproveitar_credito_044_erro', mensagem: 'Resultado não confirmado.' }); return json(500, { status: 'erro', codigo: 'RESULTADO_NAO_CONFIRMADO', mensagem: 'Não foi possível confirmar o resultado. Retome a mesma tentativa.' }, cors) }
} }
function json(status: number, body: unknown, headers: Record<string, string> = {}) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } }) }
