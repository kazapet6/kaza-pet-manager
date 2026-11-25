import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { ocorrenciasDoCiclo, validarDistribuicaoContrato, type ItemRecorrente } from '../_shared/recorrencia-contrato.ts'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from '../_shared/motor/motor.ts'
import { carregarDadosDisponibilidadeComCliente } from '../_shared/motor/supabase.ts'
import { validarJanelaTaxidogContrato } from '../_shared/contrato-venda.ts'
type L = Record<string, unknown>
export async function planejarRenovacao(contrato: L, ciclo: L, dataAncora: string, admin: SupabaseClient): Promise<{ disponivel: boolean; ocorrencias: L[]; motivoRevisao: string | null }> {
  const [{ data: itens, error: ei }, { data: dependencias, error: ed }, { data: funcionario, error: ef }] = await Promise.all([
    admin.from('contrato_itens').select('servico_id,servico_nome_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade').eq('contrato_id', String(contrato.id)),
    admin.from('servico_dependencias').select('servico_id,dependencia_servico_id').eq('ativo', true),
    admin.from('funcionarios').select('id,ativo').eq('id', String(ciclo.funcionario_responsavel_padrao_id)).maybeSingle(),
  ])
  if (ei || ed || ef) throw new Error('Não foi possível carregar a rotina contratada.')
  if (!funcionario?.ativo) throw new Error('O responsável do ciclo precisa de revisão antes de renovar.')
  const recorrentes: ItemRecorrente[] = (itens ?? []).map(x => ({ servicoId: String(x.servico_id), servicoNome: String(x.servico_nome_snapshot), quantidadePorCiclo: Number(x.quantidade_por_ciclo), intervaloQuantidade: Number(x.intervalo_quantidade), intervaloUnidade: x.intervalo_unidade as ItemRecorrente['intervaloUnidade'], offsetInicialQuantidade: Number(x.offset_inicial_quantidade), offsetInicialUnidade: x.offset_inicial_unidade as ItemRecorrente['offsetInicialUnidade'] }))
  const validacao = validarDistribuicaoContrato(recorrentes, (dependencias ?? []).map(x => ({ servicoId: String(x.servico_id), dependenciaServicoId: String(x.dependencia_servico_id) })), dataAncora)
  if (!recorrentes.length || !validacao.valido) throw new Error('A composição contratada exige revisão.')
  const modalidade = ciclo.modalidade_transporte_pretendida === 'taxidog' ? 'taxidog' as const : 'sem_transporte' as const
  const horario = String(ciclo.horario_pretendido).slice(0, 5), [h, m] = horario.split(':').map(Number)
  const ocorrencias: L[] = []
  for (const o of ocorrenciasDoCiclo(recorrentes, dataAncora)) {
    const entrada = { petId: String(contrato.pet_id), servicoIds: o.itens.map(i => i.servicoId), data: o.data, preferenciaFuncionario: 'obrigatorio' as const, funcionarioPreferidoId: String(ciclo.funcionario_responsavel_padrao_id), tipoPlanejamento: 'normal' as const, modalidade, cicloTaxidogId: ciclo.taxidog_ciclo_id_pretendido ? String(ciclo.taxidog_ciclo_id_pretendido) : null }
    const dados = await carregarDadosDisponibilidadeComCliente(entrada, admin)
    const resultado = modalidade === 'taxidog' ? calcularDisponibilidade(entrada, dados) : calcularDisponibilidadeNoHorario(entrada, dados, h * 60 + m)
    if (resultado.erro) throw new Error('O cadastro ou a configuração da Agenda exige revisão.')
    const opcao = resultado.opcoes[0]
    if (!opcao) return { disponivel: false, ocorrencias: [], motivoRevisao: `Sem capacidade para ${o.data}; novo ciclo requer revisão, sem reservas.` }
    if (modalidade === 'taxidog' && !validarJanelaTaxidogContrato(opcao, { taxidogCicloId: entrada.cicloTaxidogId, horarioFixo: horario })) throw new Error('A janela TaxiDog não corresponde à rotina contratada.')
    const pet = dados.pets.find(x => x.id === entrada.petId)
    ocorrencias.push({ ordem: o.ordem, data: o.data, horarioApresentado: hora(opcao.horarioApresentado), inicioOperacional: hora(opcao.inicioOperacional), conclusaoPrevista: hora(opcao.conclusaoPrevista), taxidogCicloId: opcao.cicloTaxidog?.id ?? null, itens: o.itens, plano: { ...opcao, petPorte: pet?.porte, petSexo: pet?.sexo } })
  }
  if (!ocorrencias.length) throw new Error('A rotina não possui ocorrências válidas.')
  return { disponivel: true, ocorrencias, motivoRevisao: null }
}
function hora(v: number) { const n = ((v % 1440) + 1440) % 1440; return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
