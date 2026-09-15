import { supabase } from '../lib/supabase'
import type { Pet } from '../types/Pet'
import type {
  PoliticaEsperaEtapa,
  RecursoEtapa,
  ServicoModificador,
} from '../types/Agenda'

export type DadosEquipamento = {
  nome: string
  tipo: string
  quantidadeUnidades: number
  separarPorSexo: boolean
  exigeSupervisaoHumana: boolean
  ativo: boolean
}

export type DadosPerfilCapacidade = {
  equipamentoId: string
  nome: string
  ativo: boolean
  capacidades: Record<NonNullable<Pet['porte']>, number>
}

export type DadosFuncionario = {
  nome: string
  ativo: boolean
}

export type DiaJornada = {
  diaSemana: number
  trabalha: boolean
  inicio: string
  fim: string
  possuiIntervalo: boolean
  intervaloInicio: string
  intervaloFim: string
}

export type DadosServico = {
  nome: string
  descricao: string
  precoBase: string
  ativo: boolean
  agendamentoCliente: boolean
}

export type DadosEtapa = {
  servicoId: string
  nome: string
  ordem: number
  duracaoMinutos: number
  recurso: RecursoEtapa
  equipamentoId: string | null
  ativo: boolean
  politicaEsperaAntes: PoliticaEsperaEtapa
  esperaAntesMinutos: number | null
  recursos: {
    tipo: 'funcionario' | 'equipamento'
    equipamentoId: string | null
    quantidade: number
  }[]
}

export type DadosModificador = {
  servicoId: string
  servicoEtapaId: string
  criterio: ServicoModificador['criterio']
  valor: string
  acrescimoMinutos: number
  ativo: boolean
  racaId?: string | null
  porte?: NonNullable<Pet['porte']> | null
  temperamento?: NonNullable<Pet['temperamento']> | null
  pesoMin?: number | null
  pesoMax?: number | null
  pelagem?: NonNullable<Pet['pelagem']> | null
}

export type DadosRegraPreco = {
  servicoId: string
  criterio: 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
  porte?: NonNullable<Pet['porte']> | null
  pelagem?: NonNullable<Pet['pelagem']> | null
  racaId?: string | null
  pesoMin?: number | null
  pesoMax?: number | null
  temperamento?: NonNullable<Pet['temperamento']> | null
  acrescimoValor: string
  ativo: boolean
}

async function verificar(error: { message: string } | null) {
  if (error) throw error
}

export async function salvarEquipamento(dados: DadosEquipamento, id?: string) {
  const registro = {
    nome: dados.nome,
    tipo: dados.tipo,
    quantidade_unidades: dados.quantidadeUnidades,
    separar_por_sexo: dados.separarPorSexo,
    exige_supervisao_humana: dados.exigeSupervisaoHumana,
    ativo: dados.ativo,
  }
  const resultado = id
    ? await supabase.from('equipamentos').update(registro).eq('id', id)
    : await supabase.from('equipamentos').insert(registro)
  await verificar(resultado.error)
}

export async function salvarPerfilCapacidade(
  dados: DadosPerfilCapacidade,
  id?: string,
) {
  const registro = {
    equipamento_id: dados.equipamentoId,
    nome: dados.nome,
    ativo: dados.ativo,
  }
  const resultado = id
    ? await supabase
        .from('equipamento_perfis_capacidade')
        .update(registro)
        .eq('id', id)
        .select('id')
        .single()
    : await supabase
        .from('equipamento_perfis_capacidade')
        .insert(registro)
        .select('id')
        .single()
  await verificar(resultado.error)

  const perfilId = id ?? resultado.data?.id
  if (!perfilId) throw new Error('Perfil de capacidade não identificado.')

  const itens = Object.entries(dados.capacidades).map(([porte, quantidade]) => ({
    perfil_id: perfilId,
    porte,
    quantidade: Math.max(1, quantidade),
    ativo: quantidade > 0,
  }))
  const itensResultado = await supabase
    .from('equipamento_perfil_itens')
    .upsert(itens, { onConflict: 'perfil_id,porte' })
  await verificar(itensResultado.error)
}

export async function salvarFuncionario(dados: DadosFuncionario, id?: string) {
  const resultado = id
    ? await supabase.from('funcionarios').update(dados).eq('id', id).select('id').single()
    : await supabase.from('funcionarios').insert(dados).select('id').single()
  await verificar(resultado.error)
  if (!resultado.data?.id) throw new Error('Funcionário não identificado.')
  return resultado.data.id as string
}

