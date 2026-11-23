/**
 * Mensagem de resposta no WhatsApp, montada SOMENTE com contexto obtido
 * e validado no backend. Não faz HTTP, não lê credenciais e não envia mensagens.
 *
 * Origem obrigatória dos dados no serviço futuro:
 * - outbox com estado aguardando_integracao/pronto e convite confirmado;
 * - dados da agenda/grupo/pet/tutor persistidos no banco;
 * - último clique inbound validado HMAC, associado a convite e wamid;
 * - modelo PUBLICADO e versionado, nunca um rascunho local do navegador.
 */
export type EventoRespostaHml =
  | 'AGENDAMENTO_CONFIRMADO_WHATSAPP'
  | 'REMARCACAO_SOLICITADA_WHATSAPP'
export type ContextoRespostaHml = {
  eventoCodigo:EventoRespostaHml
  statusAtendimento:string
  statusConvite:string
  modeloPublicado:boolean
  textoModelo:string
  destinatarioE164:string
  remetenteClique:string
  mensagemCliqueId:string
  inicioAtualIso:string
  inicioConviteIso:string
  cliqueRecebidoIso:string
  agoraIso:string
  nomeTutor:string
  nomePet:string
  nomeEmpresa:string
}
export type EnvioTextoMeta = {
  messaging_product:'whatsapp'
  recipient_type:'individual'
  to:string
  type:'text'
  context:{message_id:string}
  text:{body:string;preview_url:false}
}
export type PreparacaoRespostaHml =
  | {status:'pronto';corpo:EnvioTextoMeta}
  | {status:'bloqueado';codigo:string}

const MARCADOR=/\{\{\s*([A-Z_0-9]+)\s*\}\}|\{\s*([A-Z_0-9]+)\s*\}/g
const TEXTO_TAG_INCONHECIDA=/{{[^{}]*}}/
const TELEFONE=/^\+55[1-9][0-9]{9,10}$/
const META_ID=/^wamid\.[A-Za-z0-9._-]{4,290}$/

function equivalenteWhatsApp(destino:string,origem:string):boolean {
  const normal=destino.slice(1)
  if(origem===normal)return true
  // A Meta pode reportar alguns celulares brasileiros sem o nono dígito.
  return normal.length===13&&normal[4]==='9'&&
    origem===normal.slice(0,4)+normal.slice(5)
}
function horarioLocal(data:Date):{dia:string;hora:string} {
  return {
    dia:new Intl.DateTimeFormat('pt-BR',{
      timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'
    }).format(data),
    hora:new Intl.DateTimeFormat('pt-BR',{
      timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).format(data),
  }
}
function limparNome(valor:string):string {
  return valor.trim().replace(/[\r\n\t\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,80)
}

export function prepararAgradecimentoHml(c:ContextoRespostaHml):PreparacaoRespostaHml {
  if(!c.modeloPublicado||!c.textoModelo?.trim())return {status:'bloqueado',codigo:'MODELO_NAO_PUBLICADO'}
  if(!TELEFONE.test(c.destinatarioE164)||!equivalenteWhatsApp(c.destinatarioE164,c.remetenteClique))
    return {status:'bloqueado',codigo:'DESTINATARIO_NAO_CORRESPONDE'}
  if(!META_ID.test(c.mensagemCliqueId))
    return {status:'bloqueado',codigo:'MENSAGEM_ORIGINAL_INVALIDA'}
  const esperado=c.eventoCodigo==='AGENDAMENTO_CONFIRMADO_WHATSAPP'
    ? {atendimento:'confirmado',convite:'confirmado'}
    : {atendimento:'agendado',convite:'remarcacao_pendente'}
  if(c.statusAtendimento!==esperado.atendimento||c.statusConvite!==esperado.convite)
    return {status:'bloqueado',codigo:'ESTADO_DA_AGENDA_DIVERGENTE'}
  const inicio=Date.parse(c.inicioAtualIso),antes=Date.parse(c.inicioConviteIso)
  const clique=Date.parse(c.cliqueRecebidoIso),agora=Date.parse(c.agoraIso)
  if(![inicio,antes,clique,agora].every(Number.isFinite) || inicio!==antes || inicio<=agora)
    return {status:'bloqueado',codigo:'HORARIO_MODIFICADO_OU_INVALIDO'}
  // Margem de 3min para evitar tentar entregar já perto do fim da janela.
  if(clique>agora+60_000 || agora-clique>24*60*60_000-3*60_000)
    return {status:'bloqueado',codigo:'JANELA_24H_NAO_CONFIRMADA'}
  if(![c.nomeTutor,c.nomePet,c.nomeEmpresa].every(s=>typeof s==='string'&&s.trim()))
    return {status:'bloqueado',codigo:'DADOS_INCOMPLETOS'}
  const {dia,hora}=horarioLocal(new Date(inicio))
  const tags:Record<string,string>={
    NOME_TUTOR:limparNome(c.nomeTutor),NOME_PET:limparNome(c.nomePet),
    NOME_EMPRESA:limparNome(c.nomeEmpresa),
    DATA_AGENDAMENTO:dia,HORARIO_AGENDAMENTO:hora,
  }
  let desconhecida=false
  const texto=c.textoModelo.replace(MARCADOR,(_match,keyDuplo:string|undefined,keySimples:string|undefined)=>{
    const key=keyDuplo??keySimples??''
    if(!Object.hasOwn(tags,key)){desconhecida=true;return ''}
    return tags[key]
  }).trim()
  if(desconhecida||TEXTO_TAG_INCONHECIDA.test(texto)||!texto||texto.length>4096)
    return {status:'bloqueado',codigo:'MODELO_TAG_INVALIDA'}
  if(c.eventoCodigo==='REMARCACAO_SOLICITADA_WHATSAPP' &&
    /https?:\/\//i.test(texto))
    return {status:'bloqueado',codigo:'LINK_AUTOATENDIMENTO_INDISPONIVEL'}
  return {status:'pronto',corpo:{
    messaging_product:'whatsapp',recipient_type:'individual',
    to:c.destinatarioE164.slice(1),
    type:'text',context:{message_id:c.mensagemCliqueId},
    text:{body:texto,preview_url:false}
  }}
}
