import { useState } from 'react'
import { analisarArquivos, validarLote, resumo, exportarPendencias, CAMPOS_CADASTRO, CAMPOS_PERFIL, OPCOES, type Lote, type Linha } from './modelo.ts'
import { normalizar, type RacaImportacao } from './csv.ts'
import * as api from './api.ts'
import revisaoRacas from '../../../banco/admin/go_live/revisao_racas.csv?raw'
import './importacao.css'
import RevisaoEmLote from './RevisaoEmLote.tsx'
import { aplicarGrupo } from './grupos.ts'

const etapas=['Selecionar arquivos','Analisar','Resumo','Resolver valores em lote','Resolver clientes','Resolver pets','Revisar','Confirmar','Resultado']
const idsEtapas=[0,1,2,9,3,4,5,6,7]
const rotulos:Record<string,string>={whatsapp:'WhatsApp',data_nascimento:'Nascimento (AAAA-MM-DD)',raca_id:'Raça',especie:'Espécie',sexo:'Sexo',porte:'Porte',pelagem:'Pelagem',temperamento:'Temperamento',castrado:'Castrado',observacoes:'Observações',nome:'Nome',peso:'Peso (kg)',cor:'Cor'}
const sugestões=revisaoRacas.split(/\r?\n/).slice(1).map(l=>(l.match(/"(?:[^"]|"")*"/g)||[]).map(v=>v.slice(1,-1).replaceAll('""','"')))
export default function Importacao() {
  const [arquivos,setArquivos]=useState<[File|null,File|null]>([null,null]),[origem,setOrigem]=useState('sistema-legado')
  const [lote,setLote]=useState<Lote|null>(null),[racas,setRacas]=useState<RacaImportacao[]>([]),[etapa,setEtapa]=useState(0)
  const [erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[sujo,setSujo]=useState(false)
  const [indice,setIndice]=useState(0),[filtro,setFiltro]=useState(''),[soPendentes,setSoPendentes]=useState(false)
  const [lotes,setLotes]=useState<Awaited<ReturnType<typeof api.listarLotes>>>([]),[confirmar,setConfirmar]=useState(false)
  const [novaRaca,setNovaRaca]=useState(false),[nomeRaca,setNomeRaca]=useState(''),[especieRaca,setEspecieRaca]=useState('cao')
  const [alvoGrupoRaca,setAlvoGrupoRaca]=useState<{chave:string;ids:string[]}|null>(null)
  const r=lote?resumo(lote):null, tipo=etapa===3?'clientes':'pets'
  const filtradas=lote?.[tipo].filter(l=>(!soPendentes||l.erros.length>0)&&normalizar(`${l.original.nome} ${l.external_id}`).includes(normalizar(filtro)))||[]
  const linha=filtradas[Math.min(indice,Math.max(0,filtradas.length-1))]
  const encerrado=lote?.status==='concluido'||lote?.status==='cancelado'
  async function executar(f:()=>Promise<void>) {setOcupado(true);setErro('');try{await f()}catch(e){setErro(e instanceof Error?e.message:'Não foi possível concluir a operação.')}finally{setOcupado(false)}}
  function mudarEtapa(n:number){setEtapa(n);setIndice(0);setFiltro('');setConfirmar(false);setSoPendentes(n===3||n===4)}
  async function analisar(){await executar(async()=>{
    if(!arquivos[0]||!arquivos[1]||!origem.trim())throw new Error('Selecione clientes.csv, pets.csv e informe uma origem estável.')
    if(arquivos.some(f=>f&&f.size>10000000))throw new Error('Cada arquivo pode ter até 10 MB.')
    const catalogo=await api.catalogoImportacao();setRacas(catalogo)
    let novo=analisarArquivos(await arquivos[0].text(),await arquivos[1].text(),catalogo,origem,arquivos.map(f=>f!.name))
    try{novo=validarLote(await api.aplicarMapeamentos(novo),catalogo)}catch(e){setErro(e instanceof Error?e.message:'Mapeamentos não consultados.')}
    setLote(novo);setSujo(true);mudarEtapa(2)
  })}
  function editar(l:Linha,campo:string,valor:string|boolean|null){if(!lote)return;setLote(validarLote({...lote,[tipo]:lote[tipo].map(x=>x.external_id===l.external_id?{...x,resolvido:{...x.resolvido,[campo]:valor,...(campo==='especie'?{raca_id:null}:{})}}:x)},racas));setSujo(true)}
  function decisao(l:Linha,d:Linha['decisao_operador']){if(!lote)return;setLote(validarLote({...lote,[tipo]:lote[tipo].map(x=>x.external_id===l.external_id?{...x,decisao_operador:d}:x)},racas));setSujo(true)}
  async function salvar(){if(lote)await executar(async()=>{setLote(await api.salvarLote(lote));setSujo(false)})}
  function baixar(){if(!lote)return;const url=URL.createObjectURL(new Blob([exportarPendencias(lote)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='pendencias-importacao.csv';a.click();URL.revokeObjectURL(url)}
  const sugestao=linha&&sugestões.find(s=>s[0]===linha.original.raca&&s[1]===linha.original.especie)
  return <section className="importacao panel" aria-label="Importação de dados">
    <h2>Importação de dados</h2><p>Revise os CSVs antes de gravar. Salvar lote guarda dados pessoais em staging; somente a confirmação final cria Clientes e Pets.</p>
    <ol className="imp-etapas">{etapas.map((e,i)=><li key={e} aria-current={etapa===idsEtapas[i]?'step':undefined}>{i+1}. {e}</li>)}</ol>
    {erro&&<p role="alert" className="imp-alerta">{erro}</p>}
    <fieldset disabled={ocupado||novaRaca}><legend className="imp-sr">Importação</legend>
    {etapa<2&&<div className="imp-form">
      <label>Origem (mesmo valor em todos os reenvios deste sistema)<input value={origem} maxLength={100} onChange={e=>setOrigem(e.target.value)}/></label>
      {['Clientes CSV','Pets CSV'].map((t,i)=><label key={t}>{t}<input type="file" accept=".csv,text/csv" onChange={e=>setArquivos(a=>i===0?[e.target.files?.[0]||null,a[1]]:[a[0],e.target.files?.[0]||null])}/></label>)}
      <button onClick={()=>{setEtapa(1);void analisar()}}>Analisar arquivos localmente</button>
      <button onClick={()=>void executar(async()=>setLotes(await api.listarLotes()))}>Consultar lotes salvos</button>
      {lotes.map(l=><button key={l.id} onClick={()=>void executar(async()=>{setRacas(await api.catalogoImportacao());setLote(await api.obterLote(l.id));setSujo(false);mudarEtapa(2)})}>{l.origem} · {l.status} · {new Date(l.created_at).toLocaleString('pt-BR')}</button>)}
    </div>}
    {lote&&r&&etapa>=2&&<>
      <p>Origem: <strong>{lote.origem}</strong> · {lote.status} · {sujo?'Revisão local não salva':`Revisão salva ${lote.revisao}`}</p>
      <dl className="imp-resumo">{Object.entries({Clientes:r.clientes,Pets:r.pets,'Vínculos encontrados':r.vinculos,'Clientes pendentes':r.clientesPendentes,'Pets pendentes':r.petsPendentes,'Raças pendentes':r.racasPendentes,'Linhas com possível duplicidade':r.duplicidades,'Já importados':r.jaImportados,'Clientes prontos':r.clientesProntos,'Pets prontos':r.petsProntos}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <nav className="imp-acoes" aria-label="Revisão"><button onClick={()=>mudarEtapa(9)}>Resolver valores em lote</button><button onClick={()=>mudarEtapa(3)}>Resolver clientes</button><button onClick={()=>mudarEtapa(4)}>Resolver pets</button><button onClick={()=>mudarEtapa(5)}>Revisar</button><button onClick={baixar}>Exportar pendências/avisos</button></nav>
      {r.petsPendentes===0&&r.clientesPendentes===0&&!encerrado&&<p role="status">Pronto para importar: salve a revisão e confira a confirmação final.</p>}
      {etapa===9&&!encerrado&&<RevisaoEmLote lote={lote} racas={racas} podeCriar={!!lote.revisao&&!sujo} onChange={l=>{setLote(l);setSujo(true);setConfirmar(false)}} onCriar={(g,ids,nome,especie)=>{setAlvoGrupoRaca({chave:g.chave,ids});setNomeRaca(nome);setEspecieRaca(especie);setNovaRaca(true)}}/>}
      {(etapa===3||etapa===4)&&<>
        <div className="imp-acoes"><label>Buscar nome/ID<input value={filtro} onChange={e=>{setFiltro(e.target.value);setIndice(0)}}/></label><label><input type="checkbox" checked={soPendentes} onChange={e=>{setSoPendentes(e.target.checked);setIndice(0)}}/> Somente pendentes</label></div>
        <div className="imp-acoes"><button disabled={indice===0} onClick={()=>setIndice(i=>i-1)}>Anterior</button><span>{filtradas.length?Math.min(indice+1,filtradas.length):0} de {filtradas.length}</span><button disabled={indice>=filtradas.length-1} onClick={()=>setIndice(i=>i+1)}>Próximo</button></div>
        {!filtradas.length&&<p>Nenhuma ficha pendente neste filtro. Use a revisão em lote ou desmarque “Somente pendentes” para consultar os demais registros.</p>}
        {linha&&<article className="imp-editor"><h3>{linha.original.nome||'Sem nome'} · linha {linha.linha_original}</h3><p>ID externo: {linha.external_id}{linha.internal_id?` · Já importado: ${linha.internal_id}`:''}</p>
        {tipo==='pets'&&<p>Tutor do CSV: <strong>{lote.clientes.find(c=>c.external_id===linha.original.clienteId)?.resolvido.nome||'Não encontrado'}</strong> · ID externo {linha.original.clienteId}. Resolva o cadastro desse cliente; o vínculo não é trocado por nome ou telefone.</p>}
        {linha.erros.length>0&&<ul className="imp-alerta">{linha.erros.map(e=><li key={e}>{e}</li>)}</ul>}
        {linha.avisos.length>0&&<p>Avisos: {linha.avisos.join(' · ')}. Importar mantém os registros separados.</p>}
        <fieldset disabled={!!linha.internal_id||encerrado}><legend>Decisão e campos resolvidos</legend>
        <label>Decisão<select value={linha.decisao_operador} onChange={e=>decisao(linha,e.target.value as Linha['decisao_operador'])}><option value="importar">Importar / resolver manualmente</option><option value="ignorar">Ignorar esta linha</option><option value="existente">Marcar como já existente</option></select></label>
        {linha.decisao_operador==='existente'?<label>ID interno confirmado ({tipo==='clientes'?'CLI':'PET'}-xxxxxx)<input value={String(linha.resolvido.existente_id||'')} onChange={e=>editar(linha,'existente_id',e.target.value)}/><small>O backend verifica a existência; para pet, também verifica o tutor. Nenhum cadastro existente será sobrescrito.</small></label>:linha.decisao_operador==='importar'&&<div className="imp-form">{(tipo==='clientes'?CAMPOS_CADASTRO:CAMPOS_PERFIL).map(c=><label key={c}>{rotulos[c]||c}{c==='raca_id'?<select value={String(linha.resolvido[c]||'')} onChange={e=>editar(linha,c,e.target.value||null)}><option value="">Pendente</option>{racas.filter(x=>x.ativo&&x.especie===linha.resolvido.especie&&x.nome.trim()!=='2').map(x=><option value={x.id} key={x.id}>{x.nome}</option>)}</select>:c==='castrado'?<select value={linha.resolvido[c]===null?'':String(linha.resolvido[c])} onChange={e=>editar(linha,c,e.target.value===''?null:e.target.value==='true')}><option value="">Pendente</option><option value="true">Sim</option><option value="false">Não</option></select>:OPCOES[c]?<select value={String(linha.resolvido[c]||'')} onChange={e=>editar(linha,c,e.target.value||null)}><option value="">Pendente</option>{OPCOES[c].map(v=><option key={v}>{v}</option>)}</select>:<input value={String(linha.resolvido[c]||'')} onChange={e=>editar(linha,c,e.target.value)}/>}</label>)}</div>}
        {tipo==='pets'&&<><p>Raça original: {linha.original.raca||'vazia'} · Espécie original: {linha.original.especie||'vazia'}</p>{sugestao&&<p>Relatório: {sugestao[2]||'Sem sugestão'} · {sugestao[3]} · {sugestao[4]}. Exige sua decisão.</p>}
        <button disabled={!lote.revisao||sujo} onClick={()=>{setAlvoGrupoRaca(null);setNomeRaca(sugestao?.[2]||'');setEspecieRaca(String(linha.resolvido.especie||'cao'));setNovaRaca(true)}}>Criar raça canônica…</button><small>Salve a revisão antes de criar uma raça no catálogo.</small></>}
        </fieldset><details><summary>Dados originais permitidos</summary><dl>{Object.entries(linha.original).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl></details>
        </article>}
      </>}
      {etapa===5&&<p>Serão promovidos somente os cadastros prontos. Pendentes ficam em staging; ignorados não são criados. Duplicidades aprovadas permanecem separadas. IDs são gerados pelo banco. Salvar a revisão revalida tudo no backend.</p>}
      {!encerrado&&<div className="imp-acoes"><button onClick={()=>void salvar()}>Salvar lote/revisão em staging</button><button disabled={sujo||!lote.revisao||r.clientesProntos+r.petsProntos===0} onClick={()=>mudarEtapa(6)}>Ir para confirmação</button></div>}
      {etapa===6&&<div className="imp-confirmacao"><h3>Confirmar gravação em Clientes e Pets</h3><p>{r.clientesProntos} clientes e {r.petsProntos} pets elegíveis, incluindo associações explícitas a existentes. {r.clientesPendentes+r.petsPendentes} linhas permanecerão pendentes.</p><label><input type="checkbox" checked={confirmar} onChange={e=>setConfirmar(e.target.checked)}/> Revisei as decisões e autorizo promover os cadastros prontos.</label><button disabled={!confirmar||sujo} onClick={()=>void executar(async()=>{setLote(await api.promoverLote(lote));setSujo(false);mudarEtapa(7)})}>Confirmar importação</button></div>}
      {etapa===7&&<><h3>Resultado confirmado pelo backend</h3><dl className="imp-resumo">{Object.entries(lote.resultado||{}).map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{v}</dd></div>)}</dl><p>{lote.status==='concluido'?'Lote concluído.':'Lote permanece aberto para resolver pendências.'}</p></>}
      <button onClick={()=>{if(!sujo||window.confirm('Descartar somente a revisão local não salva?')){setLote(null);mudarEtapa(0)}}}>Voltar aos arquivos/lotes</button>
    </>}
    </fieldset>{ocupado&&<p role="status">Processando…</p>}
    {novaRaca&&lote&&<div role="dialog" aria-modal="true" aria-label="Confirmar nova raça" className="imp-dialog"><h3>Criar raça no catálogo</h3><p>Esta ação grava imediatamente em public.racas, separada da importação final.</p><label>Nome canônico<input value={nomeRaca} onChange={e=>setNomeRaca(e.target.value)} maxLength={100}/></label><label>Espécie<select disabled={!!alvoGrupoRaca} value={especieRaca} onChange={e=>setEspecieRaca(e.target.value)}><option value="cao">Cão</option><option value="gato">Gato</option></select></label><button disabled={ocupado||!nomeRaca.trim()} onClick={()=>void executar(async()=>{const id=await api.criarRaca(lote.id,nomeRaca,especieRaca);const rs=await api.catalogoImportacao();setRacas(rs);const salvo=await api.obterLote(lote.id);setLote(alvoGrupoRaca ? aplicarGrupo(salvo,'raca_id',alvoGrupoRaca.chave,id,rs,alvoGrupoRaca.ids) : validarLote({...salvo,pets:salvo.pets.map(p=>linha&&!p.internal_id&&p.resolvido.especie===especieRaca&&p.external_id===linha.external_id?{...p,resolvido:{...p.resolvido,raca_id:id}}:p)},rs));setSujo(true);setNovaRaca(false)})}>Confirmar criação da raça</button><button disabled={ocupado} onClick={()=>setNovaRaca(false)}>Cancelar</button></div>}
  </section>
}
