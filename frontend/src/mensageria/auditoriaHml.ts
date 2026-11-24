// Contrato da ação administrativa HML v7 / SQL v2. Sem envio, texto livre ou PII.
export const categorias={
  reserva_antiga:'Reserva antiga',
  resultado_indeterminado:'Resultado indeterminado',
  status_contraditorio:'Informações contraditórias',
  status_falhou:'Falha informada pela Meta',
  aceite_sem_status:'Aceite sem status de entrega',
  entrega_sem_confirmacao:'Entrega sem confirmação'
} as const
export const decisoes={
  manter_em_investigacao:'Manter em investigação',
  solicitar_verificacao_externa:'Solicitar verificação externa',
  registrar_revisao_sem_reenvio:'Registrar revisão sem reenvio'
} as const
export const motivos={
  evidencia_insuficiente:'Evidência insuficiente',
  status_inconsistente:'Status inconsistente',
  identificador_ausente:'Identificador ausente',
  aguardando_evidencia:'Aguardando evidência',
  revisao_realizada:'Revisão realizada'
} as const
export type Caso={tentativa_id:string;categoria:keyof typeof categorias;reservado_em:string}
export type Registro={
  acao:'registrar_decisao_auditoria_v2';tentativa_id:string;categoria:Caso['categoria'];
  predecessor_id:string|null;
  decisao:keyof typeof decisoes;motivo:keyof typeof motivos;
  chave_idempotencia:string;confirmar_registro:true
}
export type Recibo={
  status:'registrado'|'ja_registrado';evento_id:string;tentativa_id:string;
  categoria:Registro['categoria'];decisao:Registro['decisao'];motivo:Registro['motivo'];
  predecessor_id:string|null;versao:number;
  registrado_em:string;reenvio_automatico_autorizado:false
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const own=(o:object,k:unknown):k is string=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k)
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const STORAGE_KEY='kaza.hml.jgtctzqieyorhvqxjbpk.auditoria.pendente.v1'
export function registroValido(v:unknown):v is Registro{
  return obj(v)&&Object.keys(v).length===8&&v.acao==='registrar_decisao_auditoria_v2'&&
    (v.predecessor_id===null||uuid(v.predecessor_id))&&
    typeof v.tentativa_id==='string'&&UUID.test(v.tentativa_id)&&own(categorias,v.categoria)&&
    own(decisoes,v.decisao)&&own(motivos,v.motivo)&&typeof v.chave_idempotencia==='string'&&
    UUID.test(v.chave_idempotencia)&&v.confirmar_registro===true
}
export function reciboValido(v:unknown,p:Registro,versaoEsperada:number):v is Recibo{
  return obj(v)&&(v.status==='registrado'||v.status==='ja_registrado')&&
    typeof v.evento_id==='string'&&UUID.test(v.evento_id)&&
    typeof v.tentativa_id==='string'&&v.tentativa_id.toLowerCase()===p.tentativa_id.toLowerCase()&&
    igualUuid(v.predecessor_id,p.predecessor_id)&&v.versao===versaoEsperada&&
    !igualUuid(v.evento_id,v.predecessor_id)&&
    (v.versao===1?v.predecessor_id===null:uuid(v.predecessor_id))&&
    v.categoria===p.categoria&&v.decisao===p.decisao&&v.motivo===p.motivo&&
    typeof v.registrado_em==='string'&&v.registrado_em.length<80&&Number.isFinite(Date.parse(v.registrado_em))&&
    v.reenvio_automatico_autorizado===false
}
export function rejeicaoDefinitiva(status:number,v:unknown):boolean{
  return status===409&&obj(v)&&v.reenvio_automatico_autorizado===false&&
    (v.codigo==='caso_nao_elegivel'||v.codigo==='categoria_desatualizada'||v.codigo==='predecessor_desatualizado')
}

 // Diário compartilhado por origem. O v1 era exclusivo da aba.
export const JOURNAL_KEY='kaza.hml.jgtctzqieyorhvqxjbpk.auditoria.diario.v2'
export const LOCK_NAME='kaza.hml.jgtctzqieyorhvqxjbpk.auditoria.registro.v2'
export type Diario={estado:'pendente';registro:Registro;versao_esperada:number}|{estado:'resolvido';chave_idempotencia:string}
export function lerDiario(raw:string|null):Diario|null{
  if(raw===null)return null
  const v:unknown=JSON.parse(raw)
  if(obj(v)){
    if(Object.keys(v).length===3&&v.estado==='pendente'&&registroValido(v.registro)&&
      inteiro(v.versao_esperada,1)&&(v.registro.predecessor_id===null?v.versao_esperada===1:v.versao_esperada>1))
      return {estado:'pendente',registro:v.registro,versao_esperada:v.versao_esperada}
    if(Object.keys(v).length===2&&v.estado==='resolvido'&&typeof v.chave_idempotencia==='string'&&UUID.test(v.chave_idempotencia))
      return {estado:'resolvido',chave_idempotencia:v.chave_idempotencia}
  }
  throw Error('DIARIO_INVALIDO')
}
// Um formulário antigo não pode confirmar uma revisão diferente da que foi exibida.
export function snapshotCoincide(exibido:string|null,atual:string|null):boolean{
  return exibido===atual
}

export const uuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v)
export const igualUuid=(a:unknown,b:unknown)=>a===null&&b===null||uuid(a)&&uuid(b)&&a.toLowerCase()===b.toLowerCase()
const inteiro=(v:unknown,min:number,max=2147483647):v is number=>
  typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max
