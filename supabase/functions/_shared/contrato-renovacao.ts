import type { ResultadoMaterializacaoCiclo } from './materializacao-contrato.ts'

export type SolicitarRenovacao = { contratoId: string; cicloAnteriorId: string; chaveIdempotencia: string; dataAncora: string }
export type PreparoRenovacao = { versao: 1; conteudo: string; assinatura: string }
export type RespostaRenovacao =
  | { status: 'preparado'; preparo: PreparoRenovacao; disponivel: boolean; quantidadeOcorrencias: number; mensagem: string }
  | { status: 'renovado' | 'materializacao_pendente' | 'requer_revisao'; contratoId: string; cicloId: string; numero: number; mensagem: string; materializacao?: ResultadoMaterializacaoCiclo }
  | { status: 'invalido' | 'conflito' | 'erro'; codigo: string; mensagem: string }
export type IntencaoRenovacao = ({ operacao: 'preparar' } & SolicitarRenovacao) | { operacao: 'confirmar'; preparo: PreparoRenovacao }

export function lerIntencaoRenovacao(v: unknown): IntencaoRenovacao | null {
  if (!objeto(v)) return null
  if (v.operacao === 'preparar' && uuid(v.contratoId) && uuid(v.cicloAnteriorId) && uuid(v.chaveIdempotencia) && dataValida(v.dataAncora)) {
    return { operacao: 'preparar', contratoId: v.contratoId, cicloAnteriorId: v.cicloAnteriorId, chaveIdempotencia: v.chaveIdempotencia, dataAncora: v.dataAncora }
  }
  if (v.operacao === 'confirmar' && objeto(v.preparo) && v.preparo.versao === 1 && typeof v.preparo.conteudo === 'string' && v.preparo.conteudo.length <= 1_000_000 && typeof v.preparo.assinatura === 'string' && /^[a-f0-9]{64}$/.test(v.preparo.assinatura)) {
    return { operacao: 'confirmar', preparo: { versao: 1, conteudo: v.preparo.conteudo, assinatura: v.preparo.assinatura } }
  }
  return null
}
export function objeto(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v) }
export function uuid(v: unknown): v is string { return typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v) }
function dataValida(v: unknown): v is string { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v }
