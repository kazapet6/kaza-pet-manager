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
 const [operacao,setOperacao]=useState<{receptor:boolean;processamento:boolean;envio_expira_em:string|null}|null>(null)
 const [meta,setMeta]=useState<Record<string,unknown>|null>(null)
 const [relogio,setRelogio]=useState(Date.now)
 const envioUI=WHATSAPP_HML_HABILITADO && window.location.hostname==='hml.kazapetcare.com.br'
 const janelaAtiva=!!operacao?.envio_expira_em && Date.parse(operacao.envio_expira_em)>relogio
 const metaOk=!!meta && ['credencial_aceita','telefone_acessivel','telefone_na_waba','aplicativo_hml','permissao_envio'].every(k=>meta[k]===true)
 useEffect(()=>{const id=window.setInterval(()=>setRelogio(Date.now()),1000);return ()=>window.clearInterval(id)},[])
 async function chamar(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke<Record<string,unknown>>('mensageria-confirmacao-hml',{body})
  if(error){
   let codigo='OPERACAO_NAO_CONFIRMADA'
   try{const contexto=(error as {context?:Response}).context;const detalhe=await contexto?.json();if(typeof detalhe?.codigo==='string'&&/^[A-Z_0-9]+$/.test(detalhe.codigo))codigo=detalhe.codigo}catch{/* sem detalhes */}
   throw Error(codigo)
  }
  if(!data)throw Error('RESPOSTA_INDISPONIVEL')
  return data
 }
 async function controle(acao:string,comando?:string){
  if(!envioUI||trava.current)return
  if(comando==='abrir_envio'&&(!metaOk||!window.confirm('Abrir janela de envio de teste por 180 segundos, somente para o destinatário autorizado?')))return
  if(acao==='processar_ciclo'&&(!janelaAtiva||!window.confirm('Processar até um clique e um agradecimento elegível na fila HML?')))return
  if(comando==='ligar_receptor'||comando==='ligar_processamento'){if(!window.confirm('Habilitar este controle de homologação?'))return}
  trava.current=true;setOcupado(true);setResultado('')
  try{
   const data=await chamar(comando?{acao,comando,...(comando==='abrir_envio'?{segundos:180}:{})}:acao==='processar_ciclo'?{acao,limite:1}:{acao})
   if(acao==='operacao'){
    setOperacao({receptor:data.receptor===true,processamento:data.processamento===true,envio_expira_em:typeof data.envio_expira_em==='string'?data.envio_expira_em:null});setRelogio(Date.now())
    setResultado('Controles de homologação atualizados.')
   }else if(acao==='prevalidar_meta'){setMeta(data);setResultado('Pré-validação concluída. Confira os indicadores abaixo.')}
   else {const d=data.despacho as Record<string,unknown>|null;setResultado('Ciclo: '+String(data.codigo??'concluído')+' · agradecimento: '+String(d?.estado??d?.status??'não confirmado')+'. Confira o histórico.');atualizar()}
  }catch(e){if(acao==='prevalidar_meta')setMeta(null);if(acao==='operacao')setOperacao(null);setResultado('Operação não confirmada: '+(e instanceof Error?e.message:'ERRO')+'. Atualize o estado antes de repetir.')}
  finally{trava.current=false;setOcupado(false)}
 }
 const alvo=itens?.find(x=>x.id===selecionado)
 const filtrados=itens?.filter(x=>[x.tutor,x.pet,x.servicos,x.data].some(v=>v.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR').trim())))??[]
 async function enviar(){
  if(!envioUI||!janelaAtiva||!alvo||alvo.elegibilidade!=='elegivel_piloto'||trava.current||incertos.current.has(alvo.id))return
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
  {envioUI&&<div className="msg-operacao-detalhe"><h3>Operação controlada do WhatsApp · HML</h3>
   <p className="msg-hint">Somente destinatário de teste autorizado pelo servidor. Nenhum disparo automático por este painel.</p>
   <div className="msg-controls">
    <button type="button" className="msg-quiet" disabled={ocupado} onClick={()=>void controle('prevalidar_meta')}>Validar conexão com a Meta</button>
    <button type="button" className="msg-quiet" disabled={ocupado} onClick={()=>void controle('operacao','status')}>Consultar estado</button>
    <button type="button" className="msg-primary" disabled={ocupado||!metaOk||janelaAtiva} onClick={()=>void controle('operacao','abrir_envio')}>Abrir janela de teste (3 min)</button>
    <button type="button" className="msg-quiet" disabled={ocupado} onClick={()=>void controle('operacao','fechar_envio')}>Encerrar janela</button>
   </div>
   {meta&&<p role="status">{['credencial_aceita','telefone_acessivel','telefone_na_waba','aplicativo_hml','permissao_gestao','permissao_envio'].map(k=>k+': '+(meta[k]===true?'OK':'não validado')).join(' · ')}</p>}
   <p>Janela: {janelaAtiva?'ativa até '+dataHora(operacao?.envio_expira_em??null):'fechada ou não consultada'} · Receptor: {operacao?.receptor?'ativo':'não confirmado'} · Processamento: {operacao?.processamento?'ativo':'não confirmado'}</p>
   <div className="msg-controls">
    <button type="button" className="msg-quiet" disabled={ocupado||operacao?.receptor===true} onClick={()=>void controle('operacao','ligar_receptor')}>Habilitar receptor</button>
    <button type="button" className="msg-quiet" disabled={ocupado||operacao?.processamento===true} onClick={()=>void controle('operacao','ligar_processamento')}>Habilitar processamento</button>
    <button type="button" className="msg-primary" disabled={ocupado||!janelaAtiva||!operacao?.processamento} onClick={()=>void controle('processar_ciclo')}>Processar clique e agradecimento</button>
    <button type="button" className="msg-danger" disabled={ocupado} onClick={()=>void controle('operacao','emergencia')}>Bloquear operação</button>
   </div>
   {resultado&&<p role="status" className="msg-issues">{resultado}</p>}
  </div>}
  {erro?<p role="alert" className="msg-issues">{erro}</p>:itens===null?<p role="status">Consultando agenda...</p>:<>
   <label className="msg-operacao-busca">Buscar tutor, pet, serviço ou data<input className="msg-input" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar agendamentos"/></label>
   <p className="msg-hint">{filtrados.length} de {itens.length} registro(s) · até 100 próximos atendimentos. Agendamentos sem unidade determinada não são exibidos.</p>
   {filtrados.length===0?<p>Nenhum atendimento encontrado neste escopo.</p>:<div className="msg-operacao-linhas">{filtrados.map(x=><button type="button" key={x.id} className="msg-operacao-item" aria-pressed={selecionado===x.id} disabled={ocupado} onClick={()=>{setSelecionado(x.id);setResultado('')}}><span><strong>{x.pet}</strong><small>{x.tutor} · {x.servicos}</small></span><span><strong>{dataHora(x.compromisso??x.inicio)}</strong><small>{x.modalidade==='taxidog'?'Coleta TaxiDog':'Sem transporte'} · {rotulo(x.status)}</small></span><span className="msg-operacao-situacao">{elegibilidade[x.elegibilidade]}</span></button>)}</div>}
   {alvo&&<div className="msg-operacao-detalhe"><h3>Agendamento selecionado</h3><dl><dt>Tutor</dt><dd>{alvo.tutor}</dd><dt>Pet</dt><dd>{alvo.pet}</dd><dt>Serviços</dt><dd>{alvo.servicos}</dd><dt>{alvo.modalidade==='taxidog'?'Coleta':'Horário combinado'}</dt><dd>{dataHora(alvo.compromisso)}</dd><dt>Início operacional</dt><dd>{dataHora(alvo.inicio)}</dd><dt>Último convite</dt><dd>{rotulo(alvo.convite_estado)}</dd><dt>Elegibilidade</dt><dd>{elegibilidade[alvo.elegibilidade]}</dd></dl><p className="msg-hint">O envio exige autorização temporária no servidor e o destinatário de teste aprovado. A prévia é apenas informativa.</p><button type="button" className="msg-primary" disabled={!envioUI||!janelaAtiva||alvo.elegibilidade!=='elegivel_piloto'||ocupado||incertos.current.has(alvo.id)} onClick={()=>void enviar()}>{ocupado?'Solicitando...':'Enviar convite de teste'}</button>{!envioUI&&<p className="msg-hint">Envio bloqueado nesta implantação.</p>}</div>}
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
