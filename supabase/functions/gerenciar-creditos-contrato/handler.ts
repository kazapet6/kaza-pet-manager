export type IntencaoCreditos = Record<string, unknown> & { operacao: string }
type Usuario={id:string;app_metadata?:Record<string,unknown>}
type ClienteAuth={auth:{getUser(token:string):Promise<{data:{user:Usuario|null};error:unknown}>}}
type Dependencias={validarToken(token:string):Promise<Usuario|null>;executar(i:IntencaoCreditos,usuarioId:string):Promise<unknown>}

export function criarHandlerCreditos(deps:Dependencias,origens:ReadonlySet<string>){return async(req:Request)=>{
  const origem=req.headers.get('origin'),cors:Record<string,string>=origem&&origens.has(origem)?{'access-control-allow-origin':origem,vary:'Origin'}:{}
  if(origem&&!origens.has(origem))return json(403,{mensagem:'Origem não permitida.'})
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type, apikey, x-client-info'}})
  if(req.method!=='POST')return json(405,{mensagem:'Método não permitido.'},cors)
  const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')??'')?.[1]
  if(!token)return json(401,{mensagem:'Autenticação obrigatória.'},cors)
  const usuario=await deps.validarToken(token)
  if(!usuario)return json(401,{mensagem:'Sessão inválida ou expirada.'},cors)
  if(usuario.app_metadata?.role!=='internal')return json(403,{mensagem:'Acesso não autorizado.'},cors)
  let corpo:unknown
  try{corpo=await req.json()}catch{return json(400,{status:'invalido',codigo:'JSON_INVALIDO',mensagem:'JSON inválido.'},cors)}
  if(!objeto(corpo)||typeof corpo.operacao!=='string')return json(400,{status:'invalido',codigo:'INTENCAO_INVALIDA',mensagem:'Intenção inválida.'},cors)
  try{return json(200,await deps.executar(corpo as IntencaoCreditos,usuario.id),cors)}catch(erro){
    console.error({evento:'creditos_contrato_edge_erro',tipo:erro instanceof Error?erro.name:'ErroDesconhecido',mensagem:'Falha interna ao gerenciar créditos.'})
    return json(500,{status:'erro',mensagem:'Não foi possível carregar ou atualizar os créditos.'},cors)
  }
}}
export function criarValidadorTokenCreditos(cliente:ClienteAuth){return async(token:string)=>{const{data,error}=await cliente.auth.getUser(token);return error?null:data.user}}
function objeto(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
function json(status:number,corpo:unknown,headers:Record<string,string>={}){return new Response(JSON.stringify(corpo),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}})}

