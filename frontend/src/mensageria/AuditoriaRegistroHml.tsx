import {useEffect,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {categorias,decisoes,motivos,registroValido,reciboValido,rejeicaoDefinitiva,
  STORAGE_KEY,JOURNAL_KEY,LOCK_NAME,lerDiario,snapshotCoincide,UUID,
  historicoValido,unirHistorico,indiceValido,historicoPermiteRegistro} from './auditoriaHml'
import type {Caso,Recibo,Diario,Historico,IndiceHistorico} from './auditoriaHml'

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
  const leituraEmCurso=useRef(false)
  const [lendo,setLendo]=useState(false)
  const [alvo,setAlvo]=useState('')
  const [historico,setHistorico]=useState<Historico|null>(null)
  const historicoRef=useRef<Historico|null>(null)
  const [indice,setIndice]=useState<IndiceHistorico|null>(null)
  const [erroHistorico,setErroHistorico]=useState('')
  const [reconhecido,setReconhecido]=useState(false)
  const caso=casos.find(c=>c.tentativa_id+':'+c.categoria===selecionado)

  function mostrarHistorico(h:Historico|null){
    historicoRef.current=h;setHistorico(h);setReconhecido(false);setConfirmado(false)
  }
  function bloquear(mensagem:string){
    bloqueadoRef.current=true;setBloqueado(true);setConfirmado(false);setAviso(mensagem)
  }
  function mostrar(raw:string|null,novo:Diario|null){
    rawRef.current=raw;setRawExibido(raw);setDiario(novo);setConfirmado(false)
    setSelecionado('');setDecisao('');setMotivo('');mostrarHistorico(null)
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

  async function consultarHistorico(mais=false){
    if(emCurso.current||leituraEmCurso.current||!UUID.test(alvo))return
    const anterior=mais?historico:null
    if(mais&&(!anterior||anterior.proxima_antes_versao===null))return
    const antes=anterior?.proxima_antes_versao??null
    leituraEmCurso.current=true;setLendo(true);setErroHistorico('')
    mostrarHistorico(null)
    try{
      const {data,error}=await supabase.functions.invoke<unknown>('mensageria-outbox-hml',{
        body:{acao:'consultar_historico_auditoria_v2',tentativa_id:alvo,limite:10,antes_versao:antes}
      })
      if(error||!historicoValido(data,alvo,10,antes))throw Error('HISTORICO_INVALIDO')
      const unido=anterior?unirHistorico(anterior,data):data
      if(!unido)throw Error('HISTORICO_ALTERADO')
      mostrarHistorico(unido)
    }catch{
      mostrarHistorico(null)
      setErroHistorico('Histórico indisponível ou alterado. Consulte novamente desde o início. Nenhum novo registro foi autorizado.')
    }finally{leituraEmCurso.current=false;setLendo(false)}
  }
  async function consultarIndice(mais=false){
    if(emCurso.current||leituraEmCurso.current)return
    const anterior=mais?indice:null
    if(mais&&(!anterior||anterior.proximo_depois_tentativa===null))return
    const depois=anterior?.proximo_depois_tentativa??null
    leituraEmCurso.current=true;setLendo(true);setErroHistorico('')
    mostrarHistorico(null);setSelecionado('');setAlvo('');setDecisao('');setMotivo('')
    setIndice(null)
    try{
      const {data,error}=await supabase.functions.invoke<unknown>('mensageria-outbox-hml',{
        body:{acao:'listar_historico_auditoria_v2',limite:10,depois_tentativa:depois}
      })
      if(error||!indiceValido(data,10,depois))throw Error('INDICE_INVALIDO')
      const itens=[...(anterior?.itens??[]),...data.itens]
      if(new Set(itens.map(i=>i.tentativa_id.toLowerCase())).size!==itens.length||
        new Set(itens.map(i=>i.head_evento_id.toLowerCase())).size!==itens.length)throw Error('INDICE_INVALIDO')
      setIndice({...data,itens,quantidade:itens.length})
    }catch{setErroHistorico('Não foi possível consultar o índice administrativo. Atualize a lista.')}
    finally{leituraEmCurso.current=false;setLendo(false)}
  }

  async function registrar(){
    if(emCurso.current||leituraEmCurso.current||bloqueadoRef.current||!confirmado)return
    const observado=historico
    if(!pendente&&(!historicoPermiteRegistro(observado,caso)||!reconhecido||historicoRef.current!==observado))return
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
        let versaoEsperada=atual.diario?.estado==='pendente'?atual.diario.versao_esperada:0
        let raw=atual.raw
        if(!p){
          if(!caso||!UUID.test(caso.tentativa_id)||!historicoPermiteRegistro(observado,caso)||
            historicoRef.current!==observado||!reconhecido){
            setAviso('Caso indisponível. Atualize a triagem antes de registrar.');return
          }
          const candidato:unknown={
            acao:'registrar_decisao_auditoria_v2',tentativa_id:caso.tentativa_id,categoria:caso.categoria,
            predecessor_id:observado.head_evento_id,
            decisao,motivo,chave_idempotencia:crypto.randomUUID(),confirmar_registro:true
          }
          if(!registroValido(candidato)){setAviso('Selecione uma decisão e um motivo válidos.');return}
          p=candidato
          versaoEsperada=observado.head_versao+1
          raw=gravar({estado:'pendente',registro:p,versao_esperada:versaoEsperada},raw)
        }
        if(bloqueadoRef.current||lerLocal().raw!==raw)throw Error('DIARIO_DIVERGENTE')
        const {data:resultado,error:falha}=await supabase.functions.invoke<unknown>(
          'mensageria-outbox-hml',{body:p,headers:{Authorization:'Bearer '+data.session.access_token}})
        if(!falha&&reciboValido(resultado,p,versaoEsperada)){
          setRecibo({
            status:resultado.status,evento_id:resultado.evento_id,tentativa_id:resultado.tentativa_id,
            predecessor_id:resultado.predecessor_id,versao:resultado.versao,
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
            setAviso('O caso, categoria ou última revisão mudou. Consulte a triagem e o histórico novamente; nenhuma nova decisão foi criada por esta rejeição.');return
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
  const podeRegistrar=!!pendente||historicoPermiteRegistro(historico,caso)&&reconhecido&&Object.prototype.hasOwnProperty.call(decisoes,decisao)&&
    Object.prototype.hasOwnProperty.call(motivos,motivo)
  return <section className="msg-audit" aria-label="Registro de decisão administrativa">
    <strong>Registrar decisão administrativa</strong>
    <p>O registro é permanente e não comprova entrega, não encerra o caso e não autoriza reenvio.</p>
    {bloqueado&&<p role="alert" className="msg-issues">Armazenamento, coordenação entre abas ou pendência legada indisponível ou divergente. Novos registros bloqueados. Solicite verificação técnica sem apagar os dados locais.</p>}
    <div className="msg-audit-history">
      <strong>Histórico administrativo e reconciliação</strong>
      <p>Localize registros anteriores, inclusive de casos que já saíram da triagem. Um evento parecido não comprova o resultado de uma solicitação cuja chave foi perdida.</p>
      <button className="msg-quiet" type="button" disabled={ocupado||lendo} onClick={()=>void consultarIndice()}>
        {lendo?'Consultando…':'Consultar índice de históricos'}
      </button>
      {indice&&<div>
        {indice.itens.length===0?<p role="status">Nenhuma decisão administrativa registrada.</p>:
          <div className="msg-event-grid">{indice.itens.map(i=><div key={i.tentativa_id}>
            <strong>Tentativa {i.tentativa_id.slice(0,8)}…</strong>
            <small>Última versão: {i.head_versao} · {new Date(i.registrado_em).toLocaleString('pt-BR')}</small>
            <button type="button" className="msg-quiet" disabled={ocupado||lendo}
              onClick={()=>{setAlvo(i.tentativa_id);setSelecionado('');mostrarHistorico(null);setDecisao('');setMotivo('')}}>Selecionar histórico</button>
          </div>)}</div>}
        {indice.proximo_depois_tentativa!==null&&<button type="button" className="msg-quiet" disabled={ocupado||lendo}
          onClick={()=>void consultarIndice(true)}>Carregar mais históricos</button>}
      </div>}
      {pendente&&<button type="button" className="msg-quiet" disabled={ocupado||lendo}
        onClick={()=>{setAlvo(pendente.tentativa_id);mostrarHistorico(null)}}>Selecionar histórico da pendência</button>}
      {alvo&&<div>
        <p>Tentativa selecionada: <strong>{alvo}</strong></p>
        <button type="button" className="msg-quiet" disabled={ocupado||lendo}
          onClick={()=>void consultarHistorico()}>Consultar histórico da tentativa</button>
      </div>}
      {erroHistorico&&<p role="alert" className="msg-issues">{erroHistorico}</p>}
      {historico&&<div className="msg-audit-timeline">
        <p><strong>Última revisão: {historico.head_versao===0?'nenhuma':historico.head_versao}</strong></p>
        <p>Categoria atual: {historico.categoria_atual===null?'Fora da triagem':categorias[historico.categoria_atual]}</p>
        {historico.head_evento_id&&<p>Último evento: {historico.head_evento_id}</p>}
        {historico.eventos.length===0&&<p role="status">Nenhuma decisão nesta tentativa.</p>}
        {historico.eventos.map(e=><div className="msg-audit-event" key={e.evento_id}>
          <strong>Revisão {e.versao} · {decisoes[e.decisao]}</strong>
          <p>{motivos[e.motivo]} · {categorias[e.categoria]}</p>
          <small>{new Date(e.registrado_em).toLocaleString('pt-BR')} · {e.evento_id}</small>
        </div>)}
        {historico.proxima_antes_versao!==null&&<button type="button" className="msg-quiet" disabled={ocupado||lendo}
          onClick={()=>void consultarHistorico(true)}>Carregar revisões anteriores</button>}
        <small>Consulta somente leitura. Não encerra casos nem confirma entrega ou falha.</small>
      </div>}
    </div>
    {pendente?<div className="msg-issues" role="status">
      <strong>Solicitação pendente de confirmação</strong>
      <p>Tentativa: {pendente.tentativa_id.slice(0,8)}… · {categorias[pendente.categoria]}</p>
      <p>{decisoes[pendente.decisao]} · {motivos[pendente.motivo]}</p>
      <p>Predecessor: {pendente.predecessor_id??'Primeira decisão'}. Versão esperada: {diario?.estado==='pendente'?diario.versao_esperada:''}.</p>
      <p>Os parâmetros estão congelados. Confirme manualmente a mesma solicitação. Outras abas desta origem compartilham o diário. Não apague os dados do navegador.</p>
    </div>:<>
      <label className="msg-label">Caso de investigação
        <select className="msg-input" value={selecionado} disabled={ocupado||lendo||bloqueado||!casos.length}
          onChange={e=>{const valor=e.target.value;setSelecionado(valor);setAlvo(valor.split(':')[0]);
            mostrarHistorico(null);setRecibo(null);setDecisao('');setMotivo('')}}>
          <option value="">Selecione um caso</option>
          {casos.map(c=><option key={c.tentativa_id} value={c.tentativa_id+':'+c.categoria}>{categorias[c.categoria]} · {c.tentativa_id.slice(0,8)}…</option>)}
        </select>
      </label>
      {caso&&<p>Antes de registrar, consulte o histórico da tentativa selecionada acima.</p>}
      {historicoPermiteRegistro(historico,caso)&&<label className="msg-audit-confirm">
        <input type="checkbox" checked={reconhecido} disabled={ocupado||lendo||bloqueado}
          onChange={e=>{setReconhecido(e.target.checked);setConfirmado(false)}}/>
        Revisei o histórico apresentado e reconheço a última revisão. Estou iniciando uma nova decisão deliberada, não confirmando uma solicitação de chave perdida.
      </label>}
      <div className="msg-fields">
        <label>Decisão<select className="msg-input" value={decisao} disabled={!historicoPermiteRegistro(historico,caso)||!reconhecido||ocupado||lendo||bloqueado}
          onChange={e=>{setDecisao(e.target.value);setConfirmado(false)}}>
          <option value="">Selecione</option>{Object.entries(decisoes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></label>
        <label>Motivo<select className="msg-input" value={motivo} disabled={!historicoPermiteRegistro(historico,caso)||!reconhecido||ocupado||lendo||bloqueado}
          onChange={e=>{setMotivo(e.target.value);setConfirmado(false)}}>
          <option value="">Selecione</option>{Object.entries(motivos).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></label>
      </div>
    </>}
    <label className="msg-audit-confirm"><input type="checkbox" checked={confirmado&&podeRegistrar}
      disabled={!podeRegistrar||ocupado||lendo||bloqueado}
      onChange={e=>setConfirmado(e.target.checked)}/>
      {pendente?'Confirmo a consulta da mesma solicitação, sem criar uma nova chave.':'Confirmo o registro permanente desta decisão, sem reenvio.'}
    </label>
    <button type="button" className="msg-primary" disabled={!podeRegistrar||!confirmado||ocupado||lendo||bloqueado}
      onClick={()=>void registrar()}>
      {ocupado?'Verificando…':pendente?'Confirmar registro com a mesma chave':'Registrar decisão'}
    </button>
    {aviso&&<p role="alert" className="msg-issues">{aviso}</p>}
    {recibo&&<div role="status" className="msg-save-status">
      <strong>{recibo.status==='ja_registrado'?'Registro anterior confirmado':'Decisão registrada'}</strong>
      <p>Evento: {recibo.evento_id} · Revisão {recibo.versao}</p>
      <p>{decisoes[recibo.decisao]} · {motivos[recibo.motivo]}</p>
      <p>{new Date(recibo.registrado_em).toLocaleString('pt-BR')} · Reenvio bloqueado.</p>
      <small>Este é o recibo da operação atual, não o histórico completo.</small>
    </div>}
  </section>
}