const dataValida=(v:unknown):v is string=>typeof v==='string'&&v.length<80&&Number.isFinite(Date.parse(v))
export type Evento=Omit<Recibo,'status'|'reenvio_automatico_autorizado'>
export type Historico={
  status:'ok';tentativa_id:string;head_evento_id:string|null;head_versao:number;
  categoria_atual:Caso['categoria']|null;eventos:Evento[];quantidade:number;
  proxima_antes_versao:number|null;reenvio_automatico_autorizado:false
}
export type ItemHistorico={tentativa_id:string;head_evento_id:string;head_versao:number;registrado_em:string}
export type IndiceHistorico={status:'ok';itens:ItemHistorico[];quantidade:number;
  proximo_depois_tentativa:string|null;reenvio_automatico_autorizado:false}
function eventoValido(v:unknown,tentativa:string):v is Evento{
  return obj(v)&&uuid(v.evento_id)&&igualUuid(v.tentativa_id,tentativa)&&inteiro(v.versao,1)&&
    (v.versao===1?v.predecessor_id===null:uuid(v.predecessor_id))&&!igualUuid(v.evento_id,v.predecessor_id)&&
    own(categorias,v.categoria)&&own(decisoes,v.decisao)&&own(motivos,v.motivo)&&dataValida(v.registrado_em)
}
export function historicoValido(v:unknown,tentativa:string,limite:number,antes:number|null):v is Historico{
  if(!obj(v)||v.status!=='ok'||!igualUuid(v.tentativa_id,tentativa)||
    v.reenvio_automatico_autorizado!==false||!inteiro(v.head_versao,0)||
    (v.head_versao===0?v.head_evento_id!==null:!uuid(v.head_evento_id))||
    !(v.categoria_atual===null||own(categorias,v.categoria_atual))||
    !Array.isArray(v.eventos)||v.quantidade!==v.eventos.length)return false
  const inicio=antes===null?v.head_versao:Math.min(v.head_versao,antes-1)
  const n=Math.min(inicio,limite)
  if(v.eventos.length!==n||v.proxima_antes_versao!==(inicio>n?inicio-n+1:null))return false
  const ids=new Set<string>()
  let anterior:Evento|null=null
  for(let i=0;i<v.eventos.length;i++){
    const ev:unknown=v.eventos[i]
    if(!eventoValido(ev,tentativa)||ev.versao!==inicio-i||
      (igualUuid(ev.evento_id,v.head_evento_id)!==(ev.versao===v.head_versao))||
      (anterior&&!igualUuid(anterior.predecessor_id,ev.evento_id))||
      ids.has(ev.evento_id.toLowerCase()))return false
    ids.add(ev.evento_id.toLowerCase());anterior=ev
  }
  return !anterior||anterior.predecessor_id===null||
    (!ids.has(anterior.predecessor_id.toLowerCase())&&!igualUuid(anterior.predecessor_id,v.head_evento_id))
}
// Paginas nao constituem snapshot global. Se a cabeca ou categoria mudou,
// descartar a leitura anterior, nunca atualizar silenciosamente o predecessor.
export function unirHistorico(a:Historico,b:Historico):Historico|null{
  if(!igualUuid(a.tentativa_id,b.tentativa_id)||!igualUuid(a.head_evento_id,b.head_evento_id)||
    a.head_versao!==b.head_versao||a.categoria_atual!==b.categoria_atual||
    a.proxima_antes_versao===null||!b.eventos.length||!a.eventos.length||
    b.eventos[0].versao!==a.proxima_antes_versao-1||
    !igualUuid(a.eventos[a.eventos.length-1].predecessor_id,b.eventos[0].evento_id))return null
  const eventos=[...a.eventos,...b.eventos]
  const ids=new Set(eventos.map(e=>e.evento_id.toLowerCase()))
  const ultimo=eventos[eventos.length-1].predecessor_id
  if(ids.size!==eventos.length||ultimo!==null&&ids.has(ultimo.toLowerCase()))return null
  return {...a,eventos,quantidade:eventos.length,proxima_antes_versao:b.proxima_antes_versao}
}
export function indiceValido(v:unknown,limite:number,depois:string|null):v is IndiceHistorico{
  if(!obj(v)||v.status!=='ok'||v.reenvio_automatico_autorizado!==false||
    !Array.isArray(v.itens)||v.quantidade!==v.itens.length||v.itens.length>limite)return false
  let anterior=depois?.toLowerCase()??''
  const heads=new Set<string>()
  for(const item of v.itens){
    if(!obj(item)||!uuid(item.tentativa_id)||!uuid(item.head_evento_id)||
      !inteiro(item.head_versao,1)||!dataValida(item.registrado_em)||
      item.tentativa_id.toLowerCase()<=anterior||heads.has(item.head_evento_id.toLowerCase()))return false
    anterior=item.tentativa_id.toLowerCase();heads.add(item.head_evento_id.toLowerCase())
  }
  return v.proximo_depois_tentativa===null||
    (v.itens.length===limite&&igualUuid(v.proximo_depois_tentativa,anterior))
}
export function historicoPermiteRegistro(h:Historico|null,c:Caso|undefined):h is Historico{
  return !!h&&!!c&&igualUuid(h.tentativa_id,c.tentativa_id)&&h.categoria_atual===c.categoria&&
    h.head_versao<2147483647
}
