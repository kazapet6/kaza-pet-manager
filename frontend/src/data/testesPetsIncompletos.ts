import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { paraPet, paraRegistro, type DadosPet } from './petsMapeamento.ts'

const parcial:DadosPet={clienteId:'CLI-1',nome:'Lua',especie:null,racaId:null,sexo:null,porte:null,pelagem:null,peso:null,cor:'',dataNascimento:'',castrado:null,temperamento:null,observacoes:''}
const registro=paraRegistro(parcial)
assert.deepEqual({especie:registro.especie,raca_id:registro.raca_id,sexo:registro.sexo,porte:registro.porte,pelagem:registro.pelagem,castrado:registro.castrado,temperamento:registro.temperamento},{especie:null,raca_id:null,sexo:null,porte:null,pelagem:null,castrado:null,temperamento:null})
const pet=paraPet({id:'PET-1',cliente_id:'CLI-1',nome:'Lua',especie:null,raca_id:null,raca:null,sexo:null,porte:null,pelagem:null,peso:null,cor:'',data_nascimento:'',castrado:null,temperamento:null,observacoes:'',created_at:''})
assert.equal(pet.racaNome,null)
const pagina=readFileSync(new URL('../pages/Pets.tsx',import.meta.url),'utf8')
for(const trecho of ["useState<EspeciePet | ''>('')","useState<boolean | null>(null)",'Cadastro incompleto','Não informado'])assert.ok(pagina.includes(trecho))
assert.ok(!pagina.includes("setPelagem('curta')")&&!pagina.includes("setTemperamento('calmo')")&&!pagina.includes('setCastrado(false)'))
console.log('4 testes de Pets incompletos aprovados.')
