import { supabase } from '../lib/supabase'

export type BlocoEstabelecimento = {
  id: string
  diaSemana: number
  inicio: string
  fim: string
  ativo: boolean
}

export type DiaFuncionamento = {
  diaSemana: number
  aberto: boolean
  inicio: string
  fim: string
}

type BlocoRow = {
  id: string
  dia_semana: number
  inicio: string
  fim: string
  ativo: boolean
}

export const semanaSugerida: DiaFuncionamento[] = [
  { diaSemana: 1, aberto: false, inicio: '09:00', fim: '18:00' },
  { diaSemana: 2, aberto: true, inicio: '09:00', fim: '18:00' },
  { diaSemana: 3, aberto: true, inicio: '09:00', fim: '18:00' },
  { diaSemana: 4, aberto: true, inicio: '09:00', fim: '18:00' },
  { diaSemana: 5, aberto: true, inicio: '09:00', fim: '18:00' },
  { diaSemana: 6, aberto: true, inicio: '09:00', fim: '18:00' },
  { diaSemana: 0, aberto: false, inicio: '09:00', fim: '18:00' },
]

export async function carregarBlocosEstabelecimento() {
  const { data, error } = await supabase
    .from('estabelecimento_blocos')
    .select('id, dia_semana, inicio, fim, ativo')
    .order('dia_semana')
    .order('inicio')

  if (error) throw error

  return (data as BlocoRow[]).map(paraBloco)
}

export function montarSemana(blocos: BlocoEstabelecimento[]) {
  if (blocos.length === 0) {
    return semanaSugerida.map((dia) => ({ ...dia }))
  }

  return semanaSugerida.map((sugestao) => {
    const blocosDoDia = blocos.filter(
      (item) => item.diaSemana === sugestao.diaSemana,
    )
    const blocoAtivo = blocosDoDia.find((item) => item.ativo)
    const bloco = blocoAtivo ?? blocosDoDia[0]

    return bloco
      ? {
          diaSemana: sugestao.diaSemana,
          aberto: Boolean(blocoAtivo),
          inicio: normalizarHora(bloco.inicio),
          fim: normalizarHora(bloco.fim),
        }
      : { ...sugestao, aberto: false }
  })
}

export function validarSemana(semana: DiaFuncionamento[]) {
  for (const dia of semana) {
    if (!dia.aberto) continue
    if (!dia.inicio || !dia.fim) return 'Informe abertura e fechamento.'
    if (dia.fim <= dia.inicio) {
      return 'O horário de fechamento deve ser posterior ao de abertura.'
    }
  }

  return null
}

export async function salvarFuncionamentoSemanal(
  semana: DiaFuncionamento[],
  blocosAtuais: BlocoEstabelecimento[],
) {
  const erroValidacao = validarSemana(semana)
  if (erroValidacao) throw new Error(erroValidacao)

  for (const dia of semana) {
    const existentes = blocosAtuais.filter(
      (bloco) => bloco.diaSemana === dia.diaSemana,
    )

    if (!dia.aberto) {
      await desativarBlocos(existentes.filter((bloco) => bloco.ativo).map((bloco) => bloco.id))
      continue
    }

    const inicio = normalizarHora(dia.inicio)
    const fim = normalizarHora(dia.fim)
    const correspondente = existentes.find(
      (bloco) =>
        normalizarHora(bloco.inicio) === inicio &&
        normalizarHora(bloco.fim) === fim,
    )
    const principal = correspondente ?? existentes[0]

    if (principal) {
      const { error } = await supabase
        .from('estabelecimento_blocos')
        .update({ inicio, fim, ativo: true })
        .eq('id', principal.id)

      if (error) throw error
    } else {
      const { error } = await supabase.from('estabelecimento_blocos').insert({
        dia_semana: dia.diaSemana,
        inicio,
        fim,
        ativo: true,
      })

      if (error) throw error
    }

    await desativarBlocos(
      existentes
        .filter((bloco) => bloco.id !== principal?.id && bloco.id !== correspondente?.id)
        .filter((bloco) => bloco.ativo)
        .map((bloco) => bloco.id),
    )
  }
}

async function desativarBlocos(ids: string[]) {
  if (ids.length === 0) return

  const { error } = await supabase
    .from('estabelecimento_blocos')
    .update({ ativo: false })
    .in('id', ids)

  if (error) throw error
}

function paraBloco(row: BlocoRow): BlocoEstabelecimento {
  return {
    id: row.id,
    diaSemana: row.dia_semana,
    inicio: normalizarHora(row.inicio),
    fim: normalizarHora(row.fim),
    ativo: row.ativo,
  }
}

function normalizarHora(hora: string) {
  return hora.slice(0, 5)
}
