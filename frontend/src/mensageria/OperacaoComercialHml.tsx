import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WHATSAPP_HML_HABILITADO } from '../whatsappHml/configuracao'
import './OperacaoComercialHml.css'

type AgendaItem = { id:string; tutor:string; pet:string; data:string; modalidade:string; inicio:string; compromisso:string|null; status:string; servicos:string; convite_estado:string|null; elegibilidade:string }
type HistoricoItem = { id:string; atendimento_id:string|null; tutor:string; pet:string|null; compromisso:string|null; criado_em:string; tipo:'convite'|'agradecimento'|'manual'; estado:string; destino_final:string; codigo:string|null; resposta:string|null; entrega:string|null; entrega_em:string|null }
type Leitura<T> = { status:string; somente_leitura:boolean; limite:number; itens:T[] }
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const dataHora=(v:string|null)=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—'
const elegibilidade:Record<string,string>={ja_confirmado:'Já confirmado',sem_vinculo_mensageria:'Vínculo de mensageria pendente',unidade_desativada:'Confirmação desativada na unidade',elegivel_piloto:'Elegível para teste',fora_do_escopo_de_envio:'Envio não autorizado'}
const tipos:Record<HistoricoItem['tipo'],string>={convite:'Convite de confirmação',agradecimento:'Agradecimento / orientação',manual:'Mensagem manual'}
const entregas:Record<string,string>={sent:'Enviada',delivered:'Entregue',read:'Lida',failed:'Falha na entrega'}
const estados:Record<string,string>={agendado:'Agendado',confirmado:'Confirmado',ativo:'Aguardando resposta',preparado:'Preparado',expirado:'Expirado',invalido:'Invalidado',remarcacao_pendente:'Remarcação pendente',falha:'Falha',aceito:'Aceito pela Meta',aceito_meta:'Aceito pela Meta',recusado_meta:'Recusado pela Meta',reservado:'Reservado',indeterminado:'Resultado indeterminado'}
function rotulo(v:string|null){return v?estados[v]??v.replaceAll('_',' '):'—'}
function useLeitura<T extends {id:string}>(acao:'agenda_comercial'|'historico_mensagens',validar:(x:T)=>boolean,limite:number){
 const [itens,setItens]=useState<T[]|null>(null)
 const [erro,setErro]=useState('')
 const [versao,setVersao]=useState(0)
 useEffect(()=>{
  if(!WHATSAPP_HML_HABILITADO)return
  let ativo=true
  setItens(null);setErro('')
  void supabase.functions.invoke<Leitura<T>>('mensageria-confirmacao-hml',{body:{acao}}).then(({data,error})=>{
   if(!ativo)return
   if(error||data?.status!=='ok'||data.somente_leitura!==true||data.limite!==limite||!Array.isArray(data.itens)||data.itens.length>limite||!data.itens.every(x=>x&&UUID.test(x.id)&&validar(x)))throw Error('LEITURA_INVALIDA')
   setItens(data.itens)
  }).catch(()=>{if(ativo)setErro('Não foi possível consultar os registros. Nenhum envio foi realizado.')})
  return ()=>{ativo=false}
 },[acao,versao,validar,limite])
 return {itens,erro,atualizar:()=>setVersao(x=>x+1)}
}
const validaAgenda=(x:AgendaItem)=>typeof x.tutor==='string'&&typeof x.pet==='string'&&typeof x.servicos==='string'&&Number.isFinite(Date.parse(x.inicio))&&['agendado','confirmado'].includes(x.status)&&Object.prototype.hasOwnProperty.call(elegibilidade,x.elegibilidade)
const validaHistorico=(x:HistoricoItem)=>Object.prototype.hasOwnProperty.call(tipos,x.tipo)&&typeof x.tutor==='string'&&typeof x.estado==='string'&&Number.isFinite(Date.parse(x.criado_em))&&typeof x.destino_final==='string'&&/^[0-9]{0,4}$/.test(x.destino_final)&& (x.entrega===null||Object.prototype.hasOwnProperty.call(entregas,x.entrega))

