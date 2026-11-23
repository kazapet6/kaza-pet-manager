/**
 * Transporte para um único agradecimento HML WhatsApp Cloud API.
 *
 * É um adaptador isolado para testes com fetch injetado:
 * NÃO é importado pela Edge mensageria-outbox-hml v1.
 * NÃO registra corpo, token, telefone, headers ou resposta bruta em logs.
 * SEM retry automático. A decisão de reservar/finalizar pertence à outbox.
 */
import type {EnvioTextoMeta} from '../mensageria-confirmacao-hml/respostaOutboxHml.ts'

const HML='jgtctzqieyorhvqxjbpk'
const HML_URL='https://'+HML+'.supabase.co'
const META_PHONE_HML='309132033809134'
const GRAPH='https://graph.facebook.com/v27.0/'+META_PHONE_HML+'/messages'
const DESTINO=/^55[1-9][0-9]{9,10}$/
const WAMID=/^wamid\.[A-Za-z0-9._-]{4,290}$/

export type AmbienteMetaHml={get:(name:string)=>string|undefined}
export type ResultadoMetaHml={httpStatus:number;wamid:string|null}
export type OpcoesTransporteHml={
  ambiente:AmbienteMetaHml
  requisitar?:(url:string,init:RequestInit)=>Promise<Response>
  agora?:()=>number
}

function permitido(env:AmbienteMetaHml,agora:number):{destino:string;token:string}|null{
  if(env.get('HML_PROJECT_REF')!==HML||
     env.get('SUPABASE_URL')!==HML_URL||
     env.get('HML_META_PHONE_NUMBER_ID')!==META_PHONE_HML||
     env.get('HML_OUTBOX_SEND_ENABLED')!=='true')return null
  const fim=Date.parse(env.get('HML_OUTBOX_SEND_EXPIRES_AT')??'')
  if(!Number.isFinite(agora)||!Number.isFinite(fim)||
     fim<=agora||fim-agora>180_000)return null
  const destino=env.get('HML_TEST_RECIPIENT_E164')??''
  const token=env.get('HML_META_ACCESS_TOKEN')??''
  if(!DESTINO.test(destino)||token.length<32||token.length>4096||
     /[\r\n]/.test(token))return null
  return {destino,token}
}
function corpoValido(c:EnvioTextoMeta,destino:string):boolean {
  return c?.messaging_product==='whatsapp'&&
    c.recipient_type==='individual'&&
    c.to===destino&&c.type==='text'&&
    c.text?.preview_url===false&&
    typeof c.text?.body==='string'&&
    c.text.body.trim().length>=1&&c.text.body.length<=4096&&
    typeof c.context?.message_id==='string'&&
    WAMID.test(c.context.message_id)
}

export function criarTransporteMetaHml({ambiente,requisitar=fetch,agora=Date.now}:OpcoesTransporteHml){
  return async (body:EnvioTextoMeta):Promise<ResultadoMetaHml>=>{
    const cfg=permitido(ambiente,agora())
    if(!cfg)throw new Error('ENVIO_META_HML_NAO_AUTORIZADO')
    if(!corpoValido(body,cfg.destino))throw new Error('MENSAGEM_META_HML_INVALIDA')
    // Confere a janela uma segunda vez imediatamente antes do POST.
    if(!permitido(ambiente,agora()))throw new Error('AUTORIZACAO_EXPIRADA')
    let res:Response
    try{
      res=await requisitar(GRAPH,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
        headers:{authorization:'Bearer '+cfg.token,'content-type':'application/json'},
        body:JSON.stringify(body)
      })
    }catch{
      // A Meta pode ter aceitado antes de ocorrer timeout, queda de rede
      // ou redirecionamento. É proibido repetir automaticamente a chamada.
      throw new Error('META_RESPOSTA_INDETERMINADA')
    }
    if(!Number.isInteger(res.status)||res.status<200||res.status>599)
      return {httpStatus:503,wamid:null}
    if(res.status<200||res.status>=300)return {httpStatus:res.status,wamid:null}
    let parsed:unknown
    try{parsed=await res.json()}catch{
      return {httpStatus:res.status,wamid:null}
    }
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return {httpStatus:res.status,wamid:null}
    const response=parsed as {
      messaging_product?:unknown
      contacts?:{input?:unknown;wa_id?:unknown}[]
      messages?:{id?:unknown}[]
    }
    const id=response.messages?.[0]?.id
    // contacts[].wa_id pode ser diferente da entrada (nono dígito BR).
    // contacts[].input, quando presente, precisa refletir o destino pedido.
    if(response.messaging_product!=='whatsapp'||
       (Array.isArray(response.contacts)&&
         (response.contacts[0]?.input!==cfg.destino))||
       !Array.isArray(response.messages)||
       typeof id!=='string'||!WAMID.test(id))
      return {httpStatus:res.status,wamid:null}
    return {httpStatus:res.status,wamid:id}
  }
}
