/**
 * Diagnóstico e processamento administrativo dos botões da Meta — SOMENTE HML.
 * Não chama graph.facebook.com; não despacha agradecimentos nem envia templates.
 * Sem HML_CONFIRMATION_PROCESSOR_ENABLED=true, 'processar_item' é bloqueado.
 */
export const REF = 'jgtctzqieyorhvqxjbpk'
const BASE = 'https://' + REF + '.supabase.co'
const ORIGENS = new Set(['http://127.0.0.1:5173','http://localhost:5173'])
type Env = { get(nome:string):string|undefined }
type Fetch = typeof fetch
type Config = {key:string; adminId:string}
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function resposta(status:number,data:Record<string,unknown>,origin:string|null) {
  return Response.json(data,{status,headers:{
    'access-control-allow-origin': origin && ORIGENS.has(origin) ? origin : 'null',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods':'POST,OPTIONS',
    'cache-control':'no-store','vary':'Origin'
  }})
}
function config(env:Env):Config|null {
  if (env.get('SUPABASE_URL')!==BASE || env.get('HML_PROJECT_REF')!==REF) return null
  const key=env.get('SUPABASE_SERVICE_ROLE_KEY')??''
  const adminId=env.get('HML_OPERATOR_UUID')??''
  if (!key || !uuid.test(adminId)) return null
  return {key,adminId}
}

async function backend(c:Config,endpoint:string,credencial:string,method:'GET'|'POST',
  fetchImpl:Fetch, body?:Record<string,unknown>) {
  const res=await fetchImpl(BASE+endpoint,{
    method,redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{apikey:c.key,authorization:'Bearer '+credencial,'content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  })
  return {ok:res.ok,data:await res.json().catch(()=>null)}
}
async function operadorAutorizado(req:Request,c:Config,fetchImpl:Fetch) {
  const auth=req.headers.get('authorization')??''
  if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(auth)) return false
  const jwt=auth.slice(7)
  const user=await backend(c,'/auth/v1/user',jwt,'GET',fetchImpl)
  if (!user.ok || user.data?.id!==c.adminId ||
      user.data?.app_metadata?.role!=='internal' ||
      user.data?.app_metadata?.whatsapp_admin!==true) return false
  const valid=await backend(c,'/rest/v1/rpc/mensageria_hml_autorizar_operador',
    jwt,'POST',fetchImpl,{p_expected:c.adminId})
  return valid.ok && valid.data===true
}

export function criarHandler(env:Env,fetchImpl:Fetch=fetch) {
  return async function(req:Request):Promise<Response> {
    const origem=req.headers.get('origin')
    if(origem && !ORIGENS.has(origem))return resposta(403,{codigo:'ORIGEM_NEGADA'},origem)
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'access-control-allow-origin':origem && ORIGENS.has(origem)?origem:'null',
      'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
      'access-control-allow-methods':'POST,OPTIONS','vary':'Origin'
    }})
    if(req.method!=='POST' || !new URL(req.url).pathname.endsWith('/mensageria-confirmacao-hml'))
      return resposta(405,{codigo:'METODO_NEGADO'},origem)
    if(Number(req.headers.get('content-length')??0)>4096)
      return resposta(413,{codigo:'CORPO_GRANDE'},origem)
    const c=config(env)
    if(!c)return resposta(503,{codigo:'HML_NAO_CONFIGURADA'},origem)
    let autorizado=false
    try{autorizado=await operadorAutorizado(req,c,fetchImpl)}catch{/* não expor credenciais */}
    if(!autorizado)return resposta(403,{codigo:'OPERADOR_NAO_AUTORIZADO'},origem)
    let body:Record<string,unknown>
    try {
      const text=await req.text()
      if(text.length>4096)throw Error('grande')
      const json:unknown=JSON.parse(text)
      if(!json||typeof json!=='object'||Array.isArray(json))throw Error('invalido')
      body=json as Record<string,unknown>
    } catch{return resposta(400,{codigo:'CORPO_INVALIDO'},origem)}

    if(body.acao==='diagnostico') {
      try {
        const r=await backend(c,'/rest/v1/rpc/mensageria_hml_diagnostico_confirmacoes',
          c.key,'POST',fetchImpl,{p_operador:c.adminId})
        if(!r.ok || r.data?.status!=='ok')return resposta(503,{codigo:'DIAGNOSTICO_INDISPONIVEL'},origem)
        const campos=[
          'convites_ativos','convites_confirmados','convites_expirados',
          'cliques_processados','remarcacoes_pendentes','respostas_aguardando',
          'templates_meta_cadastrados','agendamentos_hml',
        ] as const
        const resultado:Record<string,unknown>={}
        for(const campo of campos) {
          const valor=r.data[campo]
          if(typeof valor!=='number'||!Number.isSafeInteger(valor)||valor<0)
            return resposta(503,{codigo:'DIAGNOSTICO_INVALIDO'},origem)
          resultado[campo]=valor
        }
        return resposta(200,{
          ...resultado,ambiente:'homologacao',processamento_habilitado:
            env.get('HML_CONFIRMATION_PROCESSOR_ENABLED')==='true',
          envio_automatico_habilitado:false,
        },origem)
      }catch{return resposta(503,{codigo:'DIAGNOSTICO_INDISPONIVEL'},origem)}
    }
    if(body.acao==='processar_item') {
      if(env.get('HML_CONFIRMATION_PROCESSOR_ENABLED')!=='true')
        return resposta(503,{codigo:'PROCESSAMENTO_DESATIVADO'},origem)
      if(typeof body.itemId!=='string'||!uuid.test(body.itemId))
        return resposta(400,{codigo:'ITEM_INVALIDO'},origem)
      try {
        const r=await backend(c,'/rest/v1/rpc/mensageria_hml_processar_confirmacao',
          c.key,'POST',fetchImpl,{p_item:body.itemId,p_operador:c.adminId})
        if(!r.ok || typeof r.data?.status!=='string')return resposta(503,{codigo:'PROCESSAMENTO_INDETERMINADO'},origem)
        const statuses=new Set(['confirmado','remarcacao_pendente','ja_processado',
          'ignorado','rejeitado','expirado','conflito','ja_resolvido'])
        if(!statuses.has(r.data.status))return resposta(503,{codigo:'RESULTADO_INVALIDO'},origem)
        return resposta(200,{status:r.data.status,codigo:typeof r.data.codigo==='string'?r.data.codigo:null},origem)
      }catch{return resposta(503,{codigo:'PROCESSAMENTO_INDETERMINADO'},origem)}
    }
    return resposta(400,{codigo:'ACAO_INVALIDA'},origem)
  }
}