export async function salvarJornadaSemanal(
  funcionarioId: string,
  semana: DiaJornada[],
) {
  const jornada = await supabase.from('funcionario_jornadas').upsert(
    semana.map((dia) => ({
      funcionario_id: funcionarioId,
      dia_semana: dia.diaSemana,
      inicio: dia.inicio,
      fim: dia.fim,
      ativo: dia.trabalha,
    })),
    { onConflict: 'funcionario_id,dia_semana' },
  )
  await verificar(jornada.error)

  const intervalos = await supabase.from('funcionario_intervalos').upsert(
    semana.map((dia) => ({
      funcionario_id: funcionarioId,
      dia_semana: dia.diaSemana,
      inicio: dia.intervaloInicio,
      fim: dia.intervaloFim,
      descricao: 'Intervalo',
      ativo: dia.trabalha && dia.possuiIntervalo,
    })),
    { onConflict: 'funcionario_id,dia_semana' },
  )
  await verificar(intervalos.error)
}

export async function salvarServico(dados: DadosServico, id?: string) {
  const registro = {
    nome: dados.nome,
    descricao: dados.descricao,
    preco_base: dados.precoBase,
    ativo: dados.ativo,
    agendamento_cliente: dados.agendamentoCliente,
  }
  const resultado = id
    ? await supabase.from('servicos').update(registro).eq('id', id).select('id').single()
    : await supabase.from('servicos').insert(registro).select('id').single()
  await verificar(resultado.error)
  if (!resultado.data?.id) throw new Error('Serviço não identificado.')
  return resultado.data.id as string
}

export async function salvarAcoplamentoServico(
  servicoId: string,
  etapaAlvoId: string | null,
) {
  if (etapaAlvoId) {
    const resultado = await supabase.from('servico_acoplamentos').upsert({
      servico_id: servicoId,
      etapa_alvo_id: etapaAlvoId,
      ativo: true,
    }, { onConflict: 'servico_id' })
    await verificar(resultado.error)
    return
  }

  const resultado = await supabase
    .from('servico_acoplamentos')
    .update({ ativo: false })
    .eq('servico_id', servicoId)
  await verificar(resultado.error)
}

export async function salvarEtapa(dados: DadosEtapa, id?: string) {
  const registro = {
    servico_id: dados.servicoId,
    nome: dados.nome,
    ordem: dados.ordem,
    duracao_minutos: dados.duracaoMinutos,
    recurso: dados.recurso,
    equipamento_id: dados.recurso === 'equipamento' ? dados.equipamentoId : null,
    ativo: dados.ativo,
    politica_espera_antes: dados.politicaEsperaAntes,
    espera_antes_minutos:
      dados.politicaEsperaAntes === 'personalizada'
        ? dados.esperaAntesMinutos
        : null,
  }
  const resultado = id
    ? await supabase.from('servico_etapas').update(registro).eq('id', id).select('id').single()
    : await supabase.from('servico_etapas').insert(registro).select('id').single()
  await verificar(resultado.error)

  const etapaId = id ?? resultado.data?.id
  if (!etapaId) throw new Error('Etapa não identificada.')

  const desativacao = await supabase
    .from('servico_etapa_recursos')
    .update({ ativo: false })
    .eq('servico_etapa_id', etapaId)
  await verificar(desativacao.error)

  if (dados.recursos.length === 0) return etapaId

  for (const recurso of dados.recursos) {
    let consulta = supabase
      .from('servico_etapa_recursos')
      .select('id')
      .eq('servico_etapa_id', etapaId)
      .eq('tipo', recurso.tipo)

    consulta = recurso.equipamentoId
      ? consulta.eq('equipamento_id', recurso.equipamentoId)
      : consulta.is('equipamento_id', null)

    const existente = await consulta.maybeSingle()
    await verificar(existente.error)

    const registro = {
      servico_etapa_id: etapaId,
      tipo: recurso.tipo,
      equipamento_id: recurso.equipamentoId,
      quantidade: recurso.quantidade,
      ativo: true,
    }
    const sincronizacao = existente.data?.id
      ? await supabase
          .from('servico_etapa_recursos')
          .update(registro)
          .eq('id', existente.data.id)
      : await supabase.from('servico_etapa_recursos').insert(registro)
    await verificar(sincronizacao.error)
  }

  return etapaId
}

export type ElegibilidadeServico = {
  especies: NonNullable<Pet['especie']>[]
  portes: NonNullable<Pet['porte']>[]
  racasBloqueadas: string[]
  dependencias: string[]
  funcionarios: string[]
}

