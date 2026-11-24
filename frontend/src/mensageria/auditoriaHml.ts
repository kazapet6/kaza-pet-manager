// Contrato da ação administrativa HML v5. Sem envio, texto livre ou PII.
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
  acao:'registrar_decisao_auditoria';tentativa_id:string;categoria:Caso['categoria'];
  decisao:keyof typeof decisoes;motivo:keyof typeof motivos;
  chave_idempotencia:string;confirmar_registro:true
}
export type Recibo={
  status:'registrado'|'ja_registrado';evento_id:string;tentativa_id:string;
  categoria:Registro['categoria'];decisao:Registro['decisao'];motivo:Registro['motivo'];
  registrado_em:string;reenvio_automatico_autorizado:false
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const own=(o:object,k:unknown):k is string=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k)
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const STORAGE_KEY='kaza.hml.jgtctzqieyorhvqxjbpk.auditoria.pendente.v1'
export function registroValido(v:unknown):v is Registro{
  return obj(v)&&Object.keys(v).length===7&&v.acao==='registrar_decisao_auditoria'&&
    typeof v.tentativa_id==='string'&&UUID.test(v.tentativa_id)&&own(categorias,v.categoria)&&
    own(decisoes,v.decisao)&&own(motivos,v.motivo)&&typeof v.chave_idempotencia==='string'&&
    UUID.test(v.chave_idempotencia)&&v.confirmar_registro===true
}
export function reciboValido(v:unknown,p:Registro):v is Recibo{
  return obj(v)&&(v.status==='registrado'||v.status==='ja_registrado')&&
    typeof v.evento_id==='string'&&UUID.test(v.evento_id)&&
    typeof v.tentativa_id==='string'&&v.tentativa_id.toLowerCase()===p.tentativa_id.toLowerCase()&&
    v.categoria===p.categoria&&v.decisao===p.decisao&&v.motivo===p.motivo&&
    typeof v.registrado_em==='string'&&v.registrado_em.length<80&&Number.isFinite(Date.parse(v.registrado_em))&&
    v.reenvio_automatico_autorizado===false
}
export function rejeicaoDefinitiva(status:number,v:unknown):boolean{
  return status===409&&obj(v)&&v.reenvio_automatico_autorizado===false&&
    (v.codigo==='caso_nao_elegivel'||v.codigo==='categoria_desatualizada')
}
