import { useMemo, useRef, useState } from 'react'
import { eventosMensageria, modelosExemplo, tagsMensageria, type Contexto } from './catalogo'
import { criarModelo, extrairTags, lerRascunhosLocal, previaModelo, validarModelo, type ModeloRascunho } from './motor'
import './MensageriaCentral.css'

const CHAVE = 'kaza-mensageria-hml-rascunhos-v1'
type Aba = 'modelos' | 'automacoes' | 'historico' | 'integracoes'

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
  const [selecionado,setSelecionado] = useState(inicial.id)
  const [filtro,setFiltro] = useState('')
  const [edicao,setEdicao] = useState(estadoInicial)
  const [modificado,setModificado] = useState(false)
  const [mensagem,setMensagem] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const modelos = useMemo(() => [
    ...rascunhos.map(r=>({ ...r,rascunho:true })),
    ...modelosExemplo.map(e=>({...e,rascunho:false})),
  ], [rascunhos])
  const modeloEscolhido = modelos.find(m=>m.id===selecionado)
  const visiveis = modelos.filter(m=>`${m.nome} ${m.contexto} ${m.eventoCodigo}`.toLowerCase().includes(filtro.trim().toLowerCase()))
  const tagsContexto = tagsMensageria.filter(t=>t.contextos.includes(edicao.contexto))
  const problemas = validarModelo(edicao)
  const evento = eventosMensageria.find(e=>e.codigo===edicao.eventoCodigo)
  const preview = previaModelo(edicao.texto)
  const codigosUsados = extrairTags(edicao.texto)

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
    const id = modeloEscolhido?.rascunho ? modeloEscolhido.id : crypto.randomUUID()
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
    if (!modeloEscolhido?.rascunho || !window.confirm('Excluir este rascunho deste navegador?')) return
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
          ['modelos','✏️ Modelos e tags'],['automacoes','⚡ Automações'],
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
            <p className="msg-hint">Modelos de exemplo + seus rascunhos locais</p>
            <div className="msg-models">
              {visiveis.map(m=><button type="button" key={m.id} className={selecionado===m.id?'msg-model selected':'msg-model'}
                onClick={()=>mudarModelo(m.id)}>
                <strong>{m.nome}</strong>
                <small>{nomeContexto(m.contexto)} • {m.rascunho?'Seu rascunho':'Exemplo'}</small>
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
              <span className="msg-pill">Rascunho local</span>
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
              <button type="button" className="msg-primary" onClick={salvar}>Salvar rascunho</button>
              <button type="button" className="msg-quiet" onClick={duplicar}>Duplicar</button>
              {modeloEscolhido?.rascunho && <button type="button" className="msg-danger" onClick={descartar}>Excluir</button>}
              {modificado && <span className="msg-dirty">● Alterações não salvas</span>}
            </div>
            {mensagem && <p role="status" className="msg-save-status">{mensagem}</p>}
            <p className="msg-hint">Os rascunhos ficam somente neste navegador; ainda não são modelos publicados no Supabase nem templates aprovados pela Meta.</p>
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
