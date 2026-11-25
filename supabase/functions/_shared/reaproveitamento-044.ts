import { objeto, uuid } from './contrato-renovacao.ts'
export type ReferenciaCredito044 = { ocorrenciaId: string; contratoItemId: string; versaoEsperada: number; eventoLiberacaoId: string }
export type SolicitarReaproveitamento044 = { contratoId: string; cicloId: string; creditos: ReferenciaCredito044[]; data: string; horario: string; funcionarioResponsavelId: string; motivo: string }
export type Preparo044 = { versao: 1; conteudo: string; assinatura: string }
export type Intencao044 = { operacao: 'listar'; cicloId: string } | ({ operacao: 'preparar'; chaveIdempotencia: string } & SolicitarReaproveitamento044) | { operacao: 'confirmar' | 'reconciliar'; preparo: Preparo044 }
export type ProvaDesfecho044 = { desfecho: 'sucesso_confirmado' | 'recusa_definitiva'; desfechoPersistido: true; versaoDesfecho: 2; reciboId: string }
export type Resposta044 =
 | { status: 'carregado'; contratoId: string; cicloId: string; funcionarioPadraoId: string; unidades: Record<string, unknown>[]; funcionarios: { id: string; nome: string }[] }
 | { status: 'preparado'; preparo: Preparo044; mensagem: string }
 | ({ status: 'reservado'; contratoId: string; cicloId: string; atendimentoId: string; chaveIdempotencia: string; mensagem: string } & ProvaDesfecho044)
 | ({ status: 'recusado'; codigo: string; mensagem: string; contratoId: string; cicloId: string; chaveIdempotencia: string } & ProvaDesfecho044)
 | { status: 'transitorio' | 'desconhecido'; codigo: string; mensagem: string }
 | { status: 'invalido' | 'conflito' | 'erro'; codigo: string; mensagem: string }
export function lerIntencao044(v: unknown): Intencao044 | null {
 if (!objeto(v)) return null
 if (v.operacao === 'listar' && uuid(v.cicloId)) return { operacao: 'listar', cicloId: v.cicloId }
 if ((v.operacao === 'confirmar' || v.operacao === 'reconciliar') && objeto(v.preparo) && v.preparo.versao === 1 && typeof v.preparo.conteudo === 'string' && v.preparo.conteudo.length <= 1_000_000 && typeof v.preparo.assinatura === 'string' && /^[a-f0-9]{64}$/.test(v.preparo.assinatura)) return { operacao: v.operacao, preparo: { versao: 1, conteudo: v.preparo.conteudo, assinatura: v.preparo.assinatura } }
 if (v.operacao !== 'preparar' || !uuid(v.contratoId) || !uuid(v.cicloId) || !uuid(v.chaveIdempotencia) || !uuid(v.funcionarioResponsavelId) || !Array.isArray(v.creditos) || !v.creditos.length || v.creditos.length > 20 || typeof v.motivo !== 'string' || !v.motivo.trim() || v.motivo.length > 500) return null
 if (typeof v.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.data) || !Number.isFinite(Date.parse(v.data + 'T00:00:00Z')) || new Date(v.data + 'T00:00:00Z').toISOString().slice(0, 10) !== v.data || typeof v.horario !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.horario)) return null
 const creditos: ReferenciaCredito044[] = []
 for (const x of v.creditos) { if (!objeto(x) || !uuid(x.ocorrenciaId) || !uuid(x.contratoItemId) || !uuid(x.eventoLiberacaoId) || !Number.isSafeInteger(x.versaoEsperada) || Number(x.versaoEsperada) < 1) return null; creditos.push({ ocorrenciaId: x.ocorrenciaId, contratoItemId: x.contratoItemId, eventoLiberacaoId: x.eventoLiberacaoId, versaoEsperada: Number(x.versaoEsperada) }) }
 creditos.sort((a, b) => a.ocorrenciaId.localeCompare(b.ocorrenciaId) || a.contratoItemId.localeCompare(b.contratoItemId))
 if (new Set(creditos.map(x => x.ocorrenciaId + ':' + x.contratoItemId)).size !== creditos.length || new Set(creditos.map(x => x.ocorrenciaId)).size !== 1) return null
 return { operacao: 'preparar', contratoId: v.contratoId, cicloId: v.cicloId, chaveIdempotencia: v.chaveIdempotencia, creditos, data: v.data, horario: v.horario, funcionarioResponsavelId: v.funcionarioResponsavelId, motivo: v.motivo.trim() }
}
