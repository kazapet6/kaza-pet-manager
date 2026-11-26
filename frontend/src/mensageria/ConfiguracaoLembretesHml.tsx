import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

type Config={status:'ok';ativo:boolean;antecedencia_minima_horas:number;horario_vespera:string;antecedencia_mesmo_dia_horas:number;revisao:number;despacho_instalado:boolean}
type Item={id:string;pet:string;compromisso:string|null;enviar_em:string|null;regra:string;situacao:string}
const valid=(d:Config|null):d is Config=>!!d&&d.status==='ok'&&Number.isSafeInteger(d.revisao)&&d.revisao>0&&Number.isInteger(d.antecedencia_minima_horas)&&d.antecedencia_minima_horas>=24&&d.antecedencia_minima_horas<=720&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(d.horario_vespera)&&Number.isInteger(d.antecedencia_mesmo_dia_horas)&&d.antecedencia_mesmo_dia_horas>=1&&d.antecedencia_mesmo_dia_horas<=23&&d.despacho_instalado===false
const format=(v:string|null)=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—'
const labels:Record<string,string>={status_inelegivel:'Status não elegível',convite_existente:'Convite existente',sem_envio:'Não enviar',horario_passado:'Horário passou — não enviar',devido:'Horário devido',programavel:'Programável'}
export default function ConfiguracaoLembretesHml(){
 const [config,setConfig]=useState<Config|null>(null)
 const [min,setMin]=useState('24')
 const [hora,setHora]=useState('18:00')
 const [mesmo,setMesmo]=useState('3')
 const [busy,setBusy]=useState(false)
 const [msg,setMsg]=useState('')
 const [erro,setErro]=useState('')
 const [itens,setItens]=useState<Item[]|null>(null)
 const valido=Number.isInteger(Number(min))&&Number(min)>=24&&Number(min)<=720&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(hora)&&Number.isInteger(Number(mesmo))&&Number(mesmo)>=1&&Number(mesmo)<=23
 const sujo=!!config&&(Number(min)!==config.antecedencia_minima_horas||hora!==config.horario_vespera||Number(mesmo)!==config.antecedencia_mesmo_dia_horas)
 function carregarCampos(c:Config){setConfig(c);setMin(String(c.antecedencia_minima_horas));setHora(c.horario_vespera);setMesmo(String(c.antecedencia_mesmo_dia_horas));setItens(null)}
 async function carregar(){
  setBusy(true);setErro('');setMsg('')
  try{const {data,error}=await supabase.functions.invoke<Config>('mensageria-confirmacao-hml',{body:{acao:'config_lembrete',comando:'status'}})
  if(error||!valid(data))throw Error();carregarCampos(data)}catch{setConfig(null);setErro('Configuração indisponível. Nenhum envio realizado.')}finally{setBusy(false)}
 }
 useEffect(()=>{void carregar()},[])
 async function salvar(){
  if(!config||!valido||busy||!sujo)return
  setBusy(true);setErro('');setMsg('')
  try{const {data,error}=await supabase.functions.invoke<Config>('mensageria-confirmacao-hml',{body:{acao:'config_lembrete',comando:'salvar',revisao:config.revisao,antecedencia:Number(min),vespera:hora,mesmoDia:Number(mesmo)}})
  if(error||!valid(data))throw Error();carregarCampos(data);setMsg('Regras salvas. Os disparos continuam desativados.')}catch{setErro('Não foi possível confirmar a gravação. Atualize antes de tentar novamente.')}finally{setBusy(false)}
 }
 async function simular(){
  if(busy||sujo||!config)return
  setBusy(true);setErro('');setMsg('');setItens(null)
  try{const {data,error}=await supabase.functions.invoke<{status:string;simulacao:boolean;despachos:number;revisao:number;itens:Item[]}>('mensageria-confirmacao-hml',{body:{acao:'simular_lembretes'}})
  if(error||data?.status!=='ok'||data.simulacao!==true||data.despachos!==0||data.revisao!==config.revisao||!Array.isArray(data.itens)||data.itens.length>100)throw Error()
  setItens(data.itens);setMsg('Simulação concluída. Nenhuma mensagem enviada.')}catch{setErro('Não foi possível simular. Atualize a configuração.')}finally{setBusy(false)}
 }
 return <div className="msg-info">
  <h3>Automação de confirmações</h3>
  <p>Horário de Brasília · Homologação · Disparos programados desativados</p>
  {config&&<><div className="msg-event-grid">
   <label>Antecedência mínima para envio na véspera (horas)<input type="number" min={24} max={720} step={1} value={min} disabled={busy} onChange={e=>setMin(e.target.value)}/></label>
   <label>Horário de envio na véspera<input type="time" value={hora} disabled={busy} onChange={e=>setHora(e.target.value)}/></label>
   <label>Antecedência no mesmo dia (horas)<input type="number" min={1} max={23} step={1} value={mesmo} disabled={busy} onChange={e=>setMesmo(e.target.value)}/></label>
  </div><p>Fora das regras, não enviar. Para TaxiDog, considerar o início da coleta.</p>
  <button type="button" className="msg-quiet" disabled={busy||!valido||!sujo} onClick={()=>void salvar()}>Salvar regras</button>{' '}
  <button type="button" className="msg-quiet" disabled={busy||sujo} onClick={()=>void simular()}>Simular lembretes (sem enviar)</button>{' '}</>}
  <button type="button" className="msg-quiet" disabled={busy} onClick={()=>void carregar()}>Atualizar regras</button>
  {erro&&<p className="msg-issues" role="alert">{erro}</p>}{msg&&<p role="status">{msg}</p>}
  {itens&&<><p>{itens.length} atendimento(s) analisado(s).</p><div className="msg-event-grid">{itens.map(i=><div key={i.id}><strong>{i.pet}</strong><span>{format(i.compromisso)}</span><small>Envio previsto: {format(i.enviar_em)}</small><small>{labels[i.situacao]??i.situacao}</small></div>)}</div></>}
 </div>
}
