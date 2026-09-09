import type { AgendaDiariaAtendimento, AgendaDiariaResultado } from '../types/AgendaDiaria.ts'
import type { EstruturaAgenda } from '../types/Agenda.ts'

export type Expediente = { diaSemana: number; inicio: string; fim: string; ativo: boolean }
export type ContextoGrade = { funcionarioId?: string; funcionarioNome?: string; horario?: number }
export type Segmento = { chave: string; atendimento: AgendaDiariaAtendimento; inicio: number; fim: number; faixa: number; conflito: boolean }
export type DensidadeSegmento = 'curta' | 'media' | 'normal'
export const ESCALA_GRADE = 3.6
export function minutos(hora: string) { const [h, m] = hora.split(':').map(Number); return h * 60 + m }
export function horario(minuto: number) { return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}` }
export function minutoLocal(valor: string, timezone: string) { return minutos(new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(valor))) }
export function alturaSegmento(segmento: Pick<Segmento, 'inicio' | 'fim'>, escala = ESCALA_GRADE) { return Math.max(0, (segmento.fim - segmento.inicio) * escala - 4) }
export function densidadeSegmento(segmento: Pick<Segmento, 'inicio' | 'fim'>, escala = ESCALA_GRADE): DensidadeSegmento {
  const altura = alturaSegmento(segmento, escala)
  if (altura < 76) return 'curta'
  if (altura < 190) return 'media'
  return 'normal'
}
export function montarGrade(agenda: AgendaDiariaResultado, estrutura: EstruturaAgenda, blocos: Expediente[]) {
  const dia = new Date(`${agenda.dataOperacional}T12:00:00Z`).getUTCDay()
  const expediente = blocos.filter(b => b.ativo && b.diaSemana === dia).map(b => ({ inicio: minutos(b.inicio), fim: minutos(b.fim) }))
  const atendimentos = [...new Map(agenda.secoes.flatMap(s => s.atendimentos).map(a => [a.id, a])).values()]
  const colunas = new Map<string, { id: string; nome: string; jornada: {inicio: number; fim: number}[]; intervalos: {inicio: number; fim: number}[]; segmentos: Segmento[] }>()
  function coluna(id: string, nome: string) {
    if (!colunas.has(id)) colunas.set(id, { id, nome, jornada: estrutura.funcionarioJornadas.filter(j => j.ativo && j.diaSemana === dia && j.funcionarioId === id).map(j => ({inicio: minutos(j.inicio), fim: minutos(j.fim)})), intervalos: estrutura.funcionarioIntervalos.filter(j => j.ativo && j.diaSemana === dia && j.funcionarioId === id).map(j => ({inicio: minutos(j.inicio), fim: minutos(j.fim)})), segmentos: [] })
    return colunas.get(id)!
  }
  estrutura.funcionarios.filter(f => f.ativo && estrutura.funcionarioJornadas.some(j => j.ativo && j.funcionarioId === f.id && j.diaSemana === dia && expediente.some(b => minutos(j.inicio) < b.fim && minutos(j.fim) > b.inicio))).forEach(f => coluna(f.id, f.nome))
  atendimentos.forEach((a) => {
    const responsavel = a.funcionarioResponsavel ?? {id: '__sem_funcionario__', nome: 'Sem responsável'}
    const inicio = a.inicio ? minutoLocal(a.inicio, agenda.timezone) : NaN
    const fim = a.conclusao ? minutoLocal(a.conclusao, agenda.timezone) : NaN
    coluna(responsavel.id, responsavel.nome).segmentos.push({chave: a.id, atendimento: a, inicio, fim, faixa: 0, conflito: false})
  })
  const todas = [...colunas.values()].flatMap(c => c.segmentos).filter(s => Number.isFinite(s.inicio) && s.fim > s.inicio)
  const limites = [...expediente, ...todas]
  const inicio = limites.length ? Math.floor(Math.min(...limites.map(b => b.inicio)) / 30) * 30 : null
  const fim = limites.length ? Math.ceil(Math.max(...limites.map(b => b.fim)) / 30) * 30 : null
  // Trilhas evitam sobreposição; conflito descreve somente interseção temporal real.
  colunas.forEach(c => {
    const ordenados = c.segmentos.sort((a,b) => a.inicio-b.inicio || a.fim-b.fim || a.chave.localeCompare(b.chave))
    const fins: number[] = []
    ordenados.forEach(s => { let faixa = fins.findIndex(f => f <= s.inicio); if (faixa < 0) faixa = fins.length; s.faixa = faixa; fins[faixa] = s.fim })
    ordenados.forEach(s => { s.conflito = !['cancelado','faltou'].includes(s.atendimento.status) && ordenados.some(o => o.atendimento.id !== s.atendimento.id && !['cancelado','faltou'].includes(o.atendimento.status) && o.inicio < s.fim && o.fim > s.inicio) })
  })
  return { atendimentos, expediente, inicio, fim, colunas: [...colunas.values()].sort((a,b) => a.id === '__sem_funcionario__' ? 1 : b.id === '__sem_funcionario__' ? -1 : a.nome.localeCompare(b.nome)) }
}
export function possuiPacote(a: AgendaDiariaAtendimento) { return Boolean(a.vinculoContrato) }
