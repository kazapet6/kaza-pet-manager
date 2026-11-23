/**
 * Montagem PURA de template utilitário com 2 quick replies da Meta.
 * Exclusivamente para utilização no backend. Este módulo:
 * - não lê chaves da Meta nem faz HTTP;
 * - não envia mensagem e não cadastra convite;
 * - gera tokens criptograficamente aleatórios, que só devem ser usados
 *   na chamada Cloud API e armazenados no banco em hash SHA-256.
 *
 * Importante: os botões "Confirmar" e "Remarcar" e os parâmetros de body
 * devem coincidir com o TEMPLATE APROVADO pela Meta.
 */
export type TemplateConfirmacaoEntrada = {
  destinoE164: string
  permitidoE164: string
  templateNome: string
  idioma: 'pt_BR'
  parametros: readonly string[]
}
export type CorpoTemplateMeta = {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language:{code:'pt_BR'}
    components: Array<
      {type:'body'; parameters:Array<{type:'text';text:string}>} |
      {type:'button';sub_type:'quick_reply';index:'0'|'1';
       parameters:[{type:'payload';payload:string}]}
    >
  }
}
export type ConvitePreparadoBackend = {
  corpoApi: CorpoTemplateMeta
  segredoConfirmar: string
  segredoRemarcar: string
  hashConfirmar: string
  hashRemarcar: string
}
const TEL = /^\+55[1-9][0-9][2-9][0-9]{7,8}$/
const NOME = /^[a-z][a-z0-9_]{2,100}$/
function numeroNormalizado(valor:string){return valor.replace(/^\+/,'')}
async function sha256(s:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
export async function prepararTemplateConfirmacaoHml(
  dados:TemplateConfirmacaoEntrada,
):Promise<ConvitePreparadoBackend> {
  if(!TEL.test(dados.destinoE164) ||
     numeroNormalizado(dados.destinoE164)!==numeroNormalizado(dados.permitidoE164))
    throw Error('DESTINATARIO_NAO_AUTORIZADO')
  if(!NOME.test(dados.templateNome)||dados.idioma!=='pt_BR')throw Error('TEMPLATE_INVALIDO')
  if(dados.parametros.length>8 || dados.parametros.some(p=>typeof p!=='string'||!p.trim()||p.length>255))
    throw Error('PARAMETROS_INVALIDOS')
  const segredoConfirmar='KPAG1_'+crypto.randomUUID()
  const segredoRemarcar='KPAG1_'+crypto.randomUUID()
  if(segredoConfirmar===segredoRemarcar)throw Error('ENTROPIA_INSUFICIENTE')
  const hashConfirmar=await sha256(segredoConfirmar)
  const hashRemarcar=await sha256(segredoRemarcar)
  const components:CorpoTemplateMeta['template']['components']=[]
  if(dados.parametros.length)components.push({
    type:'body',parameters:dados.parametros.map(text=>({type:'text',text}))
  })
  components.push({
    type:'button',sub_type:'quick_reply',index:'0',
    parameters:[{type:'payload',payload:segredoConfirmar}]
  },{
    type:'button',sub_type:'quick_reply',index:'1',
    parameters:[{type:'payload',payload:segredoRemarcar}]
  })
  return {
    corpoApi:{messaging_product:'whatsapp',to:numeroNormalizado(dados.destinoE164),
      type:'template',template:{name:dados.templateNome,language:{code:'pt_BR'},components}},
    segredoConfirmar,segredoRemarcar,hashConfirmar,hashRemarcar
  }
}
