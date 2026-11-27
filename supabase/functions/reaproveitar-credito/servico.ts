import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { objeto, uuid } from '../_shared/contrato-renovacao.ts'
import type { Intencao044, Preparo044, Resposta044 } from '../_shared/reaproveitamento-044.ts'
import { planejar044 } from './planejamento.ts'
type Assinador = { assinar(payload: Record<string, unknown>): Promise<Preparo044>; verificar(p: Preparo044): Promise<boolean> }
export async function executar044(i: Intencao044, usuarioId: string, admin: SupabaseClient, assinador: Assinador, planejar = planejar044): Promise<Resposta044> {
 if (i.operacao === 'listar' || i.operacao === 'preparar') {
  const [{ data: ciclo, error: ec }, { data: unidades, error: eu }] = await Promise.all([
   admin.from('contrato_ciclos').select('id,contrato_id,funcionario_responsavel_padrao_id,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,contratos(pet_id)').eq('id', i.cicloId).single(),
   admin.rpc('contexto_creditos_ciclo_044', { p_ciclo_id: i.cicloId }),
  ])
  if (ec || eu) throw new Error('A Migration 044 ou o ciclo não está disponível.')
  if (!ciclo || !Array.isArray(unidades)) return erro('invalido', 'CICLO_INVALIDO', 'Não foi possível identificar o ciclo.')
  if (i.operacao === 'listar') {
   const { data: funcionarios, error } = await admin.from('funcionarios').select('id,nome').eq('ativo', true).order('nome')
   if (error) throw new Error('Funcionários indisponíveis.')
   return { status: 'carregado', contratoId: String(ciclo.contrato_id), cicloId: i.cicloId, funcionarioPadraoId: String(ciclo.funcionario_responsavel_padrao_id ?? ''), unidades: unidades as Record<string, unknown>[], funcionarios: (funcionarios ?? []).map(x => ({ id: String(x.id), nome: String(x.nome) })) }
  }
  if (ciclo.contrato_id !== i.contratoId) return erro('invalido', 'CONTRATO_DIVERGENTE', 'O crédito não pertence ao contrato selecionado.')
  const selecionadas = i.creditos.map(ref => unidades.find(x => objeto(x) && x.ocorrenciaId === ref.ocorrenciaId && x.contratoItemId === ref.contratoItemId))
  if (selecionadas.some((x, n) => !objeto(x) || x.reaproveitavel !== true || x.estadoComercial !== 'disponivel' || Number(x.versao) !== i.creditos[n].versaoEsperada || x.eventoLiberacaoId !== i.creditos[n].eventoLiberacaoId)) return erro('conflito', 'CREDITO_NAO_ELEGIVEL', 'A unidade mudou ou sua liberação não foi comprovada. Atualize o contrato.')
  const servicoIds = selecionadas.map(x => String((x as Record<string, unknown>).servicoId))
  if (new Set(servicoIds).size !== servicoIds.length) return erro('invalido', 'SERVICO_REPETIDO', 'Selecione somente uma unidade de cada serviço para este atendimento.')
  const ct = Array.isArray(ciclo.contratos) ? ciclo.contratos[0] : ciclo.contratos
  if (!objeto(ct) || typeof ct.pet_id !== 'string') throw new Error('Pet contratual indisponível.')
  const resultado = await planejar(i, ct.pet_id, ciclo as Record<string, unknown>, servicoIds, admin)
  if (!resultado) return erro('conflito', 'CAPACIDADE_INDISPONIVEL', 'Não há capacidade confirmável para os serviços e o responsável escolhidos. Nenhum crédito foi reservado.')
  const intencao = { contratoId: i.contratoId, cicloId: i.cicloId, creditos: i.creditos, chaveIdempotencia: i.chaveIdempotencia, usuarioId, motivo: i.motivo, ocupacaoAgendaVersao: resultado.ocupacaoAgendaVersao }
  return { status: 'preparado', preparo: await assinador.assinar({ intencao, plano: resultado.plano }), mensagem: 'Horário preparado. Confirme para reservar os créditos e criar o atendimento na mesma operação.' }
 }
 if (!await assinador.verificar(i.preparo)) return erro('invalido', 'PREPARO_INVALIDO', 'Preparação inválida; nenhum sucesso foi confirmado.')
 let payload: unknown
 try { payload = JSON.parse(i.preparo.conteudo) } catch { return erro('invalido', 'PREPARO_INVALIDO', 'Preparação inválida.') }
 if (!objeto(payload) || !objeto(payload.intencao) || !objeto(payload.plano) || payload.intencao.usuarioId !== usuarioId || !uuid(payload.intencao.contratoId) || !uuid(payload.intencao.cicloId) || !uuid(payload.intencao.chaveIdempotencia)) return erro('invalido', 'PREPARO_INVALIDO', 'A preparação não pertence à sessão atual.')
 // Confirmacao e consulta usam exatamente o mesmo payload assinado e a mesma identidade.
 const nome = i.operacao === 'reconciliar' ? 'consultar_desfecho_reaproveitamento_044' : 'reaproveitar_credito_contrato_044'
 const { data, error } = await admin.rpc(nome, { p_intencao: payload.intencao, p_plano: payload.plano })
 if (error) {
  if (['55P03', '40P01'].includes(error.code)) return { status: 'transitorio', codigo: error.code, mensagem: 'Operação temporariamente bloqueada. Consulte o resultado e retome a mesma tentativa.' }
  if (error.code === '42501') return erro('invalido', 'SEM_PERMISSAO', 'A operação não foi autorizada. O resultado anterior ainda precisa ser consultado.')
  throw new Error('Resultado da reserva não confirmado.')
 }
 if (!objeto(data)) throw new Error('Resposta da reserva não reconhecida.')
 const identidade = data.contratoId === payload.intencao.contratoId && data.cicloId === payload.intencao.cicloId && data.chaveIdempotencia === payload.intencao.chaveIdempotencia
 const prova = identidade && data.desfechoPersistido === true && data.versaoDesfecho === 2 && data.reciboId === payload.intencao.chaveIdempotencia
 if (data.status === 'reservado' && data.desfecho === 'sucesso_confirmado' && prova && uuid(data.atendimentoId)) return {
  status: 'reservado', atendimentoId: data.atendimentoId, contratoId: data.contratoId as string, cicloId: data.cicloId as string, chaveIdempotencia: data.chaveIdempotencia as string,
  desfecho: 'sucesso_confirmado', desfechoPersistido: true, versaoDesfecho: 2, reciboId: data.reciboId as string,
  mensagem: 'Operação de reserva confirmada. Consulte contrato e Agenda atualizados para acompanhar o atendimento.'
 }
 if (data.status === 'recusado' && data.desfecho === 'recusa_definitiva' && prova && typeof data.codigo === 'string') return {
  status: 'recusado', codigo: data.codigo, contratoId: data.contratoId as string, cicloId: data.cicloId as string, chaveIdempotencia: data.chaveIdempotencia as string,
  desfecho: 'recusa_definitiva', desfechoPersistido: true, versaoDesfecho: 2, reciboId: data.reciboId as string,
  mensagem: 'Esta intenção foi definitivamente recusada e o desfecho está registrado. Você pode preparar uma nova tentativa com outra chave.'
 }
 if (['transitorio', 'desconhecido'].includes(String(data.status)) && data.desfechoPersistido === false && identidade) return {
  status: data.status === 'transitorio' ? 'transitorio' : 'desconhecido', codigo: String(data.codigo ?? 'RESULTADO_NAO_CONFIRMADO'),
  mensagem: data.status === 'transitorio' ? 'Falha transitória. Preserve a intenção e consulte o resultado antes de retomar.' : 'Ainda não há desfecho persistido. Preserve a chave e retome somente esta mesma intenção.'
 }
 if (['invalido', 'conflito'].includes(String(data.status)) && data.desfechoPersistido === false) return erro(data.status === 'conflito' ? 'conflito' : 'invalido', String(data.codigo ?? 'RESULTADO_NAO_CONFIRMADO'), 'Não há prova de encerramento desta intenção. Preserve a chave e consulte seu resultado; não inicie outra operação.')
 throw new Error('Resposta sem prova de desfecho reconhecível.')
}
function erro(status: 'invalido' | 'conflito', codigo: string, mensagem: string): Resposta044 { return { status, codigo, mensagem } }
