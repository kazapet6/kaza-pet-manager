import type { KeyboardEvent } from 'react'
import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import type { ContextoGrade } from './gradeTemporal.ts'
import { horario, possuiPacote, type Segmento, montarGrade } from './gradeTemporal.ts'
import { obterAcaoRapidaAtendimento } from './acaoRapidaAtendimento.ts'
import { rotuloStatusAtendimento } from '../statusAtendimento/politica.ts'
import IconeAgenda from './IconeAgenda.tsx'
import './AgendaCards.css'

type Grade = ReturnType<typeof montarGrade>
type Coluna = Grade['colunas'][number]

type Props = {
  grade: Grade
  abrir: (atendimento: AgendaDiariaAtendimento) => void
  novo: (contexto?: ContextoGrade) => void
  acao: (atendimento: AgendaDiariaAtendimento) => void
  atualizandoId: string | null
}

const MINUTOS_POR_LINHA = 60

function sugestao(coluna: Coluna, minuto: number): ContextoGrade {
  if (coluna.id === '__sem_funcionario__') return { horario: minuto }
  return { funcionarioId: coluna.id, funcionarioNome: coluna.nome, horario: minuto }
}

function qtdAtendimentos(coluna: Coluna) {
  return new Set(coluna.segmentos.map(segmento => segmento.atendimento.id)).size
}

/**
 * Exibição visual alternativa da Agenda. NÃO calcula disponibilidade, NÃO altera
 * status e NÃO grava no banco. O modal de agendamento e as Edges existentes
 * continuam sendo os únicos responsáveis pela validação comercial.
 */
