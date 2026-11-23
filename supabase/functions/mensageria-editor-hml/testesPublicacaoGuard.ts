import assert from 'node:assert/strict'
import {validarPublicacaoModeloHml} from './publicacaoGuard.ts'
const body={
  id:'11111111-1111-4111-8111-111111111111',
  versaoEsperada:2,
  chaveIdempotencia:'22222222-2222-4222-8222-222222222222'
}
assert.deepEqual(validarPublicacaoModeloHml(body,false),
 {ok:false,status:503,codigo:'PUBLICACAO_DESATIVADA'})
const valido=validarPublicacaoModeloHml(body,true)
assert.equal(valido.ok,true)
if(!valido.ok)throw Error('INVALIDO')
assert.deepEqual(valido.pedido,body)
for(const b of [
 {...body,id:'invalido'},
 {...body,versaoEsperada:0},
 {...body,versaoEsperada:1.5},
 {...body,versaoEsperada:1000001},
 {...body,chaveIdempotencia:''},
 {...body,id:42},
]){
 const r=validarPublicacaoModeloHml(b,true)
 assert.equal(r.ok,false)
 if(r.ok)throw Error('GUARD_NAO_REJEITOU')
 assert.equal(r.status,400)
}
console.log('HML PUBLICACAO MODELO - GUARDA, CHAVE E VERSAO - PASS')