export function AgendaComercialHml(){
 const {itens,erro,atualizar}=useLeitura<AgendaItem>('agenda_comercial',validaAgenda,100)
 const [busca,setBusca]=useState('')
 const [selecionado,setSelecionado]=useState('')
 const [resultado,setResultado]=useState('')
 const [ocupado,setOcupado]=useState(false)
 const trava=useRef(false)
 const incertos=useRef(new Set<string>())
 const envioUI=import.meta.env.VITE_WHATSAPP_HML_SEND_UI_ENABLED==='true'
 const alvo=itens?.find(x=>x.id===selecionado)
 const filtrados=itens?.filter(x=>[x.tutor,x.pet,x.servicos,x.data].some(v=>v.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR').trim())))??[]
 async function enviar(){
  if(!envioUI||!alvo||alvo.elegibilidade!=='elegivel_piloto'||trava.current||incertos.current.has(alvo.id))return
  if(!window.confirm('Autorizar um único convite de teste para o destinatário restrito do HML?'))return
  trava.current=true;setOcupado(true);incertos.current.add(alvo.id);setResultado('')
  try{
   const {data,error}=await supabase.functions.invoke<{estado?:string}>('mensageria-confirmacao-hml',{body:{acao:'enviar_convite',atendimentoId:alvo.id}})
   setResultado(!error&&data?.estado==='vinculado'?'Convite vinculado. A entrega ainda precisa ser comprovada.':'Envio não confirmado. Consulte o histórico; não repita automaticamente.')
  }catch{setResultado('Resultado incerto. Consulte o histórico antes de qualquer nova tentativa.')}
  finally{trava.current=false;setOcupado(false);atualizar()}
 }
 if(!WHATSAPP_HML_HABILITADO)return null
 return <section className="msg-coming msg-operacao-lista" aria-label="Agenda comercial">
  <div className="msg-panel-heading"><div><h2>Agendamentos comerciais</h2><p>Próximos atendimentos da unidade autorizada. A listagem não autoriza envios.</p></div><button type="button" className="msg-quiet" disabled={ocupado} onClick={atualizar}>Atualizar</button></div>
  {erro?<p role="alert" className="msg-issues">{erro}</p>:itens===null?<p role="status">Consultando agenda...</p>:<>
   <label className="msg-operacao-busca">Buscar tutor, pet, serviço ou data<input className="msg-input" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar agendamentos"/></label>
   <p className="msg-hint">{filtrados.length} de {itens.length} registro(s) · até 100 próximos atendimentos. Agendamentos sem unidade determinada não são exibidos.</p>
   {filtrados.length===0?<p>Nenhum atendimento encontrado neste escopo.</p>:<div className="msg-operacao-linhas">{filtrados.map(x=><button type="button" key={x.id} className="msg-operacao-item" aria-pressed={selecionado===x.id} disabled={ocupado} onClick={()=>{setSelecionado(x.id);setResultado('')}}><span><strong>{x.pet}</strong><small>{x.tutor} · {x.servicos}</small></span><span><strong>{dataHora(x.compromisso??x.inicio)}</strong><small>{x.modalidade==='taxidog'?'Coleta TaxiDog':'Sem transporte'} · {rotulo(x.status)}</small></span><span className="msg-operacao-situacao">{elegibilidade[x.elegibilidade]}</span></button>)}</div>}
   {alvo&&<div className="msg-operacao-detalhe"><h3>Agendamento selecionado</h3><dl><dt>Tutor</dt><dd>{alvo.tutor}</dd><dt>Pet</dt><dd>{alvo.pet}</dd><dt>Serviços</dt><dd>{alvo.servicos}</dd><dt>{alvo.modalidade==='taxidog'?'Coleta':'Horário combinado'}</dt><dd>{dataHora(alvo.compromisso)}</dd><dt>Início operacional</dt><dd>{dataHora(alvo.inicio)}</dd><dt>Último convite</dt><dd>{rotulo(alvo.convite_estado)}</dd><dt>Elegibilidade</dt><dd>{elegibilidade[alvo.elegibilidade]}</dd></dl><p className="msg-hint">O envio exige autorização temporária no servidor e o destinatário de teste aprovado. A prévia é apenas informativa.</p><button type="button" className="msg-primary" disabled={!envioUI||alvo.elegibilidade!=='elegivel_piloto'||ocupado||incertos.current.has(alvo.id)} onClick={()=>void enviar()}>{ocupado?'Solicitando...':'Enviar convite de teste'}</button>{!envioUI&&<p className="msg-hint">Envio bloqueado nesta implantação.</p>}</div>}
   {resultado&&<p role="status" className="msg-issues">{resultado}</p>}
  </>}
 </section>
}

export function HistoricoMensagensHml(){
 const {itens,erro,atualizar}=useLeitura<HistoricoItem>('historico_mensagens',validaHistorico,50)
 const [filtro,setFiltro]=useState<'todos'|HistoricoItem['tipo']>('todos')
 const filtrados=itens?.filter(x=>filtro==='todos'||x.tipo===filtro)??[]
 if(!WHATSAPP_HML_HABILITADO)return null
 return <section className="msg-coming msg-operacao-lista" aria-label="Histórico de mensagens">
  <div className="msg-panel-heading"><div><h2>Histórico de mensagens</h2><p>Registros persistidos na homologação, sem expor números completos ou tokens.</p></div><button type="button" className="msg-quiet" onClick={atualizar}>Atualizar</button></div>
  <label className="msg-operacao-busca">Tipo de mensagem<select className="msg-input" value={filtro} onChange={e=>setFiltro(e.target.value as typeof filtro)}><option value="todos">Todas</option><option value="convite">Convites</option><option value="agradecimento">Agradecimentos</option><option value="manual">Manuais</option></select></label>
  {erro?<p className="msg-issues" role="alert">{erro}</p>:itens===null?<p role="status">Consultando histórico...</p>:<>
  <p className="msg-hint">{filtrados.length} de {itens.length} registros · últimos 50. Aceitação pela Meta não comprova entrega.</p>
  {filtrados.length===0?<p>Nenhuma mensagem registrada neste escopo.</p>:<div className="msg-operacao-linhas">{filtrados.map(x=><article className="msg-operacao-item msg-historico-item" key={x.tipo+':'+x.id}><span><strong>{tipos[x.tipo]}</strong><small>{x.tutor}{x.pet?' · '+x.pet:''} · final {x.destino_final||'—'}</small><small>{dataHora(x.criado_em)}</small></span><span><strong>{rotulo(x.estado)}</strong><small>{x.entrega?entregas[x.entrega]+' · '+dataHora(x.entrega_em):'Entrega não comprovada'}</small>{x.resposta&&<small>Resposta: {rotulo(x.resposta)}</small>}</span><span><small>{x.atendimento_id?'Agendamento: '+dataHora(x.compromisso):'Sem agendamento vinculado'}</small>{x.codigo&&<small>Código: {x.codigo}</small>}</span></article>)}</div>}
  </>}
 </section>
}
