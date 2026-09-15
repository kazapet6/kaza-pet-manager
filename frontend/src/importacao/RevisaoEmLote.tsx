import { useState } from 'react'
import type { Lote } from './modelo.ts'
import { OPCOES } from './modelo.ts'
import { normalizar, type RacaImportacao } from './csv.ts'
import { agruparValores, aplicarGrupo, aplicarInequivocas, CAMPOS_GRUPO, contarCampos, sugestaoGrupo, type CampoGrupo, type Grupo } from './grupos.ts'
import ResolucaoRacasEmLote from './ResolucaoRacasEmLote.tsx'
import type { ResolucaoRacaLote } from './sugestoesRacas.ts'
import revisaoRacas from '../../../banco/admin/go_live/revisao_racas.csv?raw'
const sugestoes=revisaoRacas.split(/\r?\n/).slice(1).map(l=>(l.match(/"(?:[^"]|"")*"/g)||[]).map(v=>v.slice(1,-1).replaceAll('""','"')))
type Props={lote:Lote;racas:RacaImportacao[];podeCriar:boolean;onChange:(l:Lote)=>void;onCriar:(g:Grupo,ids:string[],nome:string,especie:string)=>void;onResolverRacas:(itens:ResolucaoRacaLote[])=>Promise<boolean>}
export default function RevisaoEmLote(props:Props){
  const {lote,racas}=props,[campo,setCampo]=useState<CampoGrupo>('raca_id'),[somentePendentes,setSomentePendentes]=useState(false)
  const grupos=agruparValores(lote,campo,racas),contadores=contarCampos(lote,racas)
  return <section aria-label="Resolver valores em lote" className="imp-grupos"><h3>Resolver valores em lote</h3>
    <p>Resolva uma vez por valor original. A confirmação altera a revisão local do staging; salve o lote depois. Valores vazios exigem selecionar os pets conscientemente.</p>
    <dl className="imp-resumo">{(Object.keys(CAMPOS_GRUPO) as CampoGrupo[]).map(c=><div key={c}><dt>{CAMPOS_GRUPO[c]} pendente</dt><dd>{contadores[c]}</dd></div>)}</dl>
    <button onClick={()=>props.onChange(aplicarInequivocas(lote,racas))}>Aplicar equivalências inequívocas aos campos ainda não resolvidos</button>
    <p>Não preenche vazios originais, não altera decisões já resolvidas e não aprova sugestões de raça.</p>
    <div className="imp-acoes"><label>Campo para agrupar<select aria-label="Campo para agrupar" value={campo} onChange={e=>setCampo(e.target.value as CampoGrupo)}>{Object.entries(CAMPOS_GRUPO).map(([k,n])=><option value={k} key={k}>{n}</option>)}</select></label><label><input type="checkbox" checked={somentePendentes} onChange={e=>setSomentePendentes(e.target.checked)}/> Somente grupos com pendências</label></div>
    {campo==='raca_id'&&<ResolucaoRacasEmLote lote={lote} racas={racas} podeExecutar={props.podeCriar} onConfirmar={props.onResolverRacas}/>}
    <p>{grupos.length} grupos normalizados · {grupos.reduce((s,g)=>s+g.pets.length,0)} pets editáveis. Importados, ignorados e associados a existentes ficam fora das alterações em lote.</p>
    <div className="imp-grupos-lista">{grupos.filter(g=>!somentePendentes||g.resolvidos<g.pets.length).map(g=><GrupoEditor key={g.chave} {...props} grupo={g}/>)}</div>
  </section>
}
function GrupoEditor({grupo:g,lote,racas,onChange,onCriar,podeCriar}:Props&{grupo:Grupo}){
  const [destino,setDestino]=useState(''),[selecionados,setSelecionados]=useState<string[]>([]),[mostrarPets,setMostrarPets]=useState(false),[erro,setErro]=useState('')
  const ids=g.vazio?selecionados:g.pets.map(p=>p.external_id)
  const especies=[...new Set(g.pets.filter(p=>ids.includes(p.external_id)).map(p=>p.resolvido.especie))]
  const especie=especies.length===1&&['cao','gato'].includes(String(especies[0]))?String(especies[0]):''
  const rs=racas.filter(r=>r.ativo&&r.nome.trim()!=='2'&&r.especie===especie)
  const inequívoca=sugestaoGrupo(g,racas)
  const proposta=g.campo==='raca_id'?sugestoes.find(s=>normalizar(s[0]||'')===normalizar(g.originais[0])&&normalizar(s[1]||'')===normalizar(g.especiesOriginais[0])):undefined
  function aplicar(v:string|boolean|null){try{onChange(aplicarGrupo(lote,g.campo,g.chave,v,racas,g.vazio?selecionados:undefined));setErro('')}catch(e){setErro(e instanceof Error?e.message:'Revise a seleção.')}}
  const srd=rs.filter(r=>normalizar(r.nome)==='sem raca definida (srd)'||normalizar(r.nome)==='srd')
  const titulo=g.originais.map(v=>v||'(vazio)').join(' / ')
  return <article className="imp-grupo" aria-label={`${CAMPOS_GRUPO[g.campo]}: ${titulo}`}>
    <h4>{titulo}</h4>{g.campo==='raca_id'&&<p>Espécie original: {g.especiesOriginais.map(v=>v||'(vazia)').join(' / ')}</p>}
    <p><strong>{g.pets.length} pets</strong> · {g.resolvidos===g.pets.length?'Resolvido':`${g.pets.length-g.resolvidos} pendentes`} · Destino atual: {g.campo==='raca_id'?racas.find(r=>r.id===g.destino)?.nome||g.destino:g.destino==='true'?'Sim':g.destino==='false'?'Não':g.destino}</p>
    <p>Sugestão: {inequívoca!==null?(g.campo==='raca_id'?racas.find(r=>r.id===inequívoca)?.nome:String(inequívoca)):proposta?.[2]||'Revisão necessária'}{proposta&&inequívoca===null?' (sugestão do relatório, exige aprovação)':''}</p>
    {g.vazio&&<p className="imp-alerta">Valor ausente: nenhuma seleção inicial. A resolução será aplicada somente aos pets marcados abaixo.</p>}
    <button onClick={()=>setMostrarPets(v=>!v)}>{g.vazio?'Selecionar pets':'Ver pets afetados'}</button>
    {mostrarPets&&<div className="imp-selecao">{g.vazio&&<button onClick={()=>setSelecionados(selecionados.length===g.pets.length?[]:g.pets.map(p=>p.external_id))}>{selecionados.length===g.pets.length?'Desmarcar todos':'Selecionar todos explicitamente'}</button>}{g.pets.map(p=><label key={p.external_id}>{g.vazio&&<input type="checkbox" checked={selecionados.includes(p.external_id)} onChange={e=>setSelecionados(s=>e.target.checked?[...s,p.external_id]:s.filter(id=>id!==p.external_id))}/>}<span>{p.resolvido.nome||p.original.nome} · linha {p.linha_original} · tutor {lote.clientes.find(c=>c.external_id===p.original.clienteId)?.resolvido.nome||p.original.clienteId}</span></label>)}</div>}
    <label>Valor de destino<select aria-label="Valor de destino" value={destino} onChange={e=>setDestino(e.target.value)}><option value="">Escolher resolução…</option>{g.campo==='raca_id'?rs.map(r=><option key={r.id} value={r.id}>{r.nome}</option>):g.campo==='castrado'?<><option value="true">Sim</option><option value="false">Não</option></>:OPCOES[g.campo].map(v=><option key={v}>{v}</option>)}</select></label>
    {g.campo==='raca_id'&&!especie&&<p>Primeiro resolva uma mesma espécie para os pets afetados (ou selecione pets da mesma espécie, quando a raça estiver vazia).</p>}
    <p>{ids.length} pets serão afetados. Uma nova resolução substituirá o valor resolvido desses pets, preservando o original.</p>
    <div className="imp-acoes"><button disabled={!destino||!ids.length} onClick={()=>aplicar(g.campo==='castrado'?destino==='true':destino)}>Confirmar resolução do grupo</button>
    <button disabled={!ids.length} onClick={()=>aplicar(null)}>Manter pendente / limpar resolução</button>
    {g.campo==='raca_id'&&<><button disabled={!ids.length||srd.length!==1} onClick={()=>aplicar(srd[0].id)}>Confirmar uso de SRD da espécie</button><button disabled={!podeCriar||!ids.length||!especie} onClick={()=>onCriar(g,ids,proposta?.[2]||g.originais[0],especie)}>Criar nova raça para este grupo…</button></>}
    </div>{g.campo==='raca_id'&&!podeCriar&&<p>Para criar raça, salve primeiro o lote e a revisão atual. A confirmação administrativa será solicitada separadamente.</p>}
    {erro&&<p role="alert">{erro}</p>}
  </article>
}
