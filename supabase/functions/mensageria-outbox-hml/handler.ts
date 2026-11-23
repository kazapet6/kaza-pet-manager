/**
 * Consumidor de agradecimentos HML — FASE LEITURA / SIMULAÇÃO.
 * Nenhuma chamada à Graph API, nenhum INSERT/UPDATE, nenhum scheduler.
 * A ação processar_lote está SEMPRE bloqueada nesta versão, inclusive
 * se alguma flag for habilitada acidentalmente.
 */
export const REF='jgtctzqieyorhvqxjbpk'
const BASE='https://'+REF+'.supabase.co'
const ORIGENS=new Set(['http://127.0.0.1:5173','http://localhost:5173'])
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Env={get:(name:string)=>string|undefined}
type Config={key:string;adminId:string}
type Fetch=typeof fetch

function responder(code:number,data:Record<string,unknown>,origin:string|null) {
  return Response.json(data,{status:code,headers:{
    'access-control-allow-origin':origin&&ORIGENS.has(origin)?origin:'null',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods':'POST,OPTIONS',
    'cache-control':'no-store','vary':'Origin'
  }})
}
function configurar(env:Env):Config|null{
  if(env.get('SUPABASE_URL')!==BASE||env.get('HML_PROJECT_REF')!==REF)return null
  const key=env.get('SUPABASE_SERVICE_ROLE_KEY')??''
  const adminId=env.get('HML_OPERATOR_UUID')??''
  // O destinatário deve vir de secret privado, nunca de um campo do browser.
  const destinatario=env.get('HML_TEST_RECIPIENT_E164')??''
  if(!key||!UUID.test(adminId)||!/^55[1-9][0-9]{9,10}$/.test(destinatario))
    return null
  return {key,adminId}
}
async function api(
  conf:Config,path:string,credencial:string,method:'GET'|'POST',
  fetcher:Fetch,body?:Record<string,unknown>
) {
  const response=await fetcher(BASE+path,{
    method,redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{
      apikey:conf.key,
      authorization:'Bearer '+credencial,
      'content-type':'application/json'
    },
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  })
  return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)}
}
async function adminValido(req:Request,c:Config,fetcher:Fetch) {
  const bearer=req.headers.get('authorization')??''
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(bearer))return false
  const jwt=bearer.slice(7)
  const u=await api(c,'/auth/v1/user',jwt,'GET',fetcher)
  if(!u.ok||u.data?.id!==c.adminId||
      u.data?.app_metadata?.role!=='internal'||
      u.data?.app_metadata?.whatsapp_admin!==true)return false
  const ok=await api(c,'/rest/v1/rpc/mensageria_hml_autorizar_operador',
      jwt,'POST',fetcher,{p_expected:c.adminId})
  return ok.ok&&ok.data===true
}
export function criarConsumidorSimulado(env:Env,fetcher:Fetch=fetch) {
  return async (req:Request):Promise<Response>=>{
    const origem=req.headers.get('origin')
    if(origem&&!ORIGENS.has(origem))return responder(403,{codigo:'ORIGEM_NEGADA'},origem)
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'access-control-allow-origin':origem&&ORIGENS.has(origem)?origem:'null',
      'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
      'access-control-allow-methods':'POST,OPTIONS','vary':'Origin'
    }})
    if(req.method!=='POST'||!new URL(req.url).pathname.endsWith('/mensageria-outbox-hml'))
      return responder(405,{codigo:'METODO_NEGADO'},origem)
    if(Number(req.headers.get('content-length')??0)>2048)
      return responder(413,{codigo:'CORPO_GRANDE'},origem)
    const c=configurar(env)
    if(!c)return responder(503,{codigo:'PROJETO_HML_NAO_CONFIGURADO'},origem)
    let autorizado=false
    try{autorizado=await adminValido(req,c,fetcher)}catch{}
    if(!autorizado)return responder(403,{codigo:'OPERADOR_NAO_AUTORIZADO'},origem)
    let payload:Record<string,unknown>
    try{
      const str=await req.text()
      if(str.length>2048)throw Error('limite')
      const v:unknown=JSON.parse(str)
      if(!v||typeof v!=='object'||Array.isArray(v))throw Error('tipo')
      payload=v as Record<string,unknown>
    }catch{return responder(400,{codigo:'CORPO_INVALIDO'},origem)}

    if(payload.acao==='processar_lote'||payload.acao==='enviar') {
      // Não existe transporte Meta nem escrita no banco nesta função.
      // Uma flag true acidental NÃO altera a segurança desta versão.
      return responder(503,{codigo:'ENVIO_INDISPONIVEL_NA_HOMOLOGACAO'},origem)
    }
    if(payload.acao!=='simular_lote')
      return responder(400,{codigo:'ACAO_INVALIDA'},origem)
    const limite=payload.limite===undefined?5:payload.limite
    if(typeof limite!=='number'||!Number.isInteger(limite)||
       limite<1||limite>10)return responder(400,{codigo:'LIMITE_INVALIDO'},origem)

    try {
      const r=await api(c,'/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes',
        c.key,'POST',fetcher,{p_operador:c.adminId,p_limite:limite})
      if(!r.ok||r.data?.status!=='ok'||!Array.isArray(r.data.itens)||
          r.data.itens.length>limite||
          !r.data.itens.every((id:unknown)=>typeof id==='string'&&UUID.test(id))||
          r.data.quantidade!==r.data.itens.length)
        return responder(503,{codigo:'FILA_NAO_VERIFICADA'},origem)
      return responder(200,{
        status:'simulacao_somente_leitura',
        elegiveis:r.data.quantidade,
        limite,
        enviados:0,reservados:0,
        envio_automatico_habilitado:false,
        confirmacao_automatica_habilitada:false
      },origem)
    }catch{
      return responder(503,{codigo:'FILA_NAO_VERIFICADA'},origem)
    }
  }
}
