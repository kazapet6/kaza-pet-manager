import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WHATSAPP_HML_HABILITADO } from '../whatsappHml/configuracao'
import { eventosMensageria, modelosExemplo, tagsMensageria, type Contexto } from './catalogo'
import { criarModelo, extrairTags, lerRascunhosLocal, previaModelo, validarModelo, type ModeloRascunho } from './motor'
import './MensageriaCentral.css'
import MensageriaConfirmacoesHml from './MensageriaConfirmacoesHml'

const CHAVE = 'kaza-mensageria-hml-rascunhos-v1'
type Aba = 'modelos' | 'confirmacoes' | 'automacoes' | 'historico' | 'integracoes'
type RascunhoHml = ModeloRascunho & { versao: number }
type RespostaApiHml = {
  status?: string
  codigo?: string
  rascunho?: RascunhoHml
  rascunhos?: RascunhoHml[]
  excluido?: boolean
}

function carregarLocal(): ModeloRascunho[] {
  try { return lerRascunhosLocal(window.localStorage.getItem(CHAVE)) }
  catch { return [] }
}
function escreverLocal(lista: ModeloRascunho[]): boolean {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista))
    return true
  } catch { return false }
}
function nomeContexto(contexto: Contexto) {
  return ({
    agenda:'Agenda', atendimento:'Atendimento', pacotes:'Pacotes',
    contrato:'Contratos e planos', financeiro:'Financeiro',
  })[contexto]
}
const inicial = modelosExemplo[0]
const estadoInicial = {nome:inicial.nome,eventoCodigo:inicial.eventoCodigo,contexto:inicial.contexto,texto:inicial.texto}

