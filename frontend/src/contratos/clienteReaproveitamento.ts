import { supabase } from '../lib/supabase.ts'
import { objeto, uuid } from '../../../supabase/functions/_shared/contrato-renovacao.ts'
import type { Intencao044, Resposta044 } from '../../../supabase/functions/_shared/reaproveitamento-044.ts'
import { criarFluxo044 } from './reaproveitamentoFluxo.ts'
export async function invocar044(i: Intencao044): Promise<Resposta044> {
 const { data, error } = await supabase.functions.invoke('reaproveitar-credito', { body: i })
 if (error) { const status = (error as { context?: { status?: number } }).context?.status; throw new Error(status === 401 ? 'Entre novamente e retome a mesma tentativa.' : status === 403 ? 'Seu usuário não tem permissão para reaproveitar créditos.' : 'Resultado não confirmado. Retome a mesma tentativa, sem criar outra chave.') }
 if (!objeto(data) || typeof data.status !== 'string') throw new Error('Resposta não reconhecida; nenhum sucesso foi confirmado.')
 if (data.status === 'carregado' && uuid(data.cicloId) && uuid(data.contratoId) && Array.isArray(data.unidades) && Array.isArray(data.funcionarios)) return data as Resposta044
 if (data.status === 'preparado' && objeto(data.preparo) && data.preparo.versao === 1 && typeof data.preparo.conteudo === 'string' && typeof data.preparo.assinatura === 'string' && typeof data.mensagem === 'string') return data as Resposta044
 if (data.status === 'reservado' && data.desfecho === 'sucesso_confirmado' && data.desfechoPersistido === true && data.versaoDesfecho === 2 && data.reciboId === data.chaveIdempotencia && uuid(data.atendimentoId) && uuid(data.cicloId) && uuid(data.contratoId) && uuid(data.chaveIdempotencia) && typeof data.mensagem === 'string') return data as Resposta044
 if (data.status === 'recusado' && data.desfecho === 'recusa_definitiva' && data.desfechoPersistido === true && data.versaoDesfecho === 2 && data.reciboId === data.chaveIdempotencia && uuid(data.chaveIdempotencia) && uuid(data.contratoId) && uuid(data.cicloId) && typeof data.codigo === 'string' && typeof data.mensagem === 'string') return data as Resposta044
 if (['transitorio', 'desconhecido', 'invalido', 'conflito', 'erro'].includes(data.status) && typeof data.codigo === 'string' && typeof data.mensagem === 'string') return data as Resposta044
 throw new Error('Resposta não reconhecida; retome a mesma tentativa.')
}
export const fluxo044 = criarFluxo044({ ator: async () => { const { data, error } = await supabase.auth.getSession(); if (error || !data.session?.user.id) throw new Error('Sessão indisponível.'); return data.session.user.id }, invoke: invocar044, uuid: () => crypto.randomUUID(), storage: { getItem: k => window.localStorage.getItem(k), setItem: (k, v) => window.localStorage.setItem(k, v), removeItem: k => window.localStorage.removeItem(k) } })
