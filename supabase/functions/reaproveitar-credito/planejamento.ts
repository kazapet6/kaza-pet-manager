import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import type { ConfirmacaoAgendamentoIntent } from '../_shared/confirmacao/contrato.ts'
import { calcularHashIntencao } from '../_shared/confirmacao/contrato.ts'
import { montarPlanoConfirmacaoRpc, diagnosticarInvariantesPlanoConfirmacao } from '../_shared/confirmacao/plano.ts'
import { carregarDadosDisponibilidadeComCliente } from '../_shared/motor/supabase.ts'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from '../_shared/motor/motor.ts'
import { carregarDadosPrecificacaoComCliente } from '../_shared/motor/precificacaoSupabase.ts'
import { calcularPrecificacao } from '../_shared/motor/precificacao.ts'
import { funcionarioResponsavelDaOpcao } from '../_shared/motor/responsavel.ts'
import type { SolicitarReaproveitamento044 } from '../_shared/reaproveitamento-044.ts'
export async function planejar044(i: SolicitarReaproveitamento044 & { chaveIdempotencia: string }, petId: string, ciclo: Record<string, unknown>, servicoIds: string[], admin: SupabaseClient) {
 const [{ data: config, error: ec }, { data: ocupacao, error: eo }] = await Promise.all([admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single(), admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single()])
 if (ec || eo || !config || !ocupacao) throw new Error('Versões da Agenda indisponíveis.')
 const modalidade = ciclo.modalidade_transporte_pretendida === 'taxidog' ? 'taxidog' as const : 'sem_transporte' as const
 const [h, m] = i.horario.split(':').map(Number)
 const intencao: ConfirmacaoAgendamentoIntent = { chaveIdempotencia: i.chaveIdempotencia, petId, servicoIds, data: i.data, horarioEscolhido: modalidade === 'sem_transporte' ? h * 60 + m : null, modalidade, cicloTaxidogId: ciclo.taxidog_ciclo_id_pretendido ? String(ciclo.taxidog_ciclo_id_pretendido) : null, preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: i.funcionarioResponsavelId, funcionarioResponsavelId: i.funcionarioResponsavelId, versaoConfiguracaoConsultada: Number(config.versao), versaoOcupacaoConsultada: Number(ocupacao.versao) }
 const entrada = { petId, servicoIds, data: i.data, preferenciaFuncionario: 'obrigatorio' as const, funcionarioPreferidoId: i.funcionarioResponsavelId, tipoPlanejamento: 'normal' as const, modalidade, cicloTaxidogId: intencao.cicloTaxidogId }
 const [dados, precos] = await Promise.all([carregarDadosDisponibilidadeComCliente(entrada, admin), carregarDadosPrecificacaoComCliente(petId, admin)])
 const resultado = modalidade === 'taxidog' ? calcularDisponibilidade(entrada, dados) : calcularDisponibilidadeNoHorario(entrada, dados, h * 60 + m)
 const opcao = resultado.opcoes[0]
 if (resultado.erro || !opcao || funcionarioResponsavelDaOpcao(opcao) !== i.funcionarioResponsavelId || (modalidade === 'taxidog' && opcao.cicloTaxidog?.coletaInicio !== h * 60 + m)) return null
 const plano = montarPlanoConfirmacaoRpc(intencao, dados, opcao, calcularPrecificacao(precos.pet, opcao.servicos, precos.dados), await calcularHashIntencao(intencao))
 if (diagnosticarInvariantesPlanoConfirmacao(plano).length) throw new Error('Plano inválido.')
 const [{ data: c, error: eca }, { data: o, error: eoa }] = await Promise.all([admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single(), admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single()])
 if (eca || eoa) throw new Error('Agenda indisponível.')
 if (Number(c?.versao) !== Number(config.versao) || Number(o?.versao) !== Number(ocupacao.versao)) return null
 return { plano, ocupacaoAgendaVersao: Number(ocupacao.versao) }
}
