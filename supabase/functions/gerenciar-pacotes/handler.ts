import { lerIntencaoGerenciarPacote, type IntencaoGerenciarPacote, type RespostaGerenciarPacote } from '../../../frontend/src/pacotes/contrato.ts'

type Usuario = { app_metadata?: Record<string, unknown> }
type Dependencias = {
  validarToken(token: string): Promise<Usuario | null>
  executar(intencao: IntencaoGerenciarPacote): Promise<RespostaGerenciarPacote>
}

export function criarHandlerGerenciarPacotes(deps: Dependencias, origens: ReadonlySet<string>) {
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
      const intencao = lerIntencaoGerenciarPacote(await req.json())
      if (!intencao) return json(400, { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem: 'Dados do pacote inválidos.' }, cors)
      const resposta = await deps.executar(intencao)
      return json(200, resposta, cors)
    } catch {
      console.error({ evento: 'gerenciar_pacotes_edge_erro', mensagem: 'Falha interna sanitizada.' })
      return json(500, { mensagem: 'Não foi possível processar o pacote.' }, cors)
    }
  }
}

export function validadorPacotes(cliente: { auth: { getUser(token: string): Promise<{ data: { user: Usuario | null }; error: unknown }> } }) {
  return async (token: string) => { const resposta = await cliente.auth.getUser(token); return resposta.error ? null : resposta.data.user }
}
function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } })
}