export default function AgendaCards({ grade, abrir, novo, acao, atualizandoId }: Props) {
  const colunas = grade.colunas
  const inicio = grade.inicio === null ? null : Math.floor(grade.inicio / MINUTOS_POR_LINHA) * MINUTOS_POR_LINHA
  const fim = grade.fim === null ? null : Math.ceil(grade.fim / MINUTOS_POR_LINHA) * MINUTOS_POR_LINHA
  const horarios = inicio === null || fim === null || fim <= inicio
    ? []
    : Array.from({ length: Math.ceil((fim - inicio) / MINUTOS_POR_LINHA) }, (_, i) => inicio + i * MINUTOS_POR_LINHA)

  if (!colunas.length || !horarios.length) {
    return <div className="kpm-cards-vazio" role="status">
      <div className="kpm-cards-vazio-icone" aria-hidden="true">🐾</div>
      <h3>Agenda sem horários para exibir</h3>
      <p>Confira o expediente e as jornadas configuradas. A disponibilidade será validada ao agendar.</p>
      <button type="button" onClick={() => novo()}>＋ Novo agendamento</button>
    </div>
  }

  const semHorario = colunas.flatMap(coluna => coluna.segmentos
    .filter(segmento => !Number.isFinite(segmento.inicio) || !(segmento.fim > segmento.inicio))
    .map(segmento => ({ segmento, coluna })))
  const largura = `76px repeat(${colunas.length}, minmax(245px, 1fr))`

  return <>
    <div className="kpm-cards-instrucao">Organizado pelo horário de início. Clique em um card para abrir os detalhes ou em <strong>＋</strong> para sugerir um agendamento.</div>
    <div className="kpm-cards-scroll" role="region" aria-label="Agenda em cards por horário e funcionário" tabIndex={0}>
      <div className="kpm-cards-grade" style={{ gridTemplateColumns: largura }}>
        <div className="kpm-cards-canto">Horário</div>
        {colunas.map(coluna => <div key={coluna.id} className="kpm-cards-funcionario">
          <span className="kpm-cards-funcionario-avatar" aria-hidden="true">{coluna.nome.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
          <div className="kpm-cards-funcionario-textos"><strong>{coluna.nome}</strong><small>{coluna.jornada.length ? coluna.jornada.map(j => `${horario(j.inicio)}–${horario(j.fim)}`).join(' · ') : 'Sem jornada registrada'} · {qtdAtendimentos(coluna)} pets</small></div>
        </div>)}
        {horarios.map(minuto => <div key={minuto} className="kpm-cards-linha-conteudo">
          <div className="kpm-cards-hora"><time>{horario(minuto)}</time></div>
          {colunas.map(coluna => {
            const itens = coluna.segmentos.filter(s => Number.isFinite(s.inicio) && s.fim > s.inicio && s.inicio >= minuto && s.inicio < minuto + MINUTOS_POR_LINHA)
            return <div className="kpm-cards-celula" key={`${coluna.id}:${minuto}`}>
              {itens.map(s => <AtendimentoCard key={s.chave} segmento={s} abrir={abrir} acao={acao} atualizando={atualizandoId === s.atendimento.id} />)}
              {!itens.length && <button type="button" className="kpm-cards-adicionar" aria-label={`Sugerir ${horario(minuto)} para ${coluna.nome}; sujeito à validação de disponibilidade`} onClick={() => novo(sugestao(coluna, minuto))}>＋ <span>Sugerir horário</span></button>}
            </div>
          })}
        </div>)}
      </div>
    </div>
    {semHorario.length > 0 && <section className="kpm-cards-sem-horario">
      <h3>Atendimentos sem horário válido</h3>
      <p>Esses registros não foram omitidos da Agenda.</p>
      <div>{semHorario.map(({ segmento, coluna }) => <button key={segmento.chave} type="button" onClick={() => abrir(segmento.atendimento)}>{segmento.atendimento.petNome} · {coluna.nome} · Ver detalhes</button>)}</div>
    </section>}
  </>
}

function AtendimentoCard({ segmento, abrir, acao, atualizando }: {
  segmento: Segmento
  abrir: (atendimento: AgendaDiariaAtendimento) => void
  acao: (atendimento: AgendaDiariaAtendimento) => void
  atualizando: boolean
}) {
  const atendimento = segmento.atendimento
  const acaoRapida = obterAcaoRapidaAtendimento(atendimento)
  const servicos = atendimento.servicos.map(servico => servico.nome).join(' · ') || 'Serviço não informado'
  const status = rotuloStatusAtendimento(atendimento.status)
  const valor = atendimento.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  function teclado(evento: KeyboardEvent<HTMLElement>) {
    if (evento.target === evento.currentTarget && (evento.key === 'Enter' || evento.key === ' ')) {
      evento.preventDefault()
      abrir(atendimento)
    }
  }

  return <article
    className={`kpm-cards-card kpm-cards-status-${atendimento.status}${segmento.conflito ? ' kpm-cards-conflito' : ''}`}
    role="button"
    tabIndex={0}
    onClick={() => abrir(atendimento)}
    onKeyDown={teclado}
    aria-label={`Abrir atendimento de ${atendimento.petNome}, ${horario(segmento.inicio)} até ${horario(segmento.fim)}, ${status}`}
  >
    <div className="kpm-cards-topo">
      <time>{horario(segmento.inicio)} – {horario(segmento.fim)}</time>
      <span className={`kpm-cards-status-etiqueta kpm-cards-status-${atendimento.status}`}>{status}</span>
    </div>
    <div className="kpm-cards-pet">
      <div className="kpm-cards-pet-avatar" aria-hidden="true">{atendimento.petNome.slice(0, 1).toLocaleUpperCase('pt-BR')}</div>
      <div><strong>{atendimento.petNome}</strong><small>{atendimento.tutorNome}</small></div>
    </div>
    <p className="kpm-cards-servicos" title={servicos}><IconeAgenda nome={/tosa/i.test(servicos) ? 'tesoura' : 'banho'} /> {servicos}</p>
    <div className="kpm-cards-info">
      {possuiPacote(atendimento) && <span title={atendimento.vinculoContrato?.pacoteNome}><IconeAgenda nome="caixa" /> Pacote</span>}
      {atendimento.modalidade === 'taxidog' && <span title={atendimento.taxidog ? `Coleta ${atendimento.taxidog.coletaInicio.slice(0, 5)}–${atendimento.taxidog.coletaFim.slice(0, 5)}` : undefined}><IconeAgenda nome="carro" /> TaxiDog</span>}
      <span title={possuiPacote(atendimento) ? 'Valor de referência do atendimento' : 'Valor do atendimento'}>{possuiPacote(atendimento) ? 'Ref. ' : ''}{valor}</span>
    </div>
    {segmento.conflito && <strong className="kpm-cards-alerta">Sobreposição de horários</strong>}
    {acaoRapida && <button type="button" className="kpm-cards-acao" disabled={atualizando} onClick={evento => { evento.stopPropagation(); acao(atendimento) }}>{atualizando ? 'Atualizando…' : acaoRapida.rotulo}</button>}
  </article>
}