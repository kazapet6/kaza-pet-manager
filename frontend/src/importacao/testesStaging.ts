import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analisarArquivos, validarLote, resumo, exportarPendencias } from './modelo.ts'
import { mapearEnum, resolverRaca } from './csv.ts'
const racas=[{id:'r1',nome:'SRD',especie:'cao',ativo:true,sinonimos:['Sem raça definida']}]
const c='id;nome;telefone\nc;Cliente;11999999999'
const p='id;clienteId;nome;especie;raca;genero;tamanho;pelo;comportamento;castrado\np;c;Pet;Cachorro;SRD;Macho;Pequeno;Curto;calmo;f'
let n=0
function t(nome:string,f:()=>void){f();n++;console.log('OK '+nome)}
t('perfil inequívoco pronto, tutor autoritativo',()=>{const l=analisarArquivos(c,p,racas,'origem',[]);assert.equal(resumo(l).petsProntos,1);assert.equal(l.pets[0].original.clienteId,'c')})
t('cliente sem telefone fica pendente e pet incompleto permanece apto',()=>{const l=analisarArquivos(c.replace('11999999999',''),p.replace(';Macho;Pequeno;Curto;calmo;f',';;;;;'),racas,'origem',[]);assert.equal(resumo(l).clientesPendentes,1);assert.equal(l.pets[0].erros.filter(x=>!x.startsWith('Tutor pendente')).length,0)})
t('perfil desconhecido permanece null sem valores fictícios',()=>{const l=analisarArquivos(c,p.replace('Cachorro;SRD;Macho;Pequeno;Curto;calmo;f',';;;;;;'),racas,'origem',[]);const r=l.pets[0].resolvido;for(const campo of ['especie','raca_id','sexo','porte','pelagem','temperamento','castrado'])assert.equal(r[campo],null);assert.equal(resumo(l).petsProntos,1)})
t('peso legado inválido não inventa valor nem bloqueia cadastro parcial',()=>{const l=analisarArquivos(c,p.replace('castrado','castrado;peso').replace(';f',';f;desconhecido'),racas,'origem',[]);assert.equal(l.pets[0].original.peso,'desconhecido');assert.equal(l.pets[0].resolvido.peso,'desconhecido');assert.equal(resumo(l).petsProntos,1)})
t('valores de castrado explícitos e ausência preservada',()=>{for(const v of ['t','true','sim'])assert.equal(mapearEnum('castrado',v),true);for(const v of ['f','false','nao','não'])assert.equal(mapearEnum('castrado',v),false);assert.equal(mapearEnum('castrado',''),null)})
t('raça 2 nunca é selecionada automaticamente',()=>{assert.equal(resolverRaca('2','cao',[{id:'2',nome:'2',especie:'cao',ativo:true}]),null)})
t('arquivo errado rejeitado com mensagem amigável',()=>{assert.throws(()=>analisarArquivos(p,c,racas,'origem',[]),/arquivo é de pets/)})
t('ignorar tutor impede promoção do pet',()=>{const l=analisarArquivos(c,p,racas,'origem',[]);l.clientes[0].decisao_operador='ignorar';assert.equal(resumo(validarLote(l,racas)).petsPendentes,1)})
t('dados originais separados das edições',()=>{const l=analisarArquivos(c,p,racas,'origem',[]);l.clientes[0].resolvido.nome='Editado';assert.equal(l.clientes[0].original.nome,'Cliente')})
t('CSV de pendências não inclui credenciais e neutraliza fórmula',()=>{const l=analisarArquivos(c.replace('id;nome;telefone','id;nome;telefone;senha').replace('11999999999',';NAO_EXPORTAR'),p,racas,'origem',[]);l.clientes[0].external_id='=CMD()';const out=exportarPendencias(l);assert(!out.includes('NAO_EXPORTAR'));assert(out.includes("'=CMD()"))})
t('mapa idempotente retira linha já importada dos prontos',()=>{const l=analisarArquivos(c,p,racas,'origem',[]);l.clientes[0].internal_id='CLI-000001';l.pets[0].internal_id='PET-000001';assert.equal(resumo(validarLote(l,racas)).jaImportados,2);assert.equal(resumo(l).petsProntos,0)})
if(process.argv[2]&&process.argv[3]){
 t('CSVs reais: 329 clientes,383 pets,383 vínculos',()=>{const l=analisarArquivos(readFileSync(process.argv[2],'utf8'),readFileSync(process.argv[3],'utf8'),[{id:'srdc',nome:'Sem raça definida (SRD)',especie:'cao',ativo:true},{id:'srdg',nome:'Sem raça definida (SRD)',especie:'gato',ativo:true},{id:'suspeita',nome:'2',especie:'cao',ativo:true}],'legado',[]);const r=resumo(l);assert.equal(r.clientes,329);assert.equal(r.pets,383);assert.equal(r.vinculos,383);console.log(JSON.stringify({resumo:r,pendenciasClientes:l.clientes.filter(x=>x.erros.length).map(x=>({linha:x.linha_original,erros:x.erros})),duplicidades: l.clientes.concat(l.pets).flatMap(x=>x.avisos).reduce<Record<string,number>>((a,x)=>(a[x]=(a[x]||0)+1,a),{})},null,2))})
}
console.log(n+' testes de preview aprovados.')