export async function salvarElegibilidadeServico(
  servicoId: string,
  dados: ElegibilidadeServico,
) {
  const especies = ['cao', 'gato'] as const
  const portes = ['mini', 'pequeno', 'medio', 'grande', 'gigante'] as const

  const resultados = await Promise.all([
    supabase.from('servico_especies').upsert(
      especies.map((especie) => ({
        servico_id: servicoId,
        especie,
        ativo: dados.especies.includes(especie),
      })),
      { onConflict: 'servico_id,especie' },
    ),
    supabase.from('servico_portes').upsert(
      portes.map((porte) => ({
        servico_id: servicoId,
        porte,
        ativo: dados.portes.includes(porte),
      })),
      { onConflict: 'servico_id,porte' },
    ),
  ])
  resultados.forEach((resultado) => { if (resultado.error) throw resultado.error })

  await sincronizarRelacao('servico_racas_bloqueadas', servicoId, 'raca_id', dados.racasBloqueadas)
  await sincronizarRelacao('servico_dependencias', servicoId, 'dependencia_servico_id', dados.dependencias)
  await sincronizarFuncionariosServico(servicoId, dados.funcionarios)
}

async function sincronizarFuncionariosServico(
  servicoId: string,
  funcionariosAtivos: string[],
) {
  if (funcionariosAtivos.length > 0) {
    const ativacao = await supabase.from('funcionario_servicos').upsert(
      funcionariosAtivos.map((funcionarioId) => ({
        funcionario_id: funcionarioId,
        servico_id: servicoId,
        ativo: true,
      })),
      { onConflict: 'funcionario_id,servico_id' },
    )
    await verificar(ativacao.error)
  }

  const existentes = await supabase
    .from('funcionario_servicos')
    .select('funcionario_id')
    .eq('servico_id', servicoId)
    .eq('ativo', true)
  await verificar(existentes.error)

  const removidos = (existentes.data ?? [])
    .map((item) => item.funcionario_id as string)
    .filter((funcionarioId) => !funcionariosAtivos.includes(funcionarioId))
  if (removidos.length === 0) return

  const desativacao = await supabase
    .from('funcionario_servicos')
    .update({ ativo: false })
    .eq('servico_id', servicoId)
    .in('funcionario_id', removidos)
  await verificar(desativacao.error)
}

async function sincronizarRelacao(
  tabela: string,
  servicoId: string,
  coluna: string,
  idsAtivos: string[],
) {
  const desativacao = await supabase.from(tabela).update({ ativo: false }).eq('servico_id', servicoId)
  if (desativacao.error) throw desativacao.error

  if (!idsAtivos.length) return
  const registros = idsAtivos.map((id) => ({ servico_id: servicoId, [coluna]: id, ativo: true }))
  const conflito = tabela === 'servico_racas_bloqueadas'
    ? 'servico_id,raca_id'
    : 'servico_id,dependencia_servico_id'
  const ativacao = await supabase.from(tabela).upsert(registros, { onConflict: conflito })
  if (ativacao.error) throw ativacao.error
}

export async function salvarModificador(dados: DadosModificador, id?: string) {
  const registro = {
    servico_id: dados.servicoId,
    servico_etapa_id: dados.servicoEtapaId,
    criterio: dados.criterio,
    valor: dados.valor,
    acrescimo_minutos: dados.acrescimoMinutos,
    ativo: dados.ativo,
    raca_id: dados.criterio === 'raca' ? dados.racaId : null,
    porte: dados.criterio === 'porte' ? dados.porte : null,
    pelagem: dados.criterio === 'pelagem' ? dados.pelagem : null,
    temperamento: dados.criterio === 'temperamento' ? dados.temperamento : null,
    peso_min: dados.criterio === 'peso' ? dados.pesoMin : null,
    peso_max: dados.criterio === 'peso' ? dados.pesoMax : null,
  }
  const resultado = id
    ? await supabase.from('servico_modificadores').update(registro).eq('id', id)
    : await supabase.from('servico_modificadores').insert(registro)
  await verificar(resultado.error)
}

export async function salvarRegraPreco(dados: DadosRegraPreco, id?: string) {
  const registro = {
    servico_id: dados.servicoId,
    criterio: dados.criterio,
    porte: dados.criterio === 'porte' ? dados.porte : null,
    pelagem: dados.criterio === 'pelagem' ? dados.pelagem : null,
    raca_id: dados.criterio === 'raca' ? dados.racaId : null,
    peso_min: dados.criterio === 'peso' ? dados.pesoMin : null,
    peso_max: dados.criterio === 'peso' ? dados.pesoMax : null,
    temperamento: dados.criterio === 'temperamento' ? dados.temperamento : null,
    acrescimo_valor: dados.acrescimoValor,
    ativo: dados.ativo,
  }
  const resultado = id
    ? await supabase.from('servico_regras_preco').update(registro).eq('id', id)
    : await supabase.from('servico_regras_preco').insert(registro)
  await verificar(resultado.error)
}

