import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WHATSAPP_HML_HABILITADO } from '../whatsappHml/configuracao'

type Diagnostico = {
  ambiente: 'homologacao'
  convites_ativos: number
  convites_confirmados: number
  convites_expirados: number
  cliques_processados: number
  remarcacoes_pendentes: number
  respostas_aguardando: number
  respostas_prontas: number
  respostas_reservadas: number
  respostas_aceitas_meta: number
  respostas_recusadas_meta: number
  respostas_indeterminadas: number
  templates_meta_cadastrados: number
  agendamentos_hml: number
  processamento_habilitado: boolean
  envio_automatico_habilitado: boolean
}
const cards: {campo:keyof Diagnostico;titulo:string;descricao:string}[] = [
  {campo:'agendamentos_hml',titulo:'Agendamentos na HML',descricao:'Atendimentos de homologação'},
  {campo:'convites_ativos',titulo:'Convites aguardando',descricao:'Botões ainda válidos e sem resposta'},
  {campo:'convites_confirmados',titulo:'Confirmados',descricao:'Confirmações persistidas na agenda'},
  {campo:'remarcacoes_pendentes',titulo:'Pedidos de remarcação',descricao:'Horários ainda não alterados'},
  {campo:'cliques_processados',titulo:'Cliques processados',descricao:'Registros auditáveis, sem duplicação'},
  {campo:'respostas_aguardando',titulo:'Respostas na fila',descricao:'Agradecimentos/orientações ainda não enviados'},
  {campo:'respostas_prontas',titulo:'Respostas prontas',descricao:'Modelo publicado e reserva ainda não iniciada'},
  {campo:'respostas_reservadas',titulo:'Envios reservados',descricao:'Tentativa única em andamento; não reenviar'},
  {campo:'respostas_aceitas_meta',titulo:'Aceitas pela Meta',descricao:'API aceitou; entrega não comprovada'},
  {campo:'respostas_recusadas_meta',titulo:'Recusas da Meta',descricao:'Necessitam investigação antes de nova ação'},
  {campo:'respostas_indeterminadas',titulo:'Envios indeterminados',descricao:'Não reenviar sem reconciliação segura'},
  {campo:'templates_meta_cadastrados',titulo:'Templates cadastrados',descricao:'Ainda dependem de aprovação/ligação com a Meta'},
  {campo:'convites_expirados',titulo:'Convites expirados',descricao:'Não podem alterar agendamentos'},
]

export default function MensageriaConfirmacoesHml() {
  const [dados,setDados]=useState<Diagnostico|null>(null)
  const [carregando,setCarregando]=useState(false)
  const [erro,setErro]=useState('')
  const [simulandoFila,setSimulandoFila]=useState(false)
  const [resultadoFila,setResultadoFila]=useState<string|null>(null)

  async function simularFila(){
    if(!WHATSAPP_HML_HABILITADO||simulandoFila)return
    setSimulandoFila(true);setResultadoFila(null)
    try {
      const {data,error}=await supabase.functions.invoke<{
        status:string;elegiveis:number;enviados:number;reservados:number;
        envio_automatico_habilitado:boolean
      }>('mensageria-outbox-hml',{body:{acao:'simular_lote',limite:5}})
      if(error||data?.status!=='simulacao_somente_leitura'||
          typeof data.elegiveis!=='number'||!Number.isSafeInteger(data.elegiveis)||
          data.elegiveis<0||data.enviados!==0||data.reservados!==0||
          data.envio_automatico_habilitado!==false)
        throw Error('SIMULACAO_FALHOU')
      setResultadoFila(data.elegiveis===0
        ? 'Nenhum agradecimento elegível. A fila permanece intacta; nada foi enviado.'
        : data.elegiveis+' agradecimento(s) elegível(is). Nenhum foi reservado ou enviado.')
    } catch {
      setResultadoFila('Simulação indisponível. Não houve envio nem alteração da fila.')
    } finally {setSimulandoFila(false)}
  }
  async function atualizar(){
    if(!WHATSAPP_HML_HABILITADO)return
    setCarregando(true);setErro('')
    try{
      const {data,error}=await supabase.functions.invoke<Diagnostico>(
        'mensageria-confirmacao-hml',{body:{acao:'diagnostico'}})
      if(error||!data||data.ambiente!=='homologacao'||
         typeof data.convites_ativos!=='number'||
         typeof data.respostas_indeterminadas!=='number'||
         typeof data.envio_automatico_habilitado!=='boolean')
        throw Error('DIAGNOSTICO_INDISPONIVEL')
      setDados(data)
    }catch {
      setDados(null)
      setErro('Não foi possível consultar as confirmações da homologação. Nenhum envio foi realizado.')
    }finally {setCarregando(false)}
  }
  useEffect(()=>{
    if(WHATSAPP_HML_HABILITADO)void atualizar()
  },[])

  if(!WHATSAPP_HML_HABILITADO)return <section className="msg-coming">
    <h2>Confirmações pelo WhatsApp</h2>
    <p>O painel de teste estará disponível apenas na homologação autorizada.</p>
  </section>
  return <section className="msg-coming" style={{textAlign:'left'}}>
    <div className="msg-panel-heading">
      <div>
        <h2>Confirmações pelo WhatsApp</h2>
        <p>Diagnóstico seguro do fluxo de botões e agendamentos no Supabase HML.</p>
      </div>
      <button className="msg-quiet" type="button" onClick={()=>void atualizar()}
        disabled={carregando}>{carregando?'Consultando…':'↻ Atualizar'}</button>
    </div>
    {erro&&<p role="alert" className="msg-issues">{erro}</p>}
    {!dados&&!erro&&<p role="status" className="msg-hint">Consultando dados da homologação…</p>}
    {dados&&<>
      <div className="msg-info">
        <strong>Consumidor de agradecimentos · simulação sem envio</strong>
        <p>Consulta somente leitura de até cinco agradecimentos elegíveis. Não reserva mensagens,
          não publica modelos e não chama a Meta.</p>
        <button type="button" className="msg-quiet" onClick={()=>void simularFila()}
          disabled={simulandoFila}>
          {simulandoFila?'Simulando…':'Simular fila (sem enviar)'}
        </button>
        {resultadoFila&&<p role="status">{resultadoFila}</p>}
      </div>
      <div className="msg-info">
        <strong>Estado de segurança</strong>
        <p>Processamento de cliques: <strong>{dados.processamento_habilitado?'Habilitado para teste controlado':'Bloqueado'}</strong></p>
        <p>Envio automático de agradecimentos: <strong>{dados.envio_automatico_habilitado?'Habilitado':'Bloqueado'}</strong></p>
        <p>Não há botões para enviar mensagens neste painel. Os dados são agregados, sem telefones ou nomes de clientes.</p>
      </div>
      <div className="msg-event-grid">
        {cards.map(c=><div key={c.campo}>
          <strong>{c.titulo}</strong>
          <span style={{fontSize:26,color:'#24573a'}}>{String(dados[c.campo])}</span>
          <small>{c.descricao}</small>
        </div>)}
      </div>
    </>}
    <p className="msg-hint">O funcionamento real dos botões requer template Meta aprovado, convite vinculado a um agendamento,
      callback com assinatura válida e processamento liberado em uma janela de homologação.
      O portal de remarcação permanece para etapa futura.</p>
  </section>
}
