import { useMemo, useState } from 'react'
import type { RacaImportacao } from './csv.ts'
import type { Lote } from './modelo.ts'
import { classificarSugestoesRacas, payloadResolucoesRacas, type ResolucaoRacaLote } from './sugestoesRacas.ts'

type Props={lote:Lote;racas:RacaImportacao[];podeExecutar:boolean;onConfirmar:(itens:ResolucaoRacaLote[])=>Promise<boolean>}

export default function ResolucaoRacasEmLote({lote,racas,podeExecutar,onConfirmar}:Props){
  const itens=useMemo(()=>classificarSugestoesRacas(lote,racas),[lote,racas])
  const [aberto,setAberto]=useState(false),[selecionados,setSelecionados]=useState<string[]>([]),[confirmando,setConfirmando]=useState(false)
  const escolhidos=itens.filter(i=>selecionados.includes(i.chave)&&i.selecionavel)
  const novas=new Set(escolhidos.filter(i=>i.acao==='criar').map(i=>`${i.especie}:${i.canonica}`)).size, existentes=escolhidos.filter(i=>i.acao==='associar').length
  const pets=escolhidos.reduce((s,i)=>s+i.quantidade,0), seguras=itens.filter(i=>i.selecionavel)
  const rotuloResolucoes=`${escolhidos.length} ${escolhidos.length===1?'resolução':'resoluções'}`
  if(!aberto)return <button onClick={()=>setAberto(true)}>Resolver sugestões de raça em lote</button>
  return <section className="imp-aprovacao-racas" aria-label="Resolver sugestões de raça em lote">
    <div className="imp-acoes"><h4>Resolver sugestões de raça em lote</h4><button onClick={()=>setAberto(false)}>Fechar</button></div>
    <p>Selecione apenas correspondências administrativas seguras. Grupos bloqueados continuam na revisão manual.</p>
    <button onClick={()=>setSelecionados(seguras.map(i=>i.chave))}>Selecionar sugestões seguras</button>
    <div className="imp-tabela-wrap"><table><thead><tr><th>Seleção</th><th>Espécie original</th><th>Raça original</th><th>Pets</th><th>Sugestão canônica</th><th>Ação</th><th>Motivo</th></tr></thead>
      <tbody>{itens.map(i=><tr key={i.chave} className={i.selecionavel?'':'imp-bloqueado'}><td><input type="checkbox" aria-label={`Selecionar ${i.racaOriginal||'grupo sem raça'}`} disabled={!i.selecionavel} checked={selecionados.includes(i.chave)&&i.selecionavel} onChange={e=>setSelecionados(s=>e.target.checked?[...s,i.chave]:s.filter(x=>x!==i.chave))}/></td><td>{i.especieOriginal||'—'}</td><td>{i.racaOriginal||'(vazio)'}</td><td>{i.quantidade}</td><td>{i.canonica||'—'}</td><td>{i.acao==='criar'?'Criar':i.acao==='associar'?'Associar existente':'Revisar'}</td><td>{i.motivo}</td></tr>)}</tbody></table></div>
    <p>{seguras.length} grupos seguros · {itens.length-seguras.length} grupos manuais.</p>
    <button disabled={!podeExecutar||!escolhidos.length} onClick={()=>setConfirmando(true)}>Confirmar {rotuloResolucoes}</button>
    {!podeExecutar&&<p>Salve primeiro qualquer decisão local. A operação exige a revisão atual do lote.</p>}
    {confirmando&&<div role="dialog" aria-modal="true" aria-label="Confirmar resoluções de raça" className="imp-dialog"><h4>Confirmar resoluções de raça</h4>
      <p>{novas} {novas===1?'raça nova será criada':'raças novas serão criadas'}; {existentes} {existentes===1?'grupo usará':'grupos usarão'} raças já existentes; {pets} {pets===1?'pet terá':'pets terão'} apenas o staging resolvido.</p>
      <p>Nenhum pet será importado nesta operação.</p>
      <button onClick={async()=>{if(await onConfirmar(payloadResolucoesRacas(escolhidos))){setConfirmando(false);setSelecionados([])}}}>Confirmar {rotuloResolucoes}</button>
      <button onClick={()=>setConfirmando(false)}>Cancelar</button></div>}
  </section>
}