export async function salvarAjustePrecoFixo(
  servicoId: string,
  criterio: 'porte' | 'pelagem' | 'temperamento',
  valor: string,
  acrescimoValor: string,
) {
  const coluna = criterio
  const existentes = await supabase
    .from('servico_regras_preco')
    .select('id')
    .eq('servico_id', servicoId)
    .eq('criterio', criterio)
    .eq(coluna, valor)
    .order('created_at')
  await verificar(existentes.error)

  const principal = existentes.data?.[0]
  if (principal) {
    const atualizacao = await supabase
      .from('servico_regras_preco')
      .update({ acrescimo_valor: acrescimoValor, ativo: true })
      .eq('id', principal.id)
    await verificar(atualizacao.error)

    const duplicados = existentes.data?.slice(1).map((item) => item.id) ?? []
    if (duplicados.length) {
      const desativacao = await supabase
        .from('servico_regras_preco')
        .update({ ativo: false })
        .in('id', duplicados)
      await verificar(desativacao.error)
    }
    return
  }

  await salvarRegraPreco({
    servicoId,
    criterio,
    porte: criterio === 'porte' ? valor as NonNullable<Pet['porte']> : null,
    pelagem: criterio === 'pelagem' ? valor as NonNullable<Pet['pelagem']> : null,
    temperamento: criterio === 'temperamento' ? valor as NonNullable<Pet['temperamento']> : null,
    acrescimoValor,
    ativo: true,
  })
}

export async function desativarRegraPreco(id: string) {
  const resultado = await supabase
    .from('servico_regras_preco')
    .update({ ativo: false })
    .eq('id', id)
  await verificar(resultado.error)
}

export async function salvarAjustePrecoRaca(
  servicoId: string,
  racaId: string,
  acrescimoValor: string,
) {
  const existentes = await supabase
    .from('servico_regras_preco')
    .select('id')
    .eq('servico_id', servicoId)
    .eq('criterio', 'raca')
    .eq('raca_id', racaId)
    .order('created_at')
  await verificar(existentes.error)

  const principal = existentes.data?.[0]
  if (!principal) {
    await salvarRegraPreco({
      servicoId,
      criterio: 'raca',
      racaId,
      acrescimoValor,
      ativo: true,
    })
    return
  }

  const atualizacao = await supabase
    .from('servico_regras_preco')
    .update({ acrescimo_valor: acrescimoValor, ativo: true })
    .eq('id', principal.id)
  await verificar(atualizacao.error)

  const duplicados = existentes.data?.slice(1).map((item) => item.id) ?? []
  if (duplicados.length) {
    const desativacao = await supabase
      .from('servico_regras_preco')
      .update({ ativo: false })
      .in('id', duplicados)
    await verificar(desativacao.error)
  }
}

export async function salvarAjustePrecoPeso(
  servicoId: string,
  pesoMin: number,
  pesoMax: number,
  acrescimoValor: string,
) {
  const existentes = await supabase
    .from('servico_regras_preco')
    .select('id')
    .eq('servico_id', servicoId)
    .eq('criterio', 'peso')
    .eq('peso_min', pesoMin)
    .eq('peso_max', pesoMax)
    .order('created_at')
  await verificar(existentes.error)

  const principal = existentes.data?.[0]
  if (!principal) {
    await salvarRegraPreco({
      servicoId,
      criterio: 'peso',
      pesoMin,
      pesoMax,
      acrescimoValor,
      ativo: true,
    })
    return
  }

  const atualizacao = await supabase
    .from('servico_regras_preco')
    .update({ acrescimo_valor: acrescimoValor, ativo: true })
    .eq('id', principal.id)
  await verificar(atualizacao.error)

  const duplicados = existentes.data?.slice(1).map((item) => item.id) ?? []
  if (duplicados.length) {
    const desativacao = await supabase
      .from('servico_regras_preco')
      .update({ ativo: false })
      .in('id', duplicados)
    await verificar(desativacao.error)
  }
}

export async function configurarFuncionarioEtapa(
  funcionarioId: string,
  servicoEtapaId: string,
  ativo: boolean,
) {
  const { error } = await supabase.from('funcionario_etapas').upsert(
    {
      funcionario_id: funcionarioId,
      servico_etapa_id: servicoEtapaId,
      ativo,
    },
    { onConflict: 'funcionario_id,servico_etapa_id' },
  )
  await verificar(error)
}
