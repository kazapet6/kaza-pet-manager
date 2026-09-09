export type CicloComDias = {
  id: string
  ativo: boolean
  diasSemana: number[]
}

export function diaSemanaData(data: string) {
  return new Date(`${data}T12:00:00Z`).getUTCDay()
}

export function ciclosAtivosNaData<T extends CicloComDias>(ciclos: T[], data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return []
  const dia = diaSemanaData(data)
  return ciclos.filter((ciclo) => ciclo.ativo && ciclo.diasSemana.includes(dia))
}
