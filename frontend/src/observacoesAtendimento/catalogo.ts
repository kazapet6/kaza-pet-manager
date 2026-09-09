export const OCORRENCIAS_ATENDIMENTO = [
  { categoria: 'Comportamento', itens: [
    ['tranquilo', 'Tranquilo'], ['agitado', 'Agitado'], ['medroso', 'Medroso'], ['agressivo', 'Agressivo'],
  ] },
  { categoria: 'Pele e pelagem', itens: [
    ['muitos_nos', 'Muitos nós'], ['pele_avermelhada', 'Pele avermelhada'],
    ['ferida_aparente', 'Ferida aparente'], ['queda_excessiva_pelos', 'Queda excessiva de pelos'],
  ] },
  { categoria: 'Parasitas', itens: [['pulgas', 'Pulgas'], ['carrapatos', 'Carrapatos']] },
  { categoria: 'Cuidados', itens: [
    ['unhas_muito_grandes', 'Unhas muito grandes'], ['ouvido_aspecto_incomum', 'Ouvido com aspecto incomum'],
  ] },
] as const

export const TIPOS_OCORRENCIA = OCORRENCIAS_ATENDIMENTO.flatMap((grupo) => grupo.itens.map(([tipo]) => tipo))
export type TipoOcorrenciaAtendimento = (typeof TIPOS_OCORRENCIA)[number]
export function tipoOcorrencia(valor: unknown): valor is TipoOcorrenciaAtendimento { return typeof valor === 'string' && (TIPOS_OCORRENCIA as readonly string[]).includes(valor) }
