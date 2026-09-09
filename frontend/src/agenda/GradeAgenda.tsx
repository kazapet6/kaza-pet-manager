import { useContext, useMemo, useState } from 'react'
import { AgendaContext } from '../context/AgendaContext.tsx'
import type { AgendaDiariaAtendimento, AgendaDiariaResultado } from '../types/AgendaDiaria.ts'
import { diasDoCalendario, deslocarMes } from './novoAgendamento.ts'
import { densidadeSegmento, ESCALA_GRADE, montarGrade, horario, possuiPacote, type ContextoGrade, type Expediente, type Segmento } from './gradeTemporal.ts'
import { rotuloStatusAtendimento } from '../statusAtendimento/politica.ts'
import { obterAcaoRapidaAtendimento } from './acaoRapidaAtendimento.ts'
import IconeAgenda from './IconeAgenda.tsx'

type Props = { agenda: AgendaDiariaResultado; blocos: Expediente[]; agora: Date; mudarData: (data: string) => void; hoje: () => void; abrir: (a: AgendaDiariaAtendimento) => void; novo: (contexto?: ContextoGrade) => void; acao: (a: AgendaDiariaAtendimento) => void; atualizandoId: string | null }
export default function GradeAgenda({agenda, blocos, agora, mudarData, hoje, abrir, novo, acao, atualizandoId}: Props) {
  const estrutura = useContext(AgendaContext)
  const grade = useMemo(() => montarGrade(agenda, estrutura, blocos), [agenda, estrutura, blocos])
  const [mes, setMes] = useState(agenda.dataOperacional.slice(0,7))
  const [foco, setFoco] = useState<string | null>(null)
  const [ano, mesNumero] = mes.split('-').map(Number)
  const metricas = [
    {icone:<IconeAgenda nome="calendario"/>, valor: grade.atendimentos.length, rotulo:'Atendimentos do dia'},
    {icone:<IconeAgenda nome="relogio"/>, valor: grade.atendimentos.filter(a => a.status === 'em_atendimento').length, rotulo:'Em atendimento', detalhe:'Status operacional registrado'},
    {icone:<IconeAgenda nome="carro"/>, valor: grade.atendimentos.filter(a => a.modalidade === 'taxidog').length, rotulo:'Com TaxiDog'},
    {icone:'✓', valor: grade.atendimentos.filter(a => a.status === 'concluido').length, rotulo:'Concluídos'},
  ]
  const inicio = grade.inicio ?? 0, fim = grade.fim ?? 0
  const marcas = Array.from({length: grade.inicio === null ? 0 : Math.max(0, (fim-inicio)/30+1)}, (_,i) => inicio+i*30)
  // Escala visual contínua: mantém inclusive intervalos de 15 minutos.
  const escala = ESCALA_GRADE
  const altura = Math.max(260, (fim-inicio)*escala)
  function outroDia(delta: number) { const d=new Date(`${agenda.dataOperacional}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+delta); selecionarData(d.toISOString().slice(0,10)) }
  function selecionarData(data: string) { setMes(data.slice(0,7)); mudarData(data) }
  function outroMes(delta: number) { const m=deslocarMes(ano,mesNumero-1,delta);setMes(`${m.ano}-${String(m.mes+1).padStart(2,'0')}`) }
  return <>
    <div className="agenda-kpis-operacionais">{metricas.map(m => <div key={m.rotulo}><span aria-hidden="true">{m.icone}</span><div><strong>{m.valor}</strong><p>{m.rotulo}</p><small>{m.detalhe || 'Na data selecionada'}</small></div></div>)}</div>
    <div className="agenda-composicao"><main className="agenda-quadro">
      <div className="agenda-toolbar"><button aria-label="Dia anterior" onClick={()=>outroDia(-1)}>‹</button><label><span>{new Date(`${agenda.dataOperacional}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><input aria-label="Data da Agenda" type="date" value={agenda.dataOperacional} onChange={e=>e.target.value && selecionarData(e.target.value)}/></label><button aria-label="Próximo dia" onClick={()=>outroDia(1)}>›</button><button onClick={hoje}>Hoje</button><button className="agenda-novo" onClick={()=>novo()}>＋ Novo agendamento</button></div>
      <p className="agenda-grade-nota">Espaços neutros sugerem um horário. A disponibilidade será validada após escolher pet, serviços e transporte.</p>
      {estrutura.erroAgenda && <p role="alert">Não foi possível carregar as jornadas: {estrutura.erroAgenda}</p>}
      {estrutura.carregandoAgenda ? <p role="status">Carregando funcionários e jornadas…</p> : <div className="agenda-timeline-scroll"><div className="agenda-timeline" style={{width:'100%', minWidth:`calc(72px + ${grade.colunas.reduce((total,c)=>total+Math.max(0,...c.segmentos.map(s=>s.faixa))+1,0)} * var(--agenda-faixa-largura))`, gridTemplateColumns:`72px ${grade.colunas.map(c=>`minmax(calc(${Math.max(0,...c.segmentos.map(s=>s.faixa))+1} * var(--agenda-faixa-largura)),1fr)`).join(' ') || 'minmax(var(--agenda-faixa-largura),1fr)'}`}}>
        <div className="agenda-eixo"><header>Horário</header><div style={{height:altura}}>{marcas.map(m=><time key={m} style={{top:(m-inicio)*escala}}>{horario(m)}</time>)}</div></div>
        {grade.colunas.map(c=><section className={`agenda-coluna ${Math.max(0,...c.segmentos.map(s=>s.faixa))>0?'agenda-coluna-sobreposta':''}`} key={c.id}><header><span className="agenda-coluna-avatar">{c.nome.charAt(0)}</span><div><h2>{c.nome}</h2><small>{c.jornada.length ? c.jornada.map(j=>`${horario(j.inicio)}–${horario(j.fim)}`).join(' · ') : 'Alocações registradas'}</small></div></header><div className="agenda-coluna-dia" style={{height:altura}}>
          {marcas.slice(0,-1).map(m=><button className="agenda-celula-neutra" key={m} style={{top:(m-inicio)*escala,height:30*escala}} aria-label={`Sugerir novo agendamento às ${horario(m)}${c.id !== '__sem_funcionario__' ? ` com ${c.nome}` : ''}; sujeito à validação`} onClick={()=>novo({funcionarioId:c.id==='__sem_funcionario__'?undefined:c.id,funcionarioNome:c.id==='__sem_funcionario__'?undefined:c.nome,horario:m})}><span>＋ Sugerir {horario(m)}</span></button>)}
          {c.segmentos.filter(s=>Number.isFinite(s.inicio)&&s.fim>s.inicio).map(s=><div key={s.chave} className="agenda-segmento-posicao" style={{top:(s.inicio-inicio)*escala,height:(s.fim-s.inicio)*escala-4,left:`calc(${s.faixa/(Math.max(0,...c.segmentos.map(s=>s.faixa))+1)*100}% + 6px)`,width:`calc(${100/(Math.max(0,...c.segmentos.map(s=>s.faixa))+1)}% - 12px)`}}><SegmentoCard segmento={s} foco={foco} destacar={setFoco} abrir={abrir} acao={acao} atualizando={atualizandoId===s.atendimento.id}/></div>)}
          {c.segmentos.filter(s=>!Number.isFinite(s.inicio)||s.fim<=s.inicio).map(s=><button key={s.chave} onClick={()=>abrir(s.atendimento)}>{s.atendimento.petNome} · Horário não informado</button>)}
        </div></section>)}
        {!grade.colunas.length && <section className="agenda-sem-jornada"><h2>Sem jornada configurada neste dia</h2><p>{grade.expediente.length ? 'Expediente exibido ao lado. Use Novo agendamento para consultar o planejamento oficial.' : 'Sem expediente configurado para esta data.'}</p><button onClick={()=>novo()}>＋ Novo agendamento</button></section>}
      </div></div>}
      <div className="agenda-legenda-nova">{['agendado','confirmado','em_atendimento','aguardando_retirada','aguardando_entrega','concluido','cancelado','faltou'].map(s=><span key={s}><i className={`ponto-${s}`}/>{rotuloStatusAtendimento(s)}</span>)}<span><IconeAgenda nome="carro"/> TaxiDog</span><span><IconeAgenda nome="caixa"/> Pacote/contrato</span></div>
    </main><aside className="agenda-paineis"><section className="agenda-calendario"><h2>Calendário</h2><nav><button aria-label="Mês anterior" onClick={()=>outroMes(-1)}>‹</button><strong>{new Date(ano,mesNumero-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><button aria-label="Próximo mês" onClick={()=>outroMes(1)}>›</button></nav><div className="agenda-mes-grid">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><small key={d}>{d}</small>)}{diasDoCalendario(ano,mesNumero-1).map(d=><button key={d.data} aria-label={d.data} aria-pressed={d.data===agenda.dataOperacional} className={`${d.mesAtual?'':'fora'} ${d.data===agenda.dataOperacional?'selecionado':''}`} onClick={()=>selecionarData(d.data)}>{d.dia}</button>)}</div></section><section className="agenda-resumo-lateral"><h2>Resumo do dia</h2>{metricas.map(m=><div key={m.rotulo}><span>{m.icone}</span><p><strong>{m.valor}</strong> {m.rotulo}</p></div>)}<p className="agenda-resumo-texto">{grade.colunas.filter(c=>c.jornada.length).length} funcionários com jornada nesta data</p><small>Atualizado às {agora.toLocaleTimeString('pt-BR',{timeZone:agenda.timezone,hour:'2-digit',minute:'2-digit'})} · estados registrados</small></section><section className="agenda-assinatura">🐾<strong>Mais que um pet shop,<br/>uma vida mais feliz!</strong><p>Cuidado e atenção em cada atendimento.</p></section></aside></div>
  </>
}
function SegmentoCard({segmento:s,foco,destacar,abrir,acao,atualizando}:{segmento:Segmento;foco:string|null;destacar:(id:string|null)=>void;abrir:(a:AgendaDiariaAtendimento)=>void;acao:(a:AgendaDiariaAtendimento)=>void;atualizando:boolean}) {
  const a=s.atendimento, rapida=obterAcaoRapidaAtendimento(a)
  const servicos=a.servicos.map(i=>i.nome).join(' + ')
  const nomeIcone=/tosa/i.test(servicos)?'tesoura':/hidrata/i.test(servicos)?'gota':'banho'
  const densidade = densidadeSegmento(s)
  const status = rotuloStatusAtendimento(a.status)
  const valor = a.valorFinal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  const transporte = a.modalidade === 'taxidog' ? 'TaxiDog' : 'Sem transporte'
  const tooltip = `${horario(s.inicio)}–${horario(s.fim)} · ${a.petNome} · Tutor: ${a.tutorNome} · Serviços: ${servicos || 'Não informado'} · ${transporte} · ${status} · ${a.vinculoContrato?'Valor de referência':'Valor'}: ${valor}${possuiPacote(a)?' · Atendimento de pacote':''}`
  const acaoRapida = (compacta=false) => rapida&&<button aria-label={`${rapida.rotulo} ${a.petNome}`} title={rapida.rotulo} className={`agenda-segmento-acao ${compacta?'agenda-segmento-acao-curta':''}`} disabled={atualizando} onClick={e=>{e.stopPropagation();acao(a)}}>{atualizando?(compacta?'…':'Atualizando…'):rapida.rotulo}</button>
  const indicadores = <span className="agenda-segmento-indicadores">{possuiPacote(a)&&<span title="Atendimento de pacote" aria-label="Atendimento de pacote"><IconeAgenda nome="caixa"/></span>}{a.modalidade==='taxidog'&&<span title="TaxiDog" aria-label="TaxiDog"><IconeAgenda nome="carro"/></span>}<span className={`agenda-status-ponto status-${a.status}`} title={status} aria-label={`Status: ${status}`}>●</span></span>
  return <article role="button" tabIndex={0} title={tooltip} aria-label={`Abrir atendimento de ${a.petNome}, ${horario(s.inicio)} até ${horario(s.fim)}`} className={`agenda-segmento densidade-${densidade} status-${a.status} ${foco===a.id?'relacionado':''} ${s.conflito?'conflito':''}`} onMouseEnter={()=>destacar(a.id)} onMouseLeave={()=>destacar(null)} onFocus={()=>destacar(a.id)} onBlur={()=>destacar(null)} onClick={()=>abrir(a)} onKeyDown={e=>{if(e.target===e.currentTarget && ['Enter',' '].includes(e.key)){e.preventDefault();abrir(a)}}}>
    {densidade==='curta' ? <>
      <div className="agenda-segmento-compacto-top"><time>{horario(s.inicio)}–{horario(s.fim)}</time><span>{indicadores}<span className="agenda-segmento-valor">{a.vinculoContrato?'Ref. ':''}{valor}</span>{acaoRapida(true)}</span></div>
      <div className="agenda-segmento-compacto-principal"><strong>{a.petNome} · {a.tutorNome}</strong><span>· <IconeAgenda nome={nomeIcone}/> {servicos}</span></div>
    </> : densidade==='media' ? <>
      <div className="agenda-segmento-top"><time>{horario(s.inicio)}–{horario(s.fim)}</time><span>{indicadores}<span className="agenda-segmento-valor">{a.vinculoContrato?'Ref. ':''}{valor}</span></span></div>
      <div className="agenda-segmento-medio-pet"><strong>{a.petNome}</strong><small>{a.tutorNome}</small></div>
      <div className="agenda-segmento-medio-etapa" title={servicos}><IconeAgenda nome={nomeIcone}/> {servicos || 'Serviço não informado'}</div>
      <div className="agenda-segmento-medio-base"><span className={`agenda-status status-${a.status}`}>{status}</span>{acaoRapida()}</div>
      {s.conflito&&<small className="agenda-conflito-aviso" title="Sobreposição de alocações">Sobreposição</small>}
    </> : <>
      <div className="agenda-segmento-top"><time>{horario(s.inicio)}–{horario(s.fim)}</time><span>{indicadores} <span className="agenda-segmento-valor">{a.vinculoContrato?'Ref. ':''}{valor}</span></span></div>
      <div className="agenda-segmento-pet"><span className="agenda-segmento-avatar">{a.petNome.charAt(0)}</span><div><strong>{a.petNome}</strong><small>{a.tutorNome} (tutor)</small></div></div>
      <div className="agenda-segmento-servico" title={servicos}><IconeAgenda nome={nomeIcone}/> {servicos}</div>
      <div className="agenda-segmento-base"><span title={a.taxidog?`Coleta ${a.taxidog.coletaInicio.slice(0,5)}–${a.taxidog.coletaFim.slice(0,5)} · conclusão limite ${a.taxidog.conclusaoLimite.slice(0,5)}`:undefined}>{a.modalidade==='taxidog'?<><IconeAgenda nome="carro"/> TaxiDog</>:'Sem transporte'}</span><span className={`agenda-status status-${a.status}`}>{status}</span></div>
      {s.conflito&&<small className="agenda-conflito-aviso">Sobreposição de alocações</small>}
      {acaoRapida()}
    </>}
  </article>
}
