import { mapearEnum, normalizar, resolverRaca, type RacaImportacao } from './csv.ts'
import { OPCOES, validarLote, type Linha, type Lote } from './modelo.ts'

export const CAMPOS_GRUPO = {raca_id:'Raça',especie:'Espécie',sexo:'Sexo',porte:'Porte',pelagem:'Pelagem',temperamento:'Temperamento',castrado:'Castrado'} as const
export type CampoGrupo = keyof typeof CAMPOS_GRUPO
const origem:Record<CampoGrupo,string>={raca_id:'raca',especie:'especie',sexo:'genero',porte:'tamanho',pelagem:'pelo',temperamento:'comportamento',castrado:'castrado'}
export type Grupo = {chave:string; campo:CampoGrupo; originais:string[]; especiesOriginais:string[]; pets:Linha[]; vazio:boolean; resolvidos:number; destino:string}
export function editavel(p:Linha){return !p.internal_id&&p.decisao_operador==='importar'}
function chave(p:Linha,c:CampoGrupo){return JSON.stringify([c,c==='raca_id'?normalizar(p.original.especie||''):'',normalizar(p.original[origem[c]]||'')])}
export function valorValido(p:Linha,c:CampoGrupo,racas:RacaImportacao[]){const v=p.resolvido[c];return c==='raca_id'?racas.some(r=>r.id===v&&r.ativo&&r.nome.trim()!=='2'&&r.especie===p.resolvido.especie):c==='castrado'?typeof v==='boolean':OPCOES[c].includes(String(v||''))}
export function agruparValores(l:Lote,c:CampoGrupo,racas:RacaImportacao[]):Grupo[]{
  const mapa=new Map<string,Linha[]>()
  for(const p of l.pets.filter(editavel)){const k=chave(p,c);mapa.set(k,[...(mapa.get(k)||[]),p])}
  return [...mapa].map(([k,pets])=>{const destinos=[...new Set(pets.map(p=>p.resolvido[c]))];return {chave:k,campo:c,pets,
    originais:[...new Set(pets.map(p=>p.original[origem[c]]||''))],especiesOriginais:[...new Set(pets.map(p=>p.original.especie||''))],
    vazio:!normalizar(pets[0].original[origem[c]]||''),resolvidos:pets.filter(p=>valorValido(p,c,racas)).length,
    destino:destinos.length===1&&destinos[0]!==null&&destinos[0]!==undefined?String(destinos[0]):'Misto / pendente'}}).sort((a,b)=>b.pets.length-a.pets.length||a.chave.localeCompare(b.chave))
}
export function sugestaoGrupo(g:Grupo,racas:RacaImportacao[]):string|boolean|null {
  if(g.vazio)return null
  if(g.campo==='raca_id'){
    const especies=[...new Set(g.pets.map(p=>p.resolvido.especie))]
    return especies.length===1?resolverRaca(g.originais[0],especies[0] as string|null,racas):null
  }
  return mapearEnum(origem[g.campo],g.originais[0])
}
// Função pura: muda somente a revisão do lote; não possui cliente Supabase ou RPC.
export function aplicarGrupo(l:Lote,c:CampoGrupo,k:string,destino:string|boolean|null,racas:RacaImportacao[],selecionados?:string[]):Lote {
  if(['concluido','cancelado'].includes(l.status))throw new Error('Lote encerrado não pode ser revisado.')
  const g=agruparValores(l,c,racas).find(x=>x.chave===k)
  if(!g)throw new Error('Grupo mudou. Atualize a seleção.')
  if(g.vazio&&!selecionados)throw new Error('Valor vazio exige seleção explícita dos pets.')
  const ids=new Set(selecionados??g.pets.map(p=>p.external_id))
  if(!ids.size)throw new Error('Selecione pelo menos um pet.')
  if([...ids].some(id=>!g.pets.some(p=>p.external_id===id)))throw new Error('Seleção contém pet fora do grupo editável.')
  if(destino!==null){
    if(c==='castrado'?typeof destino!=='boolean':c!=='raca_id'&&!OPCOES[c].includes(String(destino)))throw new Error('Destino inválido.')
    if(c==='raca_id'&&g.pets.some(p=>ids.has(p.external_id)&&!racas.some(r=>r.id===destino&&r.ativo&&r.nome.trim()!=='2'&&r.especie===p.resolvido.especie)))throw new Error('Resolva a espécie dos selecionados e escolha uma raça ativa dessa espécie.')
  }
  return validarLote({...l,pets:l.pets.map(p=>ids.has(p.external_id)?{...p,resolvido:{...p.resolvido,[c]:destino,...(c==='especie'&&p.resolvido.especie!==destino?{raca_id:null}:{})}}:p)},racas)
}
export function aplicarInequivocas(l:Lote,racas:RacaImportacao[]):Lote {
  let atual=l
  for(const c of ['especie','sexo','porte','pelagem','temperamento','castrado','raca_id'] as CampoGrupo[]){
    for(const g of agruparValores(atual,c,racas)){
      const v=sugestaoGrupo(g,racas),ids=g.pets.filter(p=>p.resolvido[c]===null||p.resolvido[c]===undefined||p.resolvido[c]==='').map(p=>p.external_id)
      if(v!==null&&ids.length)atual=aplicarGrupo(atual,c,g.chave,v,racas,ids)
    }
  }
  return atual
}
export function contarCampos(l:Lote,racas:RacaImportacao[]){return Object.fromEntries((Object.keys(CAMPOS_GRUPO) as CampoGrupo[]).map(c=>[c,l.pets.filter(p=>editavel(p)&&!valorValido(p,c,racas)).length])) as Record<CampoGrupo,number>}
