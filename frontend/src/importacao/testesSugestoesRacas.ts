import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analisarArquivos, validarLote } from './modelo.ts'
import { classificarSugestoesRacas, payloadResolucoesRacas } from './sugestoesRacas.ts'
import { normalizarDuplicidade } from './csv.ts'

const racas=[
  {id:'11111111-1111-4111-8111-111111111111',nome:'Shih Tzu',especie:'cao',ativo:true,sinonimos:[]},
  {id:'22222222-2222-4222-8222-222222222222',nome:'Sem raça definida (SRD)',especie:'cao',ativo:true,sinonimos:['SRD']},
  {id:'33333333-3333-4333-8333-333333333333',nome:'Sem raça definida (SRD)',especie:'gato',ativo:true,sinonimos:['SRD']},
]
const clientes='id;nome;telefone\nc;Tutor sintético;11999999999'
const cab='id;clienteId;nome;especie;raca;genero;tamanho;pelo;comportamento;castrado\n'
const linhas=[
  'shih;c;Pet 1;Cachorro;Shih-tzu;Macho;Pequeno;Curto;calmo;t',
  'pug1;c;Pet 2;Cachorro;Pug;Macho;Pequeno;Curto;calmo;t',
  'pug2;c;Pet 3;cachorro;Pug;Macho;Pequeno;Curto;calmo;t',
  'srdc;c;Pet 4;Cachorro;SRD;Macho;Pequeno;Curto;calmo;t',
  'srdg;c;Pet 5;Gato;SRD;Macho;Pequeno;Curto;calmo;t',
  'mix;c;Pet 6;Cachorro;Shitzu com Yorkshire;Macho;Pequeno;Curto;calmo;t',
  'poodle;c;Pet 7;Cachorro;Poodle Médio;Macho;Pequeno;Curto;calmo;t',
  'vazio;c;Pet 8;;;;Pequeno;Curto;calmo;t',
].join('\n')
function lote(){
  const l=analisarArquivos(clientes,cab+linhas,racas,'teste-sugestoes',[])
  return validarLote({...l,pets:l.pets.map(p=>({...p,resolvido:{...p.resolvido,raca_id:null}}))},racas)
}
let total=0
function teste(nome:string,f:()=>void){f();total++;console.log('OK '+nome)}

teste('classifica criação, associação e SRD por espécie sem misturar grupos',()=>{
  const itens=classificarSugestoesRacas(lote(),racas),porOriginal=(nome:string)=>itens.find(i=>i.racaOriginal===nome)!
  assert.equal(porOriginal('Shih-tzu').acao,'associar')
  assert.equal(porOriginal('Pug').acao,'criar');assert.equal(porOriginal('Pug').quantidade,2)
  assert.equal(itens.filter(i=>i.racaOriginal==='SRD'&&i.acao==='associar').length,2)
  assert.deepEqual(new Set(itens.filter(i=>i.racaOriginal==='SRD').map(i=>i.especie)),new Set(['cao','gato']))
})
teste('mistura, Poodle e campos vazios permanecem bloqueados',()=>{
  const itens=classificarSugestoesRacas(lote(),racas)
  for(const original of ['Shitzu com Yorkshire','Poodle Médio',''])assert.equal(itens.find(i=>i.racaOriginal===original)?.selecionavel,false)
})
teste('payload preserva a chave normalizada de espécie do grupo',()=>{
  const pug=classificarSugestoesRacas(lote(),racas).find(i=>i.racaOriginal==='Pug')!
  assert.equal(payloadResolucoesRacas([pug])[0].chave_especie_original,'cachorro')
})
teste('decisões e resoluções anteriores ficam fora da aprovação coletiva',()=>{
  const l=lote(),shih=l.pets.find(p=>p.external_id==='shih')!,pug=l.pets.find(p=>p.external_id==='pug1')!
  shih.resolvido.raca_id=racas[0].id;pug.decisao_operador='ignorar'
  const itens=classificarSugestoesRacas(validarLote(l,racas),racas)
  assert(!itens.some(i=>i.racaOriginal==='Shih-tzu'))
  assert.equal(itens.find(i=>i.racaOriginal==='Pug')?.quantidade,1)
})
teste('conflito canônico inativo é bloqueado antes da RPC',()=>{
  const catalogo=[...racas,{id:'44444444-4444-4444-8444-444444444444',nome:'Pug',especie:'cao',ativo:false,sinonimos:[]}]
  const pug=classificarSugestoesRacas(lote(),catalogo).find(i=>i.racaOriginal==='Pug')!
  assert.equal(pug.acao,'bloqueado');assert.match(pug.motivo,/inativa/)
})
if(process.argv[2]&&process.argv[3]){
  const catalogo=[...racas,{id:'44444444-4444-4444-8444-444444444444',nome:'Yorkshire Terrier',especie:'cao',ativo:true,sinonimos:[]}]
  let real=analisarArquivos(readFileSync(process.argv[2],'utf8'),readFileSync(process.argv[3],'utf8'),catalogo,'regressao-real-sugestoes',[])
  const idsPorCanonica={
    'shih tzu':racas[0].id,'yorkshire terrier':catalogo[3].id,
    'srd':racas[1].id,'srd sem raca definida':racas[1].id,'sem raca definida srd':racas[1].id,
  } as Record<string,string>
  real.pets=real.pets.map(p=>{
    const chave=normalizarDuplicidade(p.original.raca||''),especie=p.resolvido.especie
    const id=idsPorCanonica[chave]
    return id&&['cao','gato'].includes(String(especie))?{...p,resolvido:{...p.resolvido,raca_id:especie==='gato'?racas[2].id:id}}:p
  })
  const candidatosIgnorados=real.clientes.filter(c=>{const pets=real.pets.filter(p=>p.original.clienteId===c.external_id);return !c.original.cep&&!c.original.endereco&&pets.length===2&&pets.every(p=>!p.original.especie&&!p.original.raca)})
  assert.equal(candidatosIgnorados.length,1);candidatosIgnorados[0].decisao_operador='ignorar';for(const p of real.pets)if(p.original.clienteId===candidatosIgnorados[0].external_id)p.decisao_operador='ignorar'
  real=validarLote(real,catalogo)
  const itens=classificarSugestoesRacas(real,catalogo),seguros=itens.filter(i=>i.selecionavel),manuais=itens.filter(i=>!i.selecionavel)
  assert(seguros.length>0);assert(seguros.reduce((s,i)=>s+i.quantidade,0)>0)
  assert(manuais.some(i=>/^Poodle (Mini|Médio)$/.test(i.racaOriginal)))
  assert(manuais.every(i=>!i.selecionavel));assert(real.pets.filter(p=>p.decisao_operador==='ignorar').length>=2)
  console.log(JSON.stringify({gruposSeguros:seguros.length,petsResolvidos:seguros.reduce((s,i)=>s+i.quantidade,0),gruposManuais:manuais.length,gruposManuaisNomes:manuais.map(i=>`${i.especieOriginal||'(espécie vazia)'} / ${i.racaOriginal||'(raça vazia)'} (${i.quantidade} pets)`)},null,2))
}
console.log(total+' testes de sugestões seguras de raça aprovados.')
