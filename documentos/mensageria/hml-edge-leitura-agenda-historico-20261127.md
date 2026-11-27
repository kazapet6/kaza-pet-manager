# Patch Edge HML v24 -> v25

Inserir antes de `async function operacao(acao='status',segundos:number|null=null){` no handler publicado, mantendo todos os demais arquivos e controles intactos. Não aplicar à versão histórica do handler sem reconciliar as diferenças.

```ts
    if(body.acao==='agenda_comercial'||body.acao==='historico_mensagens'){
      if(Object.keys(body).length!==1)return resposta(400,{codigo:'CORPO_INVALIDO'},origem)
      try{
        const nome=body.acao==='agenda_comercial'?'agenda_comercial':'historico_mensagens'
        const r=await rpc(nome,{})
        const limite=nome==='agenda_comercial'?100:50
        if(r.status!=='ok'||r.somente_leitura!==true||r.limite!==limite||!Array.isArray(r.itens)||r.itens.length>limite)
          throw Error('LEITURA_INDISPONIVEL')
        return resposta(200,{status:'ok',somente_leitura:true,limite,itens:r.itens},origem)
      }catch{return resposta(503,{codigo:'LEITURA_INDISPONIVEL'},origem)}
    }
```
