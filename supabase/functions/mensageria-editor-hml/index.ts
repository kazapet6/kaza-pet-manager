// Editor de mensagens: API exclusiva do projeto de HOMOLOGAÇÃO.
// Não envia WhatsApp nem publica templates na Meta.
// Autenticação e autorização são realizadas antes de executar a RPC invoker.
// Jamais implantar no projeto de produção.
const REF = 'jgtctzqieyorhvqxjbpk'
const BASE = 'https://' + REF + '.supabase.co'
const ORIGENS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173'])
type Env = { get(nome: string): string | undefined }
type Config = { serviceKey: string; adminId: string }
type Documento = {id:string;versao_esperada:number;nome?:string;texto?:string;evento_codigo?:string;contexto?:string}
const eventoContexto: Record<string,string> = {
  CONFIRMACAO_AGENDAMENTO:'agenda',
  AGENDAMENTO_CONFIRMADO_WHATSAPP:'agenda',
  REMARCACAO_SOLICITADA_WHATSAPP:'agenda',
  NOVO_AGENDAMENTO:'agenda',
  LEMBRETE_AGENDAMENTO:'agenda',
  PET_PRONTO:'atendimento',
  PACOTE_ATIVADO:'contrato',
  RESUMO_USO_PACOTE:'pacotes',
  RESUMO_USO_PLANO:'contrato',
  CLIENTE_ENTROU_INADIMPLENCIA:'financeiro',
}
const validoUUID=(s:unknown):s is string => typeof s==='string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
function resposta(status:number,dados:Record<string,unknown>,origem:string|null) {
  return Response.json(dados,{status,headers:{
    'access-control-allow-origin':origem && ORIGENS.has(origem)?origem:'null',
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'cache-control':'no-store','vary':'Origin'
  }})
}
function configurar(env:Env): Config|null {
  if(env.get('SUPABASE_URL')!==BASE || env.get('HML_PROJECT_REF')!==REF)return null
  const serviceKey=env.get('SUPABASE_SERVICE_ROLE_KEY')??''
  const adminId=env.get('HML_OPERATOR_UUID')??''
  if(!serviceKey || !validoUUID(adminId))return null
  return {serviceKey,adminId}
}
async function chamada(c:Config,rota:string,token:string,metodo:'GET'|'POST',corpo?:unknown) {
  const res=await fetch(BASE+rota,{
    method:metodo,redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{apikey:c.serviceKey,authorization:'Bearer '+token,'content-type':'application/json'},
    ...(metodo==='POST'?{body:JSON.stringify(corpo)}:{})
  })
  return {ok:res.ok,status:res.status,dados:await res.json().catch(()=>null)}
}
async function validarOperador(c:Config,req:Request) {
  const h=req.headers.get('authorization')??''
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(h))return false
  const jwt=h.slice(7)
  const u=await chamada(c,'/auth/v1/user',jwt,'GET')
  if(!u.ok || u.dados?.id!==c.adminId ||
     u.dados?.app_metadata?.role!=='internal' ||
     u.dados?.app_metadata?.whatsapp_admin!==true)return false
  const auth=await chamada(c,'/rest/v1/rpc/mensageria_hml_autorizar_operador',
    jwt,'POST',{p_expected:c.adminId})
  return auth.ok && auth.dados===true
}
function documentoValido(body:Record<string,unknown>,acao:string): Documento|null {
  if(!validoUUID(body.id) || !Number.isInteger(body.versaoEsperada) ||
      (body.versaoEsperada as number)<0 || (body.versaoEsperada as number)>1000000 ||
      !validoUUID(body.chaveIdempotencia))return null
  const d:Documento={id:body.id,versao_esperada:body.versaoEsperada as number}
  if(acao==='excluir')return d
  if(typeof body.nome!=='string'||body.nome.trim().length<1||body.nome.trim().length>160||
    typeof body.texto!=='string'||body.texto.trim().length<1||body.texto.length>4096||
    typeof body.eventoCodigo!=='string'||typeof body.contexto!=='string'||
    eventoContexto[body.eventoCodigo]!==body.contexto) return null
  d.nome=body.nome.trim()
  d.texto=body.texto
  d.contexto=body.contexto
  d.evento_codigo=body.eventoCodigo
  return d
}
export async function criarHandler(req:Request,env:Env=Deno.env):Promise<Response> {
  const origem=req.headers.get('origin')
  if(origem && !ORIGENS.has(origem))return resposta(403,{codigo:'ORIGEM_NEGADA'},origem)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'access-control-allow-origin':origem && ORIGENS.has(origem)?origem:'null',
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',vary:'Origin'
  }})
  if(req.method!=='POST'||!new URL(req.url).pathname.endsWith('/mensageria-editor-hml'))
    return resposta(405,{codigo:'METODO_NEGADO'},origem)
  if(Number(req.headers.get('content-length')??0)>16384)
    return resposta(413,{codigo:'CORPO_GRANDE'},origem)
  const conf=configurar(env)
  if(!conf)return resposta(503,{codigo:'HML_NAO_CONFIGURADA'},origem)
  let autorizado=false
  try{autorizado=await validarOperador(conf,req)}catch{autorizado=false}
  if(!autorizado)return resposta(403,{codigo:'NAO_AUTORIZADO'},origem)
  let b:Record<string,unknown>
  try{
    const str=await req.text()
    if(str.length>16384)throw Error('CORPO_GRANDE')
    const obj:unknown=JSON.parse(str)
    if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('INVALIDO')
    b=obj as Record<string,unknown>
  }catch{return resposta(400,{codigo:'CORPO_INVALIDO'},origem)}
  const acao=b.acao
  if(!['listar','salvar','excluir'].includes(String(acao)))
    return resposta(400,{codigo:'ACAO_INVALIDA'},origem)
  const documento=acao==='listar'?{}:documentoValido(b,String(acao))
  if(documento===null)return resposta(400,{codigo:'DOCUMENTO_INVALIDO'},origem)
  try{
    const r=await chamada(conf,'/rest/v1/rpc/mensageria_hml_editor_operar',
      conf.serviceKey,'POST',{
        p_operador:conf.adminId,p_acao:acao,
        p_documento:documento,
        p_chave:acao==='listar'?null:b.chaveIdempotencia,
      })
    if(!r.ok || !r.dados || typeof r.dados!=='object' || Array.isArray(r.dados))
      return resposta(503,{codigo:'PERSISTENCIA_INDISPONIVEL'},origem)
    if(r.dados.status==='conflito')return resposta(409,{codigo:'VERSAO_DESATUALIZADA'},origem)
    if(r.dados.status==='chave_reutilizada')return resposta(409,{codigo:'CHAVE_REUTILIZADA'},origem)
    if(acao==='listar' && !Array.isArray(r.dados.rascunhos))
      return resposta(503,{codigo:'LISTAGEM_INVALIDA'},origem)
    return resposta(200,r.dados,origem)
  }catch{return resposta(503,{codigo:'PERSISTENCIA_INDISPONIVEL'},origem)}
}
Deno.serve((req)=>criarHandler(req))
