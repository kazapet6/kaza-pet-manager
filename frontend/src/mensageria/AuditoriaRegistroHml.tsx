import {useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {categorias,decisoes,motivos,registroValido,reciboValido,rejeicaoDefinitiva,STORAGE_KEY,UUID} from './auditoriaHml'
import type {Caso,Registro,Recibo} from './auditoriaHml'

function carregar(){
  try{
    const raw=sessionStorage.getItem(STORAGE_KEY)
    if(raw===null)return {pendente:null,bloqueado:false}
    const p:unknown=JSON.parse(raw)
    return registroValido(p)?{pendente:p,bloqueado:false}:{pendente:null,bloqueado:true}
  }catch{return {pendente:null,bloqueado:true}}
}

export default function AuditoriaRegistroHml({casos}:{casos:Caso[]}){
  const [inicial]=useState(carregar)
  const [pendente,setPendente]=useState<Registro|null>(inicial.pendente)
  const [bloqueado,setBloqueado]=useState(inicial.bloqueado)
  const [selecionado,setSelecionado]=useState('')
  const [decisao,setDecisao]=useState('')
  const [motivo,setMotivo]=useState('')
  const [confirmado,setConfirmado]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const [aviso,setAviso]=useState('')
  const [recibo,setRecibo]=useState<Recibo|null>(null)
  const emCurso=useRef(false)
  const caso=casos.find(c=>c.tentativa_id===selecionado)
  function limpar(){
    try{sessionStorage.removeItem(STORAGE_KEY);setPendente(null)}
    catch{setBloqueado(true);setAviso('Não foi possível limpar o registro local. Novas decisões estão bloqueadas.')}
    setConfirmado(false);setSelecionado('');setDecisao('');setMotivo('')
  }
  async function registrar(){
    if(emCurso.current||bloqueado||!confirmado)return
    emCurso.current=true;setOcupado(true);setConfirmado(false);setAviso('');setRecibo(null)
    try{
      let p=pendente
      // A consulta da sessão não autoriza nada por si só; a Edge revalida o JWT.
      const {data,error}=await supabase.auth.getSession()
      if(error||!data.session){setAviso('Sessão indisponível. Entre novamente antes de continuar.');return}
      const raw=sessionStorage.getItem(STORAGE_KEY)
      if(raw!==null){
        const salvo:unknown=JSON.parse(raw)
        if(!registroValido(salvo)||!p||JSON.stringify(salvo)!==JSON.stringify(p)){
          setBloqueado(true);setAviso('Registro local divergente. Não será criada outra chave.');return
        }
      }else if(p){setBloqueado(true);setAviso('Registro local ausente. Não será criada outra chave.');return}
      if(!p){
        if(!caso||!UUID.test(caso.tentativa_id)||!globalThis.crypto?.randomUUID){
          setAviso('Caso indisponível ou contexto inseguro. Atualize a triagem antes de registrar.');return
        }
        const candidato:unknown={
          acao:'registrar_decisao_auditoria',tentativa_id:caso.tentativa_id,categoria:caso.categoria,
          decisao,motivo,chave_idempotencia:crypto.randomUUID(),confirmar_registro:true
        }
        if(!registroValido(candidato)){setAviso('Selecione uma decisão e um motivo válidos.');return}
        p=candidato
        // Persiste ANTES da requisição. Nenhum envio caso armazenamento falhe.
        sessionStorage.setItem(STORAGE_KEY,JSON.stringify(p))
        setPendente(p)
      }
      const {data:resultado,error:falha}=await supabase.functions.invoke<unknown>(
        'mensageria-outbox-hml',{body:p,headers:{Authorization:'Bearer '+data.session.access_token}})
      if(!falha&&reciboValido(resultado,p)){
        setRecibo({
          status:resultado.status,evento_id:resultado.evento_id,tentativa_id:resultado.tentativa_id,
          categoria:resultado.categoria,decisao:resultado.decisao,motivo:resultado.motivo,
          registrado_em:resultado.registrado_em,reenvio_automatico_autorizado:false
        })
        limpar();return
      }
      // Só a rejeição autoritativa que verifica elegibilidade APÓS replay
      // permite liberar a chave sem recibo. Outras falhas permanecem incertas.
      const contexto=(falha as {context?:unknown}|null)?.context
      if(contexto instanceof Response&&contexto.status===409){
        const corpo:unknown=await contexto.clone().json().catch(()=>null)
        if(rejeicaoDefinitiva(contexto.status,corpo)){
          limpar();setAviso('O caso ou a categoria mudou. Atualize a triagem antes de iniciar outra revisão.');return
        }
      }
      setAviso('Registro não confirmado. Não inicie outra revisão. Confira novamente usando a mesma chave; nenhuma repetição automática será feita.')
    }catch{
      setAviso('Não foi possível confirmar o registro. Se houver uma solicitação pendente, mantenha a mesma aba e use a mesma chave.')
    }finally{emCurso.current=false;setOcupado(false)}
  }
  const podeRegistrar=!!pendente||!!caso&&Object.prototype.hasOwnProperty.call(decisoes,decisao)&&
    Object.prototype.hasOwnProperty.call(motivos,motivo)
  return <section className="msg-audit" aria-label="Registro de decisão administrativa">
    <strong>Registrar decisão administrativa</strong>
    <p>O registro é permanente e não comprova entrega, não encerra o caso e não autoriza reenvio.</p>
    {bloqueado&&<p role="alert" className="msg-issues">Armazenamento local indisponível ou divergente. Novos registros bloqueados. Solicite verificação técnica sem apagar a chave pendente.</p>}
    {pendente?<div className="msg-issues" role="status">
      <strong>Solicitação pendente de confirmação</strong>
      <p>Tentativa: {pendente.tentativa_id.slice(0,8)}… · {categorias[pendente.categoria]}</p>
      <p>{decisoes[pendente.decisao]} · {motivos[pendente.motivo]}</p>
      <p>Os parâmetros estão congelados. Mantenha esta aba aberta e confirme manualmente a mesma solicitação. Não crie uma nova revisão em outra aba.</p>
    </div>:<>
      <label className="msg-label">Caso de investigação
        <select className="msg-input" value={selecionado} disabled={ocupado||bloqueado||!casos.length}
          onChange={e=>{setSelecionado(e.target.value);setConfirmado(false);setRecibo(null)}}>
          <option value="">Selecione um caso</option>
          {casos.map(c=><option key={c.tentativa_id} value={c.tentativa_id}>{categorias[c.categoria]} · {c.tentativa_id.slice(0,8)}…</option>)}
        </select>
      </label>
      <div className="msg-fields">
        <label>Decisão<select className="msg-input" value={decisao} disabled={!caso||ocupado||bloqueado}
          onChange={e=>{setDecisao(e.target.value);setConfirmado(false)}}>
          <option value="">Selecione</option>{Object.entries(decisoes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></label>
        <label>Motivo<select className="msg-input" value={motivo} disabled={!caso||ocupado||bloqueado}
          onChange={e=>{setMotivo(e.target.value);setConfirmado(false)}}>
          <option value="">Selecione</option>{Object.entries(motivos).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></label>
      </div>
    </>}
    <label className="msg-audit-confirm"><input type="checkbox" checked={confirmado&&podeRegistrar}
      disabled={!podeRegistrar||ocupado||bloqueado}
      onChange={e=>setConfirmado(e.target.checked)}/>
      {pendente?'Confirmo a consulta da mesma solicitação, sem criar uma nova chave.':'Confirmo o registro permanente desta decisão, sem reenvio.'}
    </label>
    <button type="button" className="msg-primary" disabled={!podeRegistrar||!confirmado||ocupado||bloqueado}
      onClick={()=>void registrar()}>
      {ocupado?'Verificando…':pendente?'Confirmar registro com a mesma chave':'Registrar decisão'}
    </button>
    {aviso&&<p role="alert" className="msg-issues">{aviso}</p>}
    {recibo&&<div role="status" className="msg-save-status">
      <strong>{recibo.status==='ja_registrado'?'Registro anterior confirmado':'Decisão registrada'}</strong>
      <p>Evento: {recibo.evento_id}</p>
      <p>{decisoes[recibo.decisao]} · {motivos[recibo.motivo]}</p>
      <p>{new Date(recibo.registrado_em).toLocaleString('pt-BR')} · Reenvio bloqueado.</p>
      <small>Este é o recibo da operação atual, não o histórico completo.</small>
    </div>}
  </section>
}
