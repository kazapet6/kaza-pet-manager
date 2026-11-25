import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import { horario, possuiPacote, type Segmento, type montarGrade } from './gradeTemporal.ts'
import { obterAcaoRapidaAtendimento } from './acaoRapidaAtendimento.ts'
import { rotuloStatusAtendimento } from '../statusAtendimento/politica.ts'
import IconeAgenda from './IconeAgenda.tsx'
import './AgendaCards.css'

type Props = {
  grade: ReturnType<typeof montarGrade>
  timezone: string
  abrir: (atendimento: AgendaDiariaAtendimento) => void
  acao: (atendimento: AgendaDiariaAtendimento) => void
  atualizandoId: string | null
}

export default function AgendaCards({ grade, timezone, abrir, acao, atualizandoId }: Props) {
  const comHorario: { segmento: Segmento; inicio: number; fim: number }[] = []
  const semHorario: Segmento[] = []
  const formatarHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })

  for (const coluna of grade.colunas) {
    for (const segmento of coluna.segmentos) {
      const inicio = Date.parse(segmento.atendimento.inicio)
      const fim = Date.parse(segmento.atendimento.conclusao)
      if (Number.isFinite(inicio) && fim > inicio) comHorario.push({ segmento, inicio, fim })
      else semHorario.push(segmento)
    }
  }

  comHorario.sort((a, b) => a.inicio - b.inicio || a.segmento.chave.localeCompare(b.segmento.chave))
  const expediente = grade.expediente
    .filter(bloco => Number.isFinite(bloco.inicio) && bloco.fim > bloco.inicio)
    .sort((a, b) => a.inicio - b.inicio)

  return <>
    <p className="kpm-cards-expediente">
      <IconeAgenda nome="relogio" />
      {expediente.length
        ? `Expediente: ${expediente.map(bloco => `${horario(bloco.inicio)}–${horario(bloco.fim)}`).join(' · ')}`
        : 'Sem expediente configurado nesta data.'}
    </p>
    {!comHorario.length && !semHorario.length && <p className="kpm-cards-vazio" role="status">Nenhum atendimento nesta data.</p>}
    {comHorario.length > 0 && <ol className="kpm-cards-lista" aria-label="Atendimentos por ordem de início">
      {comHorario.map(({ segmento, inicio, fim }) => <li key={segmento.chave}>
        <AtendimentoCard
          segmento={segmento} horas={{ inicio: formatarHora.format(inicio), fim: formatarHora.format(fim) }}
          abrir={abrir} acao={acao} atualizando={atualizandoId === segmento.atendimento.id}
        />
      </li>)}
    </ol>}
    {semHorario.length > 0 && <section className="kpm-cards-sem-horario" aria-labelledby="kpm-cards-sem-horario">
      <h2 id="kpm-cards-sem-horario">Atendimentos sem horário válido</h2>
      <ul className="kpm-cards-lista">
        {semHorario.map(segmento => <li key={segmento.chave}>
          <AtendimentoCard segmento={segmento} abrir={abrir} acao={acao} atualizando={atualizandoId === segmento.atendimento.id} />
        </li>)}
      </ul>
    </section>}
  </>
}

function AtendimentoCard({ segmento, horas, abrir, acao, atualizando }: {
  segmento: Segmento
  horas?: { inicio: string; fim: string }
  abrir: Props['abrir']
  acao: Props['acao']
  atualizando: boolean
}) {
  const { atendimento } = segmento
  const acaoRapida = obterAcaoRapidaAtendimento(atendimento)
  const servicos = atendimento.servicos.map(servico => servico.nome).join(' · ') || 'Serviço não informado'
  const status = rotuloStatusAtendimento(atendimento.status)
  const pacote = possuiPacote(atendimento)
  const valor = atendimento.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const responsavel = atendimento.funcionarioResponsavel?.nome ?? 'Sem responsável'
  const iconeServico = /tosa/i.test(servicos) ? 'tesoura' : /hidrata/i.test(servicos) ? 'gota' : 'banho'

  return <article className="kpm-cards-card" data-status={atendimento.status}>
    <div className="kpm-cards-horario">
      {horas ? <>
        <time dateTime={atendimento.inicio}>{horas.inicio}</time>
        <time dateTime={atendimento.conclusao}>– {horas.fim}</time>
      </> : <span>Sem horário</span>}
    </div>
    <div className="kpm-cards-pet">
      <span className="kpm-cards-avatar" aria-hidden="true">{atendimento.petNome.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'P'}</span>
      <div>
        <h3>{atendimento.petNome}</h3>
        <span>{atendimento.tutorNome}</span>
      </div>
    </div>
    <div className="kpm-cards-servicos">
      <p><IconeAgenda nome={iconeServico} />{servicos}</p>
      <div className="kpm-cards-indicadores">
        <span className={pacote ? 'kpm-cards-etiqueta pacote' : 'kpm-cards-etiqueta'}>{pacote && <IconeAgenda nome="caixa" />}{pacote ? 'Pacote' : 'Avulso'}</span>
        {atendimento.modalidade === 'taxidog' && <span className="kpm-cards-etiqueta pacote"><IconeAgenda nome="carro" />TaxiDog</span>}
      </div>
      <small>{responsavel}</small>
      {segmento.conflito && <strong className="kpm-cards-alerta">Sobreposição de horários</strong>}
    </div>
    <div className="kpm-cards-estado"><span className="kpm-cards-status">{status}</span></div>
    <div className="kpm-cards-preco">
      <span className="kpm-cards-valor">{pacote && <small>Ref.</small>}{valor}</span>
    </div>
    <div className="kpm-cards-acoes">
      {acaoRapida && <button
        type="button" className="kpm-cards-acao"
        aria-label={`${acaoRapida.rotulo} ${atendimento.petNome}`}
        disabled={atualizando} onClick={() => acao(atendimento)}
      >{atualizando ? 'Atualizando…' : acaoRapida.rotulo}</button>}
      <button type="button" className="kpm-cards-detalhe"
        aria-label={`Abrir atendimento de ${atendimento.petNome}`}
        title="Ver detalhes e opções" onClick={() => abrir(atendimento)}
      ><span aria-hidden="true">⋮</span></button>
    </div>
  </article>
}
