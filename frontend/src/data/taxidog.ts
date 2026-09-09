import { supabase } from '../lib/supabase'

export type DadosCicloTaxidog = {
  nome: string
  ordem: number
  coletaInicio: string
  coletaFim: string
  conclusaoLimite: string
  ativo: boolean
  diasSemana: number[]
}

export function validarCicloTaxidog(dados: DadosCicloTaxidog) {
  if (!dados.nome.trim()) return 'Informe o nome do ciclo.'
  if (!Number.isInteger(dados.ordem) || dados.ordem <= 0) return 'A ordem deve ser um número inteiro positivo.'
  if (!dados.coletaInicio || !dados.coletaFim) return 'Informe o início e o fim da coleta.'
  if (dados.coletaFim <= dados.coletaInicio) return 'O fim da coleta deve ser posterior ao início.'
  if (!dados.conclusaoLimite) return 'Informe até que horário os pets precisam estar prontos.'
  if (dados.conclusaoLimite < dados.coletaFim) return 'O limite de conclusão não pode ser anterior ao fim da coleta.'
  if (!dados.diasSemana.length) return 'Selecione pelo menos um dia da semana.'
  return null
}

export async function salvarCicloTaxidog(dados: DadosCicloTaxidog, id?: string) {
  const erroValidacao = validarCicloTaxidog(dados)
  if (erroValidacao) throw new Error(erroValidacao)

  const registro = {
    nome: dados.nome.trim(),
    ordem: dados.ordem,
    coleta_inicio: dados.coletaInicio,
    coleta_fim: dados.coletaFim,
    conclusao_limite: dados.conclusaoLimite,
    ativo: dados.ativo,
  }
  const consulta = id
    ? supabase.from('taxidog_ciclos').update(registro).eq('id', id).select('id').single()
    : supabase.from('taxidog_ciclos').insert(registro).select('id').single()
  const { data, error } = await consulta
  if (error) throw error

  const cicloId = id ?? data.id
  const dias = Array.from({ length: 7 }, (_, diaSemana) => ({
    ciclo_id: cicloId,
    dia_semana: diaSemana,
    ativo: dados.diasSemana.includes(diaSemana),
  }))
  const resultadoDias = await supabase.from('taxidog_ciclo_dias').upsert(dias, {
    onConflict: 'ciclo_id,dia_semana',
  })
  if (resultadoDias.error) {
    throw new Error(`O ciclo foi salvo, mas os dias não foram concluídos: ${resultadoDias.error.message}`)
  }
  return cicloId
}
