import { eventosMensageria, tagsMensageria, type Contexto, type Tag } from './catalogo'

export type ModeloRascunho = {
  id: string
  nome: string
  eventoCodigo: string
  contexto: Contexto
  texto: string
  atualizadoEm: string
}
export type ProblemaModelo = { codigo: string; mensagem: string; tag?: string }
const matcher = /{{\s*([^{}]*?)\s*}}/g
const tagPorCodigo = new Map(tagsMensageria.map(t => [t.codigo, t]))

export function extrairTags(texto: string): string[] {
  return Array.from(new Set(Array.from(texto.matchAll(matcher), m => m[1].trim())))
}
export function validarModelo(modelo: Pick<ModeloRascunho,'nome'|'eventoCodigo'|'contexto'|'texto'>): ProblemaModelo[] {
  const problemas: ProblemaModelo[] = []
  if (!modelo.nome.trim()) problemas.push({codigo:'NOME_AUSENTE',mensagem:'Informe o nome do modelo.'})
  if (!modelo.texto.trim()) problemas.push({codigo:'TEXTO_AUSENTE',mensagem:'Digite o texto da mensagem.'})
  if (modelo.texto.length > 4096) problemas.push({codigo:'TEXTO_LONGO',mensagem:'O texto não pode ultrapassar 4.096 caracteres neste editor.'})
  if (modelo.texto.replace(matcher,'').includes('{{') || modelo.texto.replace(matcher,'').includes('}}')) {
    problemas.push({codigo:'CHAVES_INVALIDAS',mensagem:'Corrija as tags com chaves incompletas.'})
  }
  const evento = eventosMensageria.find(e=>e.codigo===modelo.eventoCodigo)
  if (!evento || evento.contexto !== modelo.contexto) problemas.push({codigo:'CONTEXTO_EVENTO',mensagem:'Selecione um evento compatível com o contexto.'})
  for (const codigo of extrairTags(modelo.texto)) {
    const tag = tagPorCodigo.get(codigo)
    if (!tag) problemas.push({codigo:'TAG_DESCONHECIDA',tag:codigo,mensagem:`Tag não cadastrada: ${codigo}`})
    else if (!tag.contextos.includes(modelo.contexto)) problemas.push({codigo:'TAG_CONTEXTO',tag:codigo,mensagem:`A tag ${codigo} não pertence ao contexto ${modelo.contexto}.`})
    else if (!tag.disponivel) problemas.push({codigo:'TAG_NAO_CONECTADA',tag:codigo,mensagem:`A tag ${codigo} ainda não está conectada a dados reais.`})
  }
  return problemas
}
export function previaModelo(texto: string, tags: Tag[] = tagsMensageria): string {
  const mapa = new Map(tags.map(t => [t.codigo,t]))
  return texto.replace(matcher,(_match,tag: string)=>{
    const codigo = tag.trim()
    const meta = mapa.get(codigo)
    return !meta ? `[Tag desconhecida: ${codigo}]` :
      !meta.disponivel ? `[Pendente: ${meta.label}]` : meta.exemplo
  })
}
export function criarModelo(base: {nome:string;eventoCodigo:string;contexto:Contexto;texto:string},id: string,agora: string): ModeloRascunho {
  return {...base,id,atualizadoEm:agora}
}
// Rascunhos locais: não armazenar dados reais de clientes nem tokens.
export function lerRascunhosLocal(valor: string | null): ModeloRascunho[] {
  if (!valor) return []
  try {
    const arr: unknown = JSON.parse(valor)
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is ModeloRascunho => {
      if (!x || typeof x!=='object')return false
      const a=x as Partial<ModeloRascunho>
      return typeof a.id==='string' && a.id.length<100 &&
        typeof a.nome==='string' && a.nome.length<200 &&
        typeof a.eventoCodigo==='string' && typeof a.texto==='string' &&
        a.texto.length<=4096 && ['agenda','atendimento','pacotes','contrato','financeiro'].includes(String(a.contexto)) &&
        typeof a.atualizadoEm==='string'
    }).slice(0,100)
  } catch { return [] }
}
