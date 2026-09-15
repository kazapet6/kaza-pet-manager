import { normalizarDuplicidade, type RacaImportacao } from './csv.ts'
import { agruparValores, type Grupo } from './grupos.ts'
import type { Lote } from './modelo.ts'

export type AcaoSugestaoRaca = 'criar' | 'associar' | 'bloqueado'
export type SugestaoRacaLote = {
  chave: string; chaveOriginal: string; chaveEspecieOriginal: string; especieOriginal: string; racaOriginal: string; quantidade: number
  especie: 'cao' | 'gato' | ''; canonica: string; acao: AcaoSugestaoRaca
  racaId?: string; motivo: string; selecionavel: boolean
}
export type ResolucaoRacaLote = {chave_original:string;chave_especie_original:string;especie:'cao'|'gato';nome_canonico:string;quantidade:number}

const srd = 'Sem raça definida (SRD)'
const seguras = new Map<string,{canonica:string;srd?:boolean}>()
function registrar(canonica:string,...originais:string[]){for(const nome of originais)seguras.set(normalizarDuplicidade(nome),{canonica})}
registrar('Shih Tzu','Shih Tzu','Shih-tzu','Shihtzu')
registrar('Yorkshire Terrier','Yorkshire Terrier')
for(const nome of ['SRD','SRD - Sem Raça Definida','Sem raça definida (SRD)'])seguras.set(normalizarDuplicidade(nome),{canonica:srd,srd:true})
for(const nome of ['Samoiedo','Lhasa Apso','Spitz Alemão','Chow Chow','Maltês','Husky Siberiano','Pug','Golden Retriever','Pastor Alemão','Border Collie','Chihuahua','Lulu da Pomerânia','Pequinês','Pinscher Miniatura','Pit Bull','American Bully','Basset Artesiano Normando','Beagle','Cocker Spaniel Inglês','Pastor Belga','Schnauzer Standard','Afghan Hound','Siamês','Bulldog Inglês','Snowshoe'])registrar(nome,nome)
registrar('Buldogue Francês','Buldogue Francês','Bulldog Francês')

function raçaExistente(canonica:string,especie:string,racas:RacaImportacao[]){
  return [...new Map(racas.filter(r=>r.ativo&&r.nome.trim()!=='2'&&r.especie===especie&&[r.nome,...(r.sinonimos||[])].some(n=>normalizarDuplicidade(n)===normalizarDuplicidade(canonica))).map(r=>[r.id,r])).values()]
}
function conflitoInativo(canonica:string,especie:string,racas:RacaImportacao[]){
  return racas.some(r=>!r.ativo&&r.especie===especie&&normalizarDuplicidade(r.nome)===normalizarDuplicidade(canonica))
}
function chaveEspecie(g:Grupo){return String((JSON.parse(g.chave) as string[])[1]||'')}
function chaveOriginal(g:Grupo){return String((JSON.parse(g.chave) as string[])[2]||'')}
function bloquear(g:Grupo,motivo:string,especie:'cao'|'gato'|''='',canonica=''):SugestaoRacaLote{return {chave:g.chave,chaveOriginal:chaveOriginal(g),chaveEspecieOriginal:chaveEspecie(g),especieOriginal:g.especiesOriginais.join(' / '),racaOriginal:g.originais.join(' / '),quantidade:g.pets.length,especie,canonica,acao:'bloqueado',motivo,selecionavel:false}}

export function classificarSugestoesRacas(lote:Lote,racas:RacaImportacao[]):SugestaoRacaLote[]{
  return agruparValores(lote,'raca_id',racas).filter(g=>g.resolvidos<g.pets.length).map(g=>{
    const especies=[...new Set(g.pets.map(p=>p.resolvido.especie))], original=g.originais[0]||''
    if(!g.especiesOriginais.some(x=>x.trim()))return bloquear(g,'Espécie original vazia; exige revisão manual.')
    if(especies.length!==1||!['cao','gato'].includes(String(especies[0])))return bloquear(g,'Espécie ainda não possui resolução única.')
    const especie=especies[0] as 'cao'|'gato'
    if(!original.trim())return bloquear(g,'Raça original vazia; exige revisão manual.',especie)
    if(/\bcom\b|[+/&]/i.test(original))return bloquear(g,'Possível mistura; exige revisão manual.',especie)
    if(/^poodle\s+(mini|m[eé]dio)$/i.test(original.trim()))return bloquear(g,'Variação de Poodle exige decisão manual.',especie)
    const segura=seguras.get(normalizarDuplicidade(original))
    if(!segura)return bloquear(g,'Sem correspondência canônica comprovada para aprovação coletiva.',especie)
    if(conflitoInativo(segura.canonica,especie,racas))return bloquear(g,'Conflito: a raça canônica existe, mas está inativa.',especie,segura.canonica)
    const existentes=raçaExistente(segura.canonica,especie,racas)
    if(existentes.length>1)return bloquear(g,'Conflito: mais de uma raça existente corresponde à sugestão.',especie,segura.canonica)
    if(segura.srd&&existentes.length!==1)return bloquear(g,'SRD da espécie não foi encontrado de forma única.',especie,segura.canonica)
    return {chave:g.chave,chaveOriginal:chaveOriginal(g),chaveEspecieOriginal:chaveEspecie(g),especieOriginal:g.especiesOriginais.join(' / '),racaOriginal:original,quantidade:g.pets.length,especie,canonica:segura.canonica,
      acao:(existentes.length?'associar':'criar') as AcaoSugestaoRaca,racaId:existentes[0]?.id,motivo:existentes.length?'Usar raça canônica já cadastrada.':'Sugestão canônica inequívoca; criar uma única raça.',selecionavel:true}
  }).sort((a,b)=>Number(b.selecionavel)-Number(a.selecionavel)||b.quantidade-a.quantidade||a.racaOriginal.localeCompare(b.racaOriginal))
}

export function payloadResolucoesRacas(itens:SugestaoRacaLote[]):ResolucaoRacaLote[]{return itens.filter(i=>i.selecionavel&&i.especie).map(i=>({chave_original:i.chaveOriginal,chave_especie_original:i.chaveEspecieOriginal,especie:i.especie as 'cao'|'gato',nome_canonico:i.canonica,quantidade:i.quantidade}))}
