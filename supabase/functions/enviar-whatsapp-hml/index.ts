// Piloto isolado: o backend deve ser implantado APENAS em jgtctzqieyorhvqxjbpk.
// Não registra o texto, o token, o payload completo da Meta ou dados sensíveis em logs.
const REF = 'jgtctzqieyorhvqxjbpk'
const BASE = `https://${REF}.supabase.co`
const GRAFO = 'https://graph.facebook.com/v27.0'
const CLIENTE_PILOTO_ID = 'CLI-990003'
const ORIGENS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

type Envio = {
  id: string; chave_idempotencia: string; operador_id: string
  cliente_id: string; telefone: string; texto_sha256: string
  estado: string; criado_em: string; erro_codigo: string | null
}
type Env = { get(nome: string): string | undefined }

function json(status: number, body: Record<string, unknown>, origem: string | null) {
  return Response.json(body, { status, headers: cors(origem) })
}
function cors(origem: string | null) {
  return {
    'access-control-allow-origin': origem && ORIGENS.has(origem) ? origem : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'vary': 'Origin',
    'cache-control': 'no-store',
  }
}
function numeroBr(valor: string) {
  const digitos = valor.replace(/\D/g, '')
  const d = digitos.startsWith('55') ? digitos : `55${digitos}`
  return /^55[1-9][0-9][0-9]{8,9}$/.test(d) ? d : null
}
function textoValido(texto: unknown): texto is string {
  return typeof texto === 'string' && texto.trim().length >= 1 && texto.trim().length <= 512
}
function uuid(valor: unknown): valor is string {
  return typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}
