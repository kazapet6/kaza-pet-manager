import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from '../_shared/motor/motor.ts'
import { carregarDadosDisponibilidadeComCliente } from '../_shared/motor/supabase.ts'
import { calcularHashRemarcacao, type RemarcacaoIntent } from '../../../frontend/src/remarcacao/contrato.ts'
import { montarPlanoRemarcacaoRpc } from '../../../frontend/src/remarcacao/plano.ts'
import type { AlterarStatusIntent, AlterarStatusResposta } from '../_shared/status-atendimento.ts'

type Pulo = Extract<AlterarStatusIntent, { acao: 'pular_banho' }>
type Alvo = { ordem: number; ocorrenciaId: string; atendimentoId: string; grupoId: string; petId: string; status: 'agendado' | 'confirmado'; inicioEsperado: string; responsavelAtual: string | null; dataAnterior: string; dataNova: string }
type Contexto = { status: 'planejado'; cicloId: string; contratoId: string; modalidade: string; horarioFixo: string; cicloTaxidogId: string | null; responsavelPadrao: string; configuracaoVersao: number; ocupacaoVersao: number; alvos: Alvo[] }
const indisponivel = (mensagem: string): AlterarStatusResposta => ({ status: 'invalido', codigo: 'PULO_INDISPONIVEL', mensagem })
async function chaveEstavel(valor: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor)))
  hash[6] = (hash[6] & 0x0f) | 0x40
  hash[8] = (hash[8] & 0x3f) | 0x80
  const h = Array.from(hash.slice(0,16), b => b.toString(16).padStart(2,'0')).join('')
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)
}
export async function pularCicloComMotor(intencao: Pulo, usuarioId: string, autorizado: boolean, admin: SupabaseClient): Promise<AlterarStatusResposta> {
  if (!intencao.inicioOperacionalEsperado || !Number.isFinite(Date.parse(intencao.inicioOperacionalEsperado))) return indisponivel('Atualize a Agenda para utilizar o novo pulo de banho.')
  const inicio = new Date(intencao.inicioOperacionalEsperado).toISOString()
  const chave = await chaveEstavel('pulo:059:'+intencao.atendimentoId+':'+inicio)
  const argumentos = { p_atendimento_id: intencao.atendimentoId, p_usuario_id: usuarioId, p_inicio_esperado: inicio, p_autorizado: autorizado }
  const confirmar = async (contexto: unknown, planos: unknown[]) => {
    const { data, error } = await admin.rpc('confirmar_pulo_ciclo_059', { ...argumentos, p_chave: chave, p_motivo: intencao.motivo, p_contexto: contexto, p_planos: planos })
    if (error) throw error
    return data as AlterarStatusResposta
  }
  // Se a mesma operação já foi confirmada, devolver o recibo sem mover novamente.
  const recibo = await admin.from('contrato_eventos').select('id').eq('tipo','banho_pulado').eq('detalhes->>chaveIdempotencia',chave).maybeSingle()
  if (recibo.error) throw recibo.error
  if (recibo.data) return confirmar({},[])
  const { data, error } = await admin.rpc('planejar_pulo_ciclo_059', argumentos)
  if (error) throw error
  if (data?.status !== 'planejado') return data as AlterarStatusResposta
  const ctx = data as Contexto
  if (!ctx.responsavelPadrao || !ctx.alvos.length || ctx.alvos[0].status !== intencao.statusEsperado) return indisponivel('A rotina foi alterada. Atualize a Agenda.')
  const ids = ctx.alvos.map(a => a.atendimentoId)
  if (new Set(ctx.alvos.map(a => a.dataNova)).size !== ctx.alvos.length) return indisponivel('A sequência contém datas sobrepostas.')
  const modalidade = ctx.modalidade === 'taxidog' ? 'taxidog' as const : 'sem_transporte' as const
  const [h,m] = ctx.horarioFixo.split(':').map(Number)
  const horario = h*60+m
  const planos = []
  for (const alvo of ctx.alvos) {
    const servicos = await admin.from('atendimento_servicos').select('id,servico_id,origem').eq('atendimento_id',alvo.atendimentoId).eq('ativo',true)
    if (servicos.error) throw servicos.error
    const mapa = new Map<string,string>((servicos.data ?? []).map(s => [String(s.servico_id),String(s.id)]))
    const solicitados = (servicos.data ?? []).filter(s => s.origem==='solicitado').map(s => String(s.servico_id))
    const entrada = { petId: alvo.petId, servicoIds: solicitados, data: alvo.dataNova,
      preferenciaFuncionario:'obrigatorio' as const, funcionarioPreferidoId:ctx.responsavelPadrao,
      tipoPlanejamento:'normal' as const, modalidade, cicloTaxidogId: modalidade==='taxidog'?ctx.cicloTaxidogId:null }
    const dados = await carregarDadosDisponibilidadeComCliente(entrada,admin,undefined,ids)
    const resultado = modalidade==='taxidog' ? calcularDisponibilidade(entrada,dados) : calcularDisponibilidadeNoHorario(entrada,dados,horario)
    const opcao = resultado.opcoes[0]
    if (!opcao || opcao.servicos.length!==mapa.size || opcao.servicos.some(s=>!mapa.has(s.id)) ||
      (modalidade==='taxidog' && opcao.cicloTaxidog?.coletaInicio!==horario)) {
      return indisponivel('Não há disponibilidade para toda a sequência em '+alvo.dataNova+'. Nenhum atendimento foi alterado.')
    }
    const remarcacao: RemarcacaoIntent = {
      chaveIdempotencia: await chaveEstavel(chave+':'+alvo.atendimentoId), atendimentoId: alvo.atendimentoId,
      grupoAgendamentoIdEsperado: alvo.grupoId, statusEsperado: alvo.status,
      inicioOperacionalEsperado: alvo.inicioEsperado, funcionarioResponsavelIdEsperado: alvo.responsavelAtual,
      funcionarioResponsavelId:ctx.responsavelPadrao, data:alvo.dataNova,
      horarioEscolhido:modalidade==='taxidog'?null:horario, modalidade, cicloTaxidogId:entrada.cicloTaxidogId,
      versaoConfiguracaoConsultada:ctx.configuracaoVersao, versaoOcupacaoConsultada:ctx.ocupacaoVersao
    }
    const plano = montarPlanoRemarcacaoRpc(remarcacao,dados,opcao,mapa,await calcularHashRemarcacao(remarcacao))
    planos.push({ ...plano, planoMotor:{...opcao,petPorte:dados.pets[0].porte,petSexo:dados.pets[0].sexo} })
  }
  return confirmar(ctx,planos)
}