export default function MensageriaCentral() {
  const [aba,setAba] = useState<Aba>('modelos')
  const [rascunhos,setRascunhos] = useState<ModeloRascunho[]>(carregarLocal)
  const [rascunhosHml,setRascunhosHml] = useState<RascunhoHml[]>([])
  const [carregandoHml,setCarregandoHml] = useState(false)
  const [salvandoHml,setSalvandoHml] = useState(false)
  const [erroHml,setErroHml] = useState('')
  const [selecionado,setSelecionado] = useState(inicial.id)
  const [filtro,setFiltro] = useState('')
  const [edicao,setEdicao] = useState(estadoInicial)
  const [modificado,setModificado] = useState(false)
  const [mensagem,setMensagem] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const modelos = useMemo(() => [
    ...rascunhosHml.map(r=>({...r,rascunho:true,origem:'hml' as const})),
    ...rascunhos.map(r=>({...r,rascunho:true,origem:'local' as const})),
    ...modelosExemplo.map(e=>({...e,rascunho:false,origem:'exemplo' as const})),
  ], [rascunhos,rascunhosHml])
  const modeloEscolhido = modelos.find(m=>m.id===selecionado)
  const visiveis = modelos.filter(m=>`${m.nome} ${m.contexto} ${m.eventoCodigo}`.toLowerCase().includes(filtro.trim().toLowerCase()))
  const tagsContexto = tagsMensageria.filter(t=>t.contextos.includes(edicao.contexto))
  const problemas = validarModelo(edicao)
  const evento = eventosMensageria.find(e=>e.codigo===edicao.eventoCodigo)
  const preview = previaModelo(edicao.texto)
  const codigosUsados = extrairTags(edicao.texto)

  async function carregarHml() {
    if(!WHATSAPP_HML_HABILITADO)return
    setCarregandoHml(true);setErroHml('')
    try {
      const {data,error}=await supabase.functions.invoke<RespostaApiHml>(
        'mensageria-editor-hml',{body:{acao:'listar'}})
      if(error||!Array.isArray(data?.rascunhos))throw new Error('CONSULTA_INDISPONIVEL')
      const itens=data.rascunhos.filter(r=>
        typeof r.id==='string' && typeof r.versao==='number' &&
        typeof r.nome==='string' && typeof r.texto==='string')
      setRascunhosHml(itens)
    }catch {
      setErroHml('Não foi possível consultar os rascunhos HML. Seus rascunhos locais continuam disponíveis.')
    }finally {setCarregandoHml(false)}
  }
  useEffect(()=>{
    if(WHATSAPP_HML_HABILITADO)void carregarHml()
    // Busca uma vez ao abrir a Central; sincronização manual pelo botão Atualizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  async function salvarHml() {
    if(!WHATSAPP_HML_HABILITADO || salvandoHml)return
    if(!edicao.nome.trim()||!edicao.texto.trim()||edicao.texto.length>4096){
      setMensagem('Preencha nome e texto antes de salvar na homologação.');return
    }
    const atual=modeloEscolhido?.origem==='hml'?modeloEscolhido:null
    const id=atual?.id??crypto.randomUUID()
    const versaoEsperada=atual?.versao??0
    setSalvandoHml(true);setMensagem('')
    try{
      const {data,error}=await supabase.functions.invoke<RespostaApiHml>(
        'mensageria-editor-hml',{body:{
          acao:'salvar', id,versaoEsperada,chaveIdempotencia:crypto.randomUUID(),
          nome:edicao.nome,eventoCodigo:edicao.eventoCodigo,
          contexto:edicao.contexto,texto:edicao.texto
        }})
      if(error||data?.status!=='salvo'||!data?.rascunho){
        setMensagem('Não foi possível salvar no Supabase HML. Se outra aba alterou este modelo, atualize a lista antes de editar novamente.')
        return
      }
      const novo=data.rascunho
      setRascunhosHml(lista=>[novo,...lista.filter(r=>r.id!==novo.id)])
      setSelecionado(novo.id)
      setModificado(false)
      setMensagem(problemas.length
        ? 'Versão '+novo.versao+' salva na HML com pendências de publicação. Nenhuma mensagem enviada.'
        : 'Versão '+novo.versao+' salva na HML. Nenhum disparo foi habilitado.')
    }catch{setMensagem('Falha ao salvar na HML. Não repita sem verificar a lista.')}
    finally{setSalvandoHml(false)}
  }

  async function excluirHml() {
    if(!WHATSAPP_HML_HABILITADO||salvandoHml||
      modeloEscolhido?.origem!=='hml'||!window.confirm('Arquivar este rascunho da homologação?'))return
    const atual=modeloEscolhido
    setSalvandoHml(true);setMensagem('')
    try{
      const {data,error}=await supabase.functions.invoke<RespostaApiHml>(
        'mensageria-editor-hml',{body:{
          acao:'excluir', id:atual.id,versaoEsperada:atual.versao,
          chaveIdempotencia:crypto.randomUUID()
        }})
      if(error||data?.status!=='salvo'||!data.excluido){
        setMensagem('Exclusão não confirmada. Recarregue a listagem antes de tentar novamente.')
        return
      }
      setRascunhosHml(lista=>lista.filter(r=>r.id!==atual.id))
      setSelecionado(inicial.id);setEdicao(estadoInicial);setModificado(false)
      setMensagem('Rascunho arquivado na HML. Versões preservadas na auditoria.')
    }catch{setMensagem('Resultado incerto ao arquivar. Verifique a listagem.')}
    finally{setSalvandoHml(false)}
  }

  function mudarModelo(id: string) {
    if (modificado && !window.confirm('Há alterações não salvas. Deseja descartá-las?')) return
    const m=modelos.find(x=>x.id===id)
    if (!m)return
    setSelecionado(id)
    setEdicao({nome:m.nome,eventoCodigo:m.eventoCodigo,contexto:m.contexto,texto:m.texto})
    setModificado(false);setMensagem('')
  }
  function alterar<K extends keyof typeof edicao>(campo: K,valor: (typeof edicao)[K]) {
    setEdicao(a=>({...a,[campo]:valor}))
    setModificado(true);setMensagem('')
  }
  function escolherEvento(codigo: string) {
    const ev=eventosMensageria.find(e=>e.codigo===codigo)
    if (!ev)return
    setEdicao(a=>({...a,eventoCodigo:ev.codigo,contexto:ev.contexto}))
    setModificado(true);setMensagem('')
  }
  function novoModelo() {
    if(modificado && !window.confirm('Descartar alterações não salvas?'))return
    const id=crypto.randomUUID()
    setSelecionado(id)
    setEdicao({nome:'Novo modelo',eventoCodigo:'CONFIRMACAO_AGENDAMENTO',contexto:'agenda',texto:''})
    setModificado(true);setMensagem('Novo modelo. Ele será armazenado apenas neste navegador ao salvar.')
  }
  function inserirTag(codigo: string) {
    const el=textarea.current
    const inicio=el?.selectionStart ?? edicao.texto.length
    const fim=el?.selectionEnd ?? edicao.texto.length
    const trecho=`{{${codigo}}}`
    setEdicao(v=>({...v,texto:v.texto.slice(0,inicio)+trecho+v.texto.slice(fim)}))
    setModificado(true);setMensagem('')
    requestAnimationFrame(()=>{
      el?.focus()
      el?.setSelectionRange(inicio+trecho.length,inicio+trecho.length)
    })
  }
  function salvar() {
    if (!edicao.nome.trim() || !edicao.texto.trim() || edicao.texto.length>4096) {
      setMensagem('Informe nome e texto (até 4.096 caracteres) antes de salvar.');return
    }
    const id = modeloEscolhido?.origem==='local' ? modeloEscolhido.id : crypto.randomUUID()
    const modelo = criarModelo({
      nome:edicao.nome.trim(),eventoCodigo:edicao.eventoCodigo,
      contexto:edicao.contexto,texto:edicao.texto,
    },id,new Date().toISOString())
    const next = [modelo,...rascunhos.filter(r=>r.id!==id)]
    if(!escreverLocal(next)) {setMensagem('Não foi possível salvar no navegador. Verifique armazenamento/permissões.');return}
    setRascunhos(next);setSelecionado(id);setModificado(false)
    setMensagem(problemas.length
      ? 'Rascunho local salvo com pendências. Nenhum disparo foi habilitado.'
      : 'Rascunho local salvo. Para publicar, será necessária integração segura ao banco.')
  }
  function descartar() {
    if (modeloEscolhido?.origem!=='local' || !window.confirm('Excluir este rascunho deste navegador?')) return
    const next=rascunhos.filter(r=>r.id!==modeloEscolhido.id)
    if(!escreverLocal(next)){setMensagem('Não foi possível excluir o rascunho.');return}
    setRascunhos(next)
    mudarModeloForcado(inicial.id,next)
  }
  function mudarModeloForcado(id:string,lista:ModeloRascunho[]) {
    const m=lista.find(x=>x.id===id) ?? modelosExemplo.find(x=>x.id===id) ?? modelosExemplo[0]
    setSelecionado(m.id)
    setEdicao({nome:m.nome,eventoCodigo:m.eventoCodigo,contexto:m.contexto,texto:m.texto})
    setModificado(false);setMensagem('')
  }
  function duplicar() {
    const novo=criarModelo({...edicao,nome:edicao.nome+' (cópia)'},crypto.randomUUID(),new Date().toISOString())
    const next=[novo,...rascunhos]
    if(!escreverLocal(next)){setMensagem('Não foi possível salvar a cópia.');return}
    setRascunhos(next);mudarModeloForcado(novo.id,next)
    setMensagem('Cópia local criada. Revise antes de utilizar.')
  }
  function abrirAba(nova:Aba) {
    setAba(nova)
  }

  return (
    <div className="msg-central">
      <div className="msg-head">
        <div>
          <div className="msg-eyebrow">KAZA PET MANAGER / CENTRAL DE MENSAGERIA</div>
          <h1>Mensageria <span>🐾</span></h1>
          <p>Crie mensagens, organize eventos e prepare confirmações pelo WhatsApp.</p>
        </div>
        <div className="msg-head-status">🔒 Homologação • sem envios automáticos</div>
      </div>
      <nav className="msg-tabs" aria-label="Seções da mensageria">
        {([
          ['modelos','✏️ Modelos e tags'],['confirmacoes','✅ Confirmações'],['automacoes','⚡ Automações'],
          ['historico','🕘 Histórico'],['integracoes','🔌 Integrações'],
        ] as const).map(([id,titulo])=><button type="button" key={id}
          aria-current={aba===id?'page':undefined} className={aba===id?'ativo':''}
          onClick={()=>abrirAba(id)}>{titulo}</button>)}
      </nav>
      {aba==='modelos' ? (
        <div className="msg-workspace">
          <aside className="msg-sidebar">
            <div className="msg-side-head">
              <strong>Biblioteca de mensagens</strong>
              <button type="button" className="msg-new" onClick={novoModelo}>+ Criar modelo</button>
            </div>
            <input aria-label="Buscar modelos" className="msg-input" placeholder="Buscar modelo ou evento…"
              value={filtro} onChange={e=>setFiltro(e.target.value)}/>
            <p className="msg-hint">Exemplos, rascunhos HML e rascunhos deste navegador</p>
            {WHATSAPP_HML_HABILITADO && <button type="button" className="msg-quiet"
              disabled={carregandoHml} onClick={()=>void carregarHml()}>
              {carregandoHml?'Carregando…':'↻ Atualizar modelos HML'}
            </button>}
            {erroHml&&<p role="alert" className="msg-issues">{erroHml}</p>}
            <div className="msg-models">
              {visiveis.map(m=><button type="button" key={m.id} className={selecionado===m.id?'msg-model selected':'msg-model'}
                onClick={()=>mudarModelo(m.id)}>
                <strong>{m.nome}</strong>
                <small>{nomeContexto(m.contexto)} • {
                  m.origem==='hml'?'HML · versão '+m.versao:
                  m.origem==='local'?'Rascunho local':'Exemplo'
                }</small>
              </button>)}
              {visiveis.length===0 && <p className="msg-hint">Nenhum modelo encontrado.</p>}
            </div>
          </aside>
          <section className="msg-editor">
            <div className="msg-panel-heading">
              <div>
                <h2>Editor de mensagens</h2>
                <p>Personalize o texto e insira tags sem digitar códigos.</p>
              </div>
              <span className="msg-pill">{modeloEscolhido?.origem==='hml'
                ? 'HML · versão '+modeloEscolhido.versao : 'Editor de rascunhos'}</span>
            </div>
            <div className="msg-fields">
              <label>Nome do modelo
                <input className="msg-input" value={edicao.nome} maxLength={160} onChange={e=>alterar('nome',e.target.value)}/>
              </label>
              <label>Evento
                <select className="msg-input" value={edicao.eventoCodigo} onChange={e=>escolherEvento(e.target.value)}>
                  {eventosMensageria.map(e=><option key={e.codigo} value={e.codigo}>{e.nome}</option>)}
                </select>
              </label>
            </div>
            <p className="msg-hint"><strong>Contexto:</strong> {nomeContexto(edicao.contexto)} · {evento?.descricao ?? 'Evento não cadastrado.'}</p>
            <label htmlFor="msg-texto" className="msg-label">Conteúdo da mensagem</label>
            <textarea id="msg-texto" className="msg-textarea" ref={textarea} rows={8} value={edicao.texto}
              maxLength={4096} placeholder="Escreva a mensagem e use as tags abaixo…" onChange={e=>alterar('texto',e.target.value)}/>
            <div className="msg-count">{edicao.texto.length}/4096 caracteres</div>
            <div className="msg-tag-head">
              <strong>Tags disponíveis para {nomeContexto(edicao.contexto)}</strong>
              <small>Clique para inserir no cursor</small>
            </div>
            <div className="msg-tags">
              {tagsContexto.map(t=><button type="button" key={t.codigo}
                title={t.disponivel?`Exemplo: ${t.exemplo}`:'Aguardando integração com os dados'}
                className={'msg-tag'+(t.disponivel?'':' futura')} onClick={()=>inserirTag(t.codigo)}>
                {t.disponivel?'＋':'◷'} {t.label}</button>)}
            </div>
            <p className="msg-hint">◷ Tags futuras podem entrar nos rascunhos, mas impedem publicação até terem uma fonte de dados confiável.</p>
            {problemas.length>0 && <div className="msg-issues" aria-label="Pendências de validação">
              <strong>{problemas.length} {problemas.length===1?'pendência':'pendências'} para publicação</strong>
              <ul>{problemas.map((p,i)=><li key={p.codigo+i}>{p.mensagem}</li>)}</ul>
            </div>}
            <div className="msg-controls">
              {WHATSAPP_HML_HABILITADO && <button type="button" className="msg-primary"
                disabled={salvandoHml||carregandoHml} onClick={()=>void salvarHml()}>
                {salvandoHml?'Salvando…':modeloEscolhido?.origem==='local'?'Copiar para Supabase HML':'Salvar no Supabase HML'}
              </button>}
              <button type="button" className="msg-quiet" onClick={salvar}>Salvar neste navegador</button>
              <button type="button" className="msg-quiet" onClick={duplicar}>Duplicar localmente</button>
              {modeloEscolhido?.origem==='local' && <button type="button" className="msg-danger" onClick={descartar}>Excluir local</button>}
              {modeloEscolhido?.origem==='hml' && <button type="button" className="msg-danger"
                disabled={salvandoHml} onClick={()=>void excluirHml()}>Arquivar na HML</button>}
              {modificado && <span className="msg-dirty">● Alterações não salvas</span>}
            </div>
            {mensagem && <p role="status" className="msg-save-status">{mensagem}</p>}
            <p className="msg-hint">O botão de salvar na HML mantém versões no banco isolado. Rascunhos locais permanecem no navegador até você copiá-los explicitamente. Nenhum deles é publicado ou aprovado pela Meta.</p>
          </section>
          <aside className="msg-preview">
            <div className="msg-panel-heading">
              <div><h2>Prévia WhatsApp</h2><p>Dados fictícios, nunca dados de clientes reais</p></div>
            </div>
            <div className="msg-phone">
              <div className="msg-phone-top">🐾 KAZA PET <span>online</span></div>
              <div className="msg-bubble">{preview || <span className="msg-placeholder">Escreva para visualizar a mensagem.</span>}</div>
              {edicao.eventoCodigo==='CONFIRMACAO_AGENDAMENTO' && (
                <div className="msg-buttons">
                  <span>✓ Confirmar</span><span>↻ Remarcar</span>
                  <small>Botões ilustrativos — aguardam template Meta e integração ao webhook.</small>
                </div>
              )}
            </div>
            <div className="msg-used-tags">
              <strong>Tags utilizadas ({codigosUsados.length})</strong>
              {codigosUsados.length
                ? <ul>{codigosUsados.map(tag=><li key={tag}>{tag}</li>)}</ul>
                : <p className="msg-hint">Nenhuma tag inserida.</p>}
            </div>
            <div className="msg-info">
              <strong>Envio e automação</strong>
              <p>Desativados. Salvar rascunho não envia WhatsApp, não cria templates na Meta e não altera a agenda.</p>
            </div>
          </aside>
        </div>
      ) : aba==='confirmacoes' ? (
        <MensageriaConfirmacoesHml />
      ) : (
        <section className="msg-coming">
          <div className="msg-coming-icon">{aba==='automacoes'?'⚡':aba==='historico'?'🕘':'🔌'}</div>
          <h2>{aba==='automacoes'?'Regras e automações':aba==='historico'?'Histórico de mensagens':'Configurações e integrações'}</h2>
          {aba==='automacoes' ? <>
            <p>Os gatilhos de agendamento, confirmação, consumo de pacotes e planos serão conectados aos eventos reais do sistema.</p>
            <div className="msg-event-grid">{eventosMensageria.map(e=><div key={e.codigo}>
              <strong>{e.nome}</strong><small>{e.descricao}</small><span>Desativado</span>
            </div>)}</div>
          </> : aba==='historico'
            ? <p>O próximo marco exibirá entregas, leituras, confirmações, erros e o vínculo com os agendamentos. Nenhuma mensagem é enviada por este editor.</p>
            : <p>A conexão Meta e os templates aprovados ficarão aqui. Credenciais nunca serão apresentadas nem armazenadas no navegador.</p>}
        </section>
      )}
    </div>
  )
}