function segredo(env: Env, nome: string) {
  const valor = env.get(nome)
  if (!valor) throw new Error('CONFIGURACAO_INCOMPLETA')
  return valor
}
async function hash(texto: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function clienteId(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 120 &&
    !/[\r\n]/.test(valor)
}

function preparar(env: Env) {
  if (env.get('HML_PROJECT_REF') !== REF || env.get('SUPABASE_URL') !== BASE)
    throw new Error('PROJETO_INCORRETO')
  const serviceRole = segredo(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const operatorId = segredo(env, 'HML_OPERATOR_UUID')
  const allowed = numeroBr(segredo(env, 'HML_TEST_RECIPIENT_E164'))
  const phone = segredo(env, 'HML_META_PHONE_NUMBER_ID')
  if (!allowed || !/^\d{5,30}$/.test(phone) || !uuid(operatorId))
    throw new Error('CONFIGURACAO_INCOMPLETA')
  return { serviceRole, operatorId, allowed, phone }
}
type Config = ReturnType<typeof preparar>

async function backend(c: Config, path: string, options: RequestInit = {}, jwt?: string) {
  const res = await fetch(BASE + path, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { 'apikey': c.serviceRole, 'authorization': `Bearer ${jwt ?? c.serviceRole}`,
      'content-type': 'application/json', ...(options.headers ?? {}) },
  })
  return { status: res.status, ok: res.ok, dados: await res.json().catch(() => null) }
}
async function operador(c: Config, req: Request) {
  const h = req.headers.get('authorization') ?? ''
  if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(h)) return null
  const token = h.slice(7)
  const user = await backend(c, '/auth/v1/user', { method: 'GET' }, token)
  if (!user.ok || user.dados?.id !== c.operatorId ||
    user.dados?.app_metadata?.role !== 'internal' ||
    user.dados?.app_metadata?.whatsapp_admin !== true) return null
  const autorizacao = await backend(c, '/rest/v1/rpc/mensageria_hml_autorizar_operador',
    { method: 'POST', body: JSON.stringify({ p_expected: c.operatorId }) }, token)
  return autorizacao.ok && autorizacao.dados === true ? c.operatorId : null
}
async function historico(c: Config, id: string) {
  const r = await backend(c, `/rest/v1/whatsapp_hml_envios_manuais?select=id,estado,criado_em,erro_codigo,meta_message_id&cliente_id=eq.${encodeURIComponent(id)}&order=criado_em.desc&limit=5`)
  if (!r.ok || !Array.isArray(r.dados)) throw new Error('HISTORICO_INDISPONIVEL')
  // O status de entrega vem dos webhooks reais da Meta, nunca é inferido pelo HTTP 200.
  return await Promise.all(r.dados.map(async (envio: Envio) => {
    let status_entrega: string | null = null
    if (envio.meta_message_id) {
      const itens = await backend(c,
        `/rest/v1/mensageria_webhook_itens_meta?select=status_meta,ocorrido_at&tipo=eq.status&mensagem_externa_id=eq.${encodeURIComponent(envio.meta_message_id)}&order=ocorrido_at.desc&limit=20`)
      if (itens.ok && Array.isArray(itens.dados)) {
        const status = new Set(itens.dados.map((i: { status_meta: string }) => i.status_meta))
        status_entrega = status.has('read') ? 'read' :
          status.has('delivered') ? 'delivered' : status.has('sent') ? 'sent' :
          status.has('failed') ? 'failed' : null
      }
    }
    return {
      id: envio.id, estado: envio.estado, criado_em: envio.criado_em,
      erro_codigo: envio.erro_codigo, status_entrega,
    }
  }))
}
async function verificarInboundRecente(c: Config, destino: string) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const r = await backend(c,
    `/rest/v1/mensageria_webhooks_meta?select=payload&created_at=gte.${encodeURIComponent(desde)}&order=created_at.desc&limit=100`)
  if (!r.ok || !Array.isArray(r.dados)) return false
  return r.dados.some((linha: { payload?: any }) =>
    Array.isArray(linha.payload?.entry) && linha.payload.entry.some((entry: any) =>
      Array.isArray(entry.changes) && entry.changes.some((change: any) =>
        Array.isArray(change.value?.messages) && change.value.messages.some((msg: any) =>
          typeof msg.from === 'string' && numeroBr(msg.from) === destino))))
}
async function registrar(c: Config, registro: Record<string, unknown>) {
  const r = await backend(c, '/rest/v1/whatsapp_hml_envios_manuais?select=*',
    { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(registro) })
  return r
}
async function atualizar(c: Config, id: string, dados: Record<string, unknown>) {
  const r = await backend(c,
    `/rest/v1/whatsapp_hml_envios_manuais?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ ...dados, atualizado_em: new Date().toISOString() }) })
  if (!r.ok) throw new Error('REGISTRO_NAO_CONFIRMADO')
}
async function buscarChave(c: Config, chave: string) {
  const r = await backend(c, `/rest/v1/whatsapp_hml_envios_manuais?select=*&chave_idempotencia=eq.${encodeURIComponent(chave)}&limit=1`)
  if (!r.ok) throw new Error('CONSULTA_INDISPONIVEL')
  return Array.isArray(r.dados) ? r.dados[0] as Envio | undefined : undefined
}

export async function criarHandler(req: Request, env: Env = Deno.env): Promise<Response> {
  const origem = req.headers.get('origin')
  if (origem && !ORIGENS.has(origem)) return json(403, { codigo: 'ORIGEM_NEGADA' }, origem)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) })
  if (req.method !== 'POST') return json(405, { codigo: 'METODO_NEGADO' }, origem)
  if (!new URL(req.url).pathname.endsWith('/enviar-whatsapp-hml'))
    return json(404, { codigo: 'ROTA_NAO_EXISTE' }, origem)
  if (Number(req.headers.get('content-length') ?? 0) > 8192)
    return json(413, { codigo: 'CORPO_GRANDE' }, origem)
  let c: Config
  try { c = preparar(env) }
  catch { return json(503, { codigo: 'HML_NAO_CONFIGURADA' }, origem) }
  let operadorId: string | null
  try { operadorId = await operador(c, req) }
  catch { operadorId = null }
  if (!operadorId) return json(403, { codigo: 'OPERADOR_NAO_AUTORIZADO' }, origem)
  let body: Record<string, unknown>
  try {
    const bruto = await req.text()
    if (bruto.length > 8192) throw new Error('CORPO_GRANDE')
    body = JSON.parse(bruto)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALIDO')
  } catch { return json(400, { codigo: 'CORPO_INVALIDO' }, origem) }
  // Homologação estritamente vinculada ao único ID fictício já cadastrado.
  // A ficha é montada no servidor com dados sintéticos e o telefone permitido
  // vem do segredo HML_TEST_RECIPIENT_E164, evitando ampliar SELECT/RLS.
  if (body.acao === 'cliente_piloto') {
    return json(200, { cliente: {
      id: CLIENTE_PILOTO_ID,
      nome: 'Tutor fictício WhatsApp HML',
      whatsapp: c.allowed,
      endereco: '', bairro: '', cidade: '',
      observacoes: 'Somente homologação — destinatário autorizado',
      criadoEm: '',
    } }, origem)
  }
  if (!clienteId(body.cliente_id) || body.cliente_id !== CLIENTE_PILOTO_ID)
    return json(403, { codigo: 'CLIENTE_FORA_DA_LISTA_TESTE' }, origem)
  if (body.acao === 'historico') {
    try { return json(200, { envios: await historico(c, body.cliente_id) }, origem) }
    catch { return json(503, { codigo: 'HISTORICO_INDISPONIVEL' }, origem) }
  }
  if (body.acao !== 'enviar' || !uuid(body.chave_idempotencia) || !textoValido(body.texto))
    return json(400, { codigo: 'PEDIDO_INVALIDO' }, origem)
  if (env.get('HML_MANUAL_SEND_ENABLED') !== 'true')
    return json(503, { codigo: 'ENVIO_MANUAL_DESATIVADO' }, origem)
  const accessToken = env.get('HML_META_ACCESS_TOKEN')
  if (!accessToken || accessToken.length < 32)
    return json(503, { codigo: 'TOKEN_META_NAO_CONFIGURADO' }, origem)
  const texto = body.texto.trim()
  const textoSha256 = await hash(texto)
  const chave = body.chave_idempotencia

  try {
    const anterior = await buscarChave(c, chave)
    if (anterior) {
      if (anterior.operador_id !== operadorId || anterior.cliente_id !== body.cliente_id ||
        anterior.texto_sha256 !== textoSha256)
        return json(409, { codigo: 'CHAVE_REUTILIZADA' }, origem)
      return json(200, { estado: anterior.estado, codigo: 'REQUISICAO_JA_REGISTRADA' }, origem)
    }
    if (!await verificarInboundRecente(c, c.allowed))
      return json(409, { codigo: 'JANELA_DE_24H_NAO_CONFIRMADA' }, origem)
    // Um envio aceito/indeterminado nos últimos 60 segundos bloqueia repetição inadvertida.
    const recente = await backend(c,
      `/rest/v1/whatsapp_hml_envios_manuais?select=id&telefone=eq.${c.allowed}&estado=in.(reservado,aceito,indeterminado)&criado_em=gte.${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}&limit=1`)
    if (!recente.ok) throw new Error('CONTROLE_DE_FREQUENCIA_INDISPONIVEL')
    if (recente.dados?.length) return json(429, { codigo: 'AGUARDE_UM_MINUTO' }, origem)

    const criacao = await registrar(c, {
      chave_idempotencia: chave, operador_id: operadorId,
      cliente_id: body.cliente_id, telefone: c.allowed,
      texto_sha256: textoSha256, estado: 'reservado',
    })
    if (!criacao.ok || !Array.isArray(criacao.dados) || !criacao.dados.length) {
      if (criacao.status === 409) return json(409, { codigo: 'CHAVE_JA_RESERVADA' }, origem)
      return json(503, { codigo: 'REGISTRO_INDISPONIVEL' }, origem)
    }
    const registro: Envio = criacao.dados[0]
    let meta: Response
    try {
      meta = await fetch(`${GRAFO}/${c.phone}/messages`, {
        method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual',
          to: c.allowed, type: 'text', text: { body: texto },
        }),
      })
    } catch {
      await atualizar(c, registro.id, { estado: 'indeterminado', erro_codigo: 'META_RESPOSTA_INCERTA' }).catch(() => {})
      return json(503, { estado: 'indeterminado', codigo: 'META_RESPOSTA_INCERTA' }, origem)
    }
    const resposta = await meta.json().catch(() => null)
    if (!meta.ok || typeof resposta?.messages?.[0]?.id !== 'string') {
      await atualizar(c, registro.id, { estado: 'falha', erro_codigo: `META_HTTP_${meta.status}` }).catch(() => {})
      return json(502, { estado: 'falha', codigo: `META_HTTP_${meta.status}` }, origem)
    }
    try {
      await atualizar(c, registro.id, { estado: 'aceito', meta_message_id: resposta.messages[0].id })
    } catch {
      return json(503, { estado: 'indeterminado', codigo: 'REGISTRO_NAO_CONFIRMADO' }, origem)
    }
    return json(200, { estado: 'aceito', codigo: 'ACEITO_PELA_META' }, origem)
  } catch {
    return json(503, { codigo: 'ENVIO_NAO_CONFIRMADO' }, origem)
  }
}
Deno.serve((req) => criarHandler(req))
