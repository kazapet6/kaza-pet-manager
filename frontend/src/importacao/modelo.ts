import { analisarVinculosDuplicidades, CAMPOS_CLIENTES, CAMPOS_PETS, lerCSV, mapearEnum, resolverRaca, type RacaImportacao } from './csv.ts'

export type Valores = Record<string, string | boolean | null>
export type Linha = {
  external_id: string; linha_original: number; original: Record<string,string>; resolvido: Valores
  decisao_operador: 'importar' | 'ignorar' | 'existente'; internal_id: string | null
  erros: string[]; avisos: string[]; status_validacao?: string
}
export type Lote = { id: string; origem: string; revisao: number; status: string; arquivos: string[]; clientes: Linha[]; pets: Linha[]; resultado?: Record<string,number> }
export const CAMPOS_CADASTRO = ['nome','whatsapp','email','cpf','cep','endereco','numero','bairro','complemento','cidade','estado','data_nascimento','observacoes']
export const CAMPOS_PERFIL = ['nome','especie','raca_id','sexo','porte','pelagem','temperamento','castrado','data_nascimento','peso','cor','observacoes']
export const OPCOES: Record<string,string[]> = { especie:['cao','gato'],sexo:['macho','femea'],porte:['mini','pequeno','medio','grande','gigante'],pelagem:['curta','media','longa'],temperamento:['calmo','moderado','dificil'] }
export function dataValida(v: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v }
function dataOriginal(v: string) { if (!v) return ''; if(dataValida(v)) return v; if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v) && dataValida(v.slice(0,10))) return v.slice(0,10); return v }
export function analisarArquivos(clientesTexto:string,petsTexto:string,racas:RacaImportacao[],origem:string,arquivos:string[]):Lote {
  const cs=lerCSV(clientesTexto,CAMPOS_CLIENTES), ps=lerCSV(petsTexto,CAMPOS_PETS)
  if(!cs.length||!ps.length) throw new Error('Os arquivos precisam conter registros de clientes e pets.')
  if(cs.some(c=>!('telefone' in c.valores))||ps.some(p=>!('especie' in p.valores)||!('raca' in p.valores))) throw new Error('Cabeçalhos incompatíveis: Clientes precisa de telefone; Pets precisa de clienteId, espécie e raça nos campos especie e raca.')
  const a=analisarVinculosDuplicidades(cs,ps)
  const montar=(tipo:'clientes'|'pets', linha:typeof cs[number]):Linha=>{
    const o=linha.valores, r:Valores={nome:o.nome||'',observacoes:o.observacoes||''}
    if(tipo==='clientes') {
      for(const c of CAMPOS_CADASTRO) r[c]=o[c]||''
      r.whatsapp=o.telefone||''; r.data_nascimento=dataOriginal(o.dataNascimento||'')
    } else {
      for(const [dest,src] of Object.entries({especie:'especie',sexo:'genero',porte:'tamanho',pelagem:'pelo',temperamento:'comportamento',castrado:'castrado'})) r[dest]=mapearEnum(src,o[src]||'')
      r.raca_id=resolverRaca(o.raca||'',r.especie as string|null,racas)
      r.data_nascimento=dataOriginal(o.nascimento||'');r.peso=(o.peso||'').replace(',','.');r.cor=o.cor||''
    }
    return {external_id:o.id||'',linha_original:linha.linha,original:o,resolvido:r,decisao_operador:'importar',internal_id:null,
      erros:a.avisos.filter(x=>x.tipo===tipo&&x.linha===linha.linha&&x.bloqueante).map(x=>x.codigo),
      avisos:[...a.avisos.filter(x=>x.tipo===tipo&&x.linha===linha.linha&&!x.bloqueante).map(x=>x.campo+': '+x.codigo),
        ...(tipo==='pets'&&['inativo','bloqueado'].includes((o.situacao||'').toLowerCase())?['Situação histórica sem campo operacional: revise a decisão de importar ou ignorar.']:[])]}
  }
  return validarLote({id:crypto.randomUUID(),origem:origem.trim(),revisao:0,status:'rascunho',arquivos,clientes:cs.map(l=>montar('clientes',l)),pets:ps.map(l=>montar('pets',l))},racas)
}
export function validarLote(lote:Lote,racas:RacaImportacao[]):Lote {
  const base=(l:Linha,tipo:'cliente'|'pet'):Linha=>{
    const erros:string[]=[];const r=l.resolvido
    if(!l.external_id.trim()) erros.push('ID externo ausente')
    if(l.decisao_operador==='ignorar'||l.internal_id) return {...l,erros}
    if(l.decisao_operador==='existente') {if(!String(r.existente_id||'').match(tipo==='cliente'?/^CLI-\d{6,}$/:/^PET-\d{6,}$/)) erros.push('Informe o ID interno existente');return {...l,erros}}
    if(!String(r.nome||'').trim()) erros.push('Nome obrigatório')
    if(tipo==='cliente') { if(!String(r.whatsapp||'').replace(/\D/g,'')) erros.push('WhatsApp pendente') }
    else {
      for(const [k,vs] of Object.entries(OPCOES)) if(!vs.includes(String(r[k]||''))) erros.push(`${k} pendente`)
      if(typeof r.castrado!=='boolean') erros.push('castrado pendente')
      if(!racas.some(x=>x.id===r.raca_id&&x.ativo&&x.especie===r.especie&&x.nome.trim()!=='2')) erros.push('raça pendente')
      if(r.peso && (!/^\d+(\.\d{1,2})?$/.test(String(r.peso))||Number(r.peso)>99999.99)) erros.push('Peso inválido')
    }
    if(r.data_nascimento&&!dataValida(String(r.data_nascimento))) erros.push('Nascimento inválido: use AAAA-MM-DD')
    return {...l,erros}
  }
  const clientes=lote.clientes.map(l=>base(l,'cliente')), pets=lote.pets.map(l=>base(l,'pet'))
  for(const linhas of [clientes,pets]) for(const l of linhas) if(linhas.filter(x=>x.external_id===l.external_id).length>1) l.erros.push('ID externo duplicado')
  for(const p of pets) {
    if(p.decisao_operador==='ignorar'||p.internal_id)continue
    const cs=clientes.filter(c=>c.external_id===p.original.clienteId)
    if(cs.length!==1||cs[0].decisao_operador==='ignorar'||cs[0].erros.length) p.erros.push('Tutor pendente: resolver cliente do ID externo')
  }
  return {...lote,clientes,pets}
}
export function resumo(l:Lote) {
  const pend=(a:Linha[])=>a.filter(x=>x.decisao_operador!=='ignorar'&&!x.internal_id&&x.erros.length>0).length
  const pronto=(a:Linha[])=>a.filter(x=>x.decisao_operador!=='ignorar'&&!x.internal_id&&!x.erros.length).length
  return {clientes:l.clientes.length,pets:l.pets.length,vinculos:l.pets.filter(p=>l.clientes.filter(c=>c.external_id===p.original.clienteId).length===1).length,
    clientesPendentes:pend(l.clientes),petsPendentes:pend(l.pets),clientesProntos:pronto(l.clientes),petsProntos:pronto(l.pets),
    racasPendentes:l.pets.filter(p=>p.erros.includes('raça pendente')).length,duplicidades:[...l.clientes,...l.pets].filter(x=>x.avisos.some(a=>a.includes('DUPLICIDADE'))).length,
    jaImportados:[...l.clientes,...l.pets].filter(x=>x.internal_id).length}
}
export function exportarPendencias(l:Lote) {
  const cel=(s:string)=>'"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"'
  return '\uFEFF'+[['entidade','linha','external_id','erros','avisos'],...(['clientes','pets'] as const).flatMap(t=>l[t].filter(x=>x.erros.length||x.avisos.length).map(x=>[t,String(x.linha_original),x.external_id,x.erros.join(' | '),x.avisos.join(' | ')]))].map(x=>x.map(cel).join(';')).join('\r\n')
}
