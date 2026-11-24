import {useEffect,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {categorias,decisoes,motivos,registroValido,reciboValido,rejeicaoDefinitiva,
  STORAGE_KEY,JOURNAL_KEY,LOCK_NAME,lerDiario,snapshotCoincide,UUID} from './auditoriaHml'
import type {Caso,Registro,Recibo,Diario} from './auditoriaHml'

function lerLocal(){
  // Uma pendência legada não pode ser ignorada ou ganhar outra chave.
  if(sessionStorage.getItem(STORAGE_KEY)!==null)throw Error('PENDENCIA_LEGADA')
  const raw=localStorage.getItem(JOURNAL_KEY)
  return {raw,diario:lerDiario(raw)}
}
function carregar(){
  try{
    if(!globalThis.isSecureContext||!navigator.locks||!globalThis.crypto?.randomUUID)
      throw Error('CONTEXTO_INSEGURO')
    return {...lerLocal(),bloqueado:false}
  }catch{return {raw:null,diario:null,bloqueado:true}}
}

export default function AuditoriaRegistroHml({casos}:{casos:Caso[]}){
  const [inicial]=useState(carregar)
  const [diario,setDiario]=useState<Diario|null>(inicial.diario)
  const [rawExibido,setRawExibido]=useState<string|null>(inicial.raw)
  const rawRef=useRef<string|null>(inicial.raw)
  const [bloqueado,setBloqueado]=useState(inicial.bloqueado)
  const bloqueadoRef=useRef(inicial.bloqueado)
  const pendente=diario?.estado==='pendente'?diario.registro:null
  const [selecionado,setSelecionado]=useState('')
  const [decisao,setDecisao]=useState('')
  const [motivo,setMotivo]=useState('')
  const [confirmado,setConfirmado]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const [aviso,setAviso]=useState('')
  const [recibo,setRecibo]=useState<Recibo|null>(null)
  const emCurso=useRef(false)
  const caso=casos.find(c=>c.tentativa_id+':'+c.categoria===selecionado)

  function bloquear(mensagem:string){
    bloqueadoRef.current=true;setBloqueado(true);setConfirmado(false);setAviso(mensagem)
  }
  function mostrar(raw:string|null,novo:Diario|null){
    rawRef.current=raw;setRawExibido(raw);setDiario(novo);setConfirmado(false)
    setSelecionado('');setDecisao('');setMotivo('')
  }
  function sincronizar(){
    if(bloqueadoRef.current)return
    try{
      const atual=lerLocal()
      if(snapshotCoincide(rawRef.current,atual.raw))return
      const anterior=lerDiario(rawRef.current)
      // Exclusão inesperada ou substituição de uma pendência observada exige
      // reconciliação técnica; jamais interpretar como autorização de nova chave.
      if((anterior&&atual.raw===null)||
        anterior?.estado==='pendente'&&
        (atual.diario?.estado!=='resolvido'||atual.diario.chave_idempotencia!==anterior.registro.chave_idempotencia)){
        bloquear('Diário local alterado inesperadamente. Não inicie outra revisão.');return
      }
      mostrar(atual.raw,atual.diario);setRecibo(null)
      setAviso('A solicitação mudou em outra aba. Revise o estado e confirme novamente.')
    }catch{bloquear('Não foi possível verificar o diário local.')}
  }
  useEffect(()=>{
    const storage=(e:StorageEvent)=>{
      if(e.key===JOURNAL_KEY||e.key===null)sincronizar()
    }
    const visibilidade=()=>{if(document.visibilityState==='visible')sincronizar()}
    window.addEventListener('storage',storage)
    window.addEventListener('focus',sincronizar)
    document.addEventListener('visibilitychange',visibilidade)
    sincronizar()
    return ()=>{
      window.removeEventListener('storage',storage)
      window.removeEventListener('focus',sincronizar)
      document.removeEventListener('visibilitychange',visibilidade)
    }
  },[])
  function gravar(novo:Diario,esperado:string|null){
    if(!snapshotCoincide(lerLocal().raw,esperado))throw Error('DIARIO_DIVERGENTE')
    const raw=JSON.stringify(novo)
    localStorage.setItem(JOURNAL_KEY,raw)
    if(lerLocal().raw!==raw)throw Error('DIARIO_NAO_PERSISTIDO')
    mostrar(raw,novo)
    return raw
  }

  async function registrar(){
    if(emCurso.current||bloqueadoRef.current||!confirmado)return
    // Captura a revisão EXIBIDA, antes de qualquer await.
    const esperado=rawExibido
    emCurso.current=true;setOcupado(true);setConfirmado(false);setAviso('');setRecibo(null)
    try{
      await navigator.locks.request(LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock){setAviso('Outra aba está verificando um registro. Aguarde o resultado e confirme manualmente.');return}
        if(bloqueadoRef.current)return
        let atual=lerLocal()
        if(!snapshotCoincide(esperado,atual.raw)){
          sincronizar();setAviso('O estado mudou em outra aba. Revise e confirme novamente.');return
        }
        const {data,error}=await supabase.auth.getSession()
        if(error||!data.session){setAviso('Sessão indisponível. Entre novamente antes de continuar.');return}
        atual=lerLocal()
        if(bloqueadoRef.current||!snapshotCoincide(esperado,atual.raw)){
          sincronizar();return
        }
        let p=atual.diario?.estado==='pendente'?atual.diario.registro:null
        let raw=atual.raw
        if(!p){
          if(!caso||!UUID.test(caso.tentativa_id)){
            setAviso('Caso indisponível. Atualize a triagem antes de registrar.');return
          }
          const candidato:unknown={
            acao:'registrar_decisao_auditoria',tentativa_id:caso.tentativa_id,categoria:caso.categoria,
            decisao,motivo,chave_idempotencia:crypto.randomUUID(),confirmar_registro:true
          }
          if(!registroValido(candidato)){setAviso('Selecione uma decisão e um motivo válidos.');return}
          p=candidato
          raw=gravar({estado:'pendente',registro:p},raw)
        }
        if(bloqueadoRef.current||lerLocal().raw!==raw)throw Error('DIARIO_DIVERGENTE')
        const {data:resultado,error:falha}=await supabase.functions.invoke<unknown>(
          'mensageria-outbox-hml',{body:p,headers:{Authorization:'Bearer '+data.session.access_token}})
        if(!falha&&reciboValido(resultado,p)){
          setRecibo({
            status:resultado.status,evento_id:resultado.evento_id,tentativa_id:resultado.tentativa_id,
            categoria:resultado.categoria,decisao:resultado.decisao,motivo:resultado.motivo,
            registrado_em:resultado.registrado_em,reenvio_automatico_autorizado:false
          })
          // Mantém marcador terminal para rejeitar confirmações obsoletas
          // que tenham sido preparadas antes da operação em outra aba.
          if(bloqueadoRef.current)throw Error('DIARIO_DIVERGENTE')
          gravar({estado:'resolvido',chave_idempotencia:p.chave_idempotencia},raw);return
        }
        const contexto=(falha as {context?:unknown}|null)?.context
        if(contexto instanceof Response&&contexto.status===409){
          const corpo:unknown=await contexto.clone().json().catch(()=>null)
          if(rejeicaoDefinitiva(contexto.status,corpo)){
            if(bloqueadoRef.current)throw Error('DIARIO_DIVERGENTE')
            gravar({estado:'resolvido',chave_idempotencia:p.chave_idempotencia},raw)
            setAviso('O caso ou a categoria mudou. Atualize a triagem antes de iniciar outra revisão.');return
          }
        }
        setAviso('Registro não confirmado. Confirme manualmente a mesma solicitação; nenhuma repetição automática será feita.')
      })
    }catch{
      // Em falha de armazenamento ou de coordenação, não iniciar outra chave.
      // O diário pendente, se gravado, deve permanecer intacto.
      try{
        if(lerLocal().raw!==rawRef.current)throw Error('DIARIO_DIVERGENTE')
        if(lerDiario(rawRef.current)?.estado==='pendente'){
          setAviso('Registro não confirmado. Preserve o diário e confirme manualmente a mesma chave.');return
        }
      }catch{}
      bloquear('Não foi possível garantir a integridade do diário. Novas solicitações bloqueadas.')
    }finally{emCurso.current=false;setOcupado(false)}
  }
  const podeRegistrar=!!pendente||!!caso&&Object.prototype.hasOwnProperty.call(decisoes,decisao)&&
    Object.prototype.hasOwnProperty.call(motivos,motivo)
  return <section className="msg-audit" aria-label="Registro de decisão administrativa">
    <strong>Registrar decisão administrativa</strong>
    <p>O registro é permanente e não comprova entrega, não encerra o caso e não autoriza reenvio.</p>
    {bloqueado&&<p role="alert" className="msg-issues">Armazenamento, coordenação entre abas ou pendência legada indisponível ou divergente. Novos registros bloqueados. Solicite verificação técnica sem apagar os dados locais.</p>}
    {pendente?<div className="msg-issues" role="status">
      <strong>Solicitação pendente de confirmação</strong>
      <p>Tentativa: {pendente.tentativa_id.slice(0,8)}… · {categorias[pendente.categoria]}</p>
      <p>{decisoes[pendente.decisao]} · {motivos[pendente.motivo]}</p>
      <p>Os parâmetros estão congelados. Confirme manualmente a mesma solicitação. Outras abas desta origem compartilham o diário. Não apague os dados do navegador.</p>
    </div>:<>
      <label className="msg-label">Caso de investigação
        <select className="msg-input" value={selecionado} disabled={ocupado||bloqueado||!casos.length}
          onChange={e=>{setSelecionado(e.target.value);setConfirmado(false);setRecibo(null)}}>
          <option value="">Selecione um caso</option>
          {casos.map(c=><option key={c.tentativa_id} value={c.tentativa_id+':'+c.categoria}>{categorias[c.categoria]} · {c.tentativa_id.slice(0,8)}…</option>)}
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
