export type UnidadeCalendario='dia'|'semana'|'mes'|'ano'
export type ItemRecorrente={servicoId:string;servicoNome:string;quantidadePorCiclo:number;intervaloQuantidade:number;intervaloUnidade:UnidadeCalendario;offsetInicialQuantidade:number;offsetInicialUnidade:UnidadeCalendario}
export type DependenciaServico={servicoId:string;dependenciaServicoId:string}

export function validarDistribuicaoContrato(itens:ItemRecorrente[],dependencias:DependenciaServico[],ancora:string){
  const porId=new Map(itens.map(i=>[i.servicoId,i]))
  const diaFixo=new Date(`${ancora}T00:00:00Z`).getUTCDay()
  for(const item of itens)for(const data of datas(item,ancora))if(new Date(`${data}T00:00:00Z`).getUTCDay()!==diaFixo)return{valido:false,mensagem:`A recorrência de ${item.servicoNome} não permanece no único dia fixo do Contrato. Ajuste a composição do Pacote antes da venda.`}
  for(const relacao of dependencias){const dependente=porId.get(relacao.servicoId);if(!dependente)continue;const base=porId.get(relacao.dependenciaServicoId)
    if(!base)return{valido:false,mensagem:`${dependente.servicoNome} exige um Serviço que não integra a composição comercial do Pacote.`}
    const datasBase=new Set(datas(base,ancora));for(const instante of datas(dependente,ancora))if(!datasBase.has(instante))return{valido:false,mensagem:`A configuração de ${dependente.servicoNome} exige sua dependência em uma ocorrência sem crédito correspondente. Ajuste a composição do Pacote antes da venda.`}
  }return{valido:true as const}
}
export function datas(item:ItemRecorrente,ancora:string){const inicio=somar(new Date(`${ancora}T00:00:00Z`),item.offsetInicialQuantidade,item.offsetInicialUnidade),r:string[]=[];for(let i=0;i<item.quantidadePorCiclo;i++)r.push(somar(inicio,i*item.intervaloQuantidade,item.intervaloUnidade).toISOString().slice(0,10));return r}
export type OcorrenciaComercial={ordem:number;data:string;itens:{servicoId:string;servicoNome:string;ordinal:number}[]}
export function ocorrenciasDoCiclo(itens:ItemRecorrente[],ancora:string):OcorrenciaComercial[]{
 const mapa=new Map<string,OcorrenciaComercial['itens']>()
 for(const item of itens)datas(item,ancora).forEach((data,indice)=>{const lista=mapa.get(data)??[];lista.push({servicoId:item.servicoId,servicoNome:item.servicoNome,ordinal:indice+1});mapa.set(data,lista)})
 return [...mapa.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([data,lista],indice)=>({ordem:indice+1,data,itens:lista}))
}
function somar(origem:Date,q:number,u:UnidadeCalendario){const d=new Date(origem);if(u==='dia')d.setUTCDate(d.getUTCDate()+q);else if(u==='semana')d.setUTCDate(d.getUTCDate()+7*q);else if(u==='mes')d.setUTCMonth(d.getUTCMonth()+q);else d.setUTCFullYear(d.getUTCFullYear()+q);return d}
