import { useEffect, useRef, useState } from 'react'
import Button from '../components/ui/Button'
import type { DetalheUnidadeCredito } from '../../../supabase/functions/_shared/credito-contrato.ts'
import type { Resposta044 } from '../../../supabase/functions/_shared/reaproveitamento-044.ts'
import { fluxo044, invocar044 } from './clienteReaproveitamento.ts'
import type { Tentativa044 } from './reaproveitamentoFluxo.ts'
export default function ReaproveitarCredito({ credito, aposReserva }: { credito: DetalheUnidadeCredito; aposReserva(): Promise<void> }) {
 const [lista, setLista] = useState<Extract<Resposta044, { status: 'carregado' }> | null>(null), [tentativa, setTentativa] = useState<Tentativa044 | null>(null), [selecionados, setSelecionados] = useState<string[]>([credito.contratoItemId]), [data, setData] = useState(''), [hora, setHora] = useState(''), [funcionario, setFuncionario] = useState(''), [motivo, setMotivo] = useState(''), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [pronto, setPronto] = useState(false), [resultado, setResultado] = useState<Resposta044 | null>(null)
 const enviando = useRef(false)
 useEffect(() => { let vivo = true; setPronto(false); setErro(''); setLista(null); void (async () => { try {
  const x = await fluxo044.recuperar(credito.cicloId, credito.ocorrenciaId, credito.contratoItemId)
  if (!vivo) return
  setTentativa(x); setResultado(null)
  if (x?.enviada) { try { const r = await fluxo044.reconciliar(credito.cicloId, credito.ocorrenciaId, credito.contratoItemId); if (vivo) setResultado(r) } catch { if (vivo) setErro('Resultado desconhecido. Preserve a intenção e consulte novamente o servidor.') } }
  if (credito.estadoComercial !== 'disponivel' && !x) { setPronto(true); return }
  const l = await invocar044({ operacao: 'listar', cicloId: credito.cicloId }); if (l.status !== 'carregado') throw new Error(l.mensagem)
  if (vivo) { setLista(l); setFuncionario(x?.pedido.funcionarioResponsavelId ?? l.funcionarioPadraoId); setData(x?.pedido.data ?? ''); setHora(x?.pedido.horario ?? ''); setMotivo(x?.pedido.motivo ?? ''); setSelecionados(x?.pedido.creditos.map(c => c.contratoItemId) ?? [credito.contratoItemId]); setPronto(true) }
 } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível consultar o crédito.') } finally { if (vivo) setPronto(true) } })(); return () => { vivo = false } }, [credito.cicloId, credito.ocorrenciaId, credito.contratoItemId, credito.versao, credito.estadoComercial])
 const unidades = (lista?.unidades ?? []).filter(x => x.ocorrenciaId === credito.ocorrenciaId && x.reaproveitavel === true), principal = unidades.find(x => x.contratoItemId === credito.contratoItemId)
 async function agir(op: 'preparar' | 'confirmar' | 'reconciliar') {
  if (enviando.current || !pronto) return
  enviando.current = true; setOcupado(true); setErro('')
  try {
   if (op !== 'preparar') { const r = await fluxo044[op](credito.cicloId, credito.ocorrenciaId, credito.contratoItemId); setResultado(r); if (r.status === 'reservado' || r.status === 'recusado') { try { await aposReserva() } catch { setErro('Desfecho registrado, mas a atualização da tela falhou. Recarregue contrato e Agenda antes de prosseguir.') } } }
   else {
    if (!lista || !principal) throw new Error('A liberação do crédito não foi comprovada.')
    await fluxo044.preparar({ contratoId: lista.contratoId, cicloId: credito.cicloId, creditos: unidades.filter(x => selecionados.includes(String(x.contratoItemId))).map(x => ({ ocorrenciaId: String(x.ocorrenciaId), contratoItemId: String(x.contratoItemId), versaoEsperada: Number(x.versao), eventoLiberacaoId: String(x.eventoLiberacaoId) })), data, horario: hora, funcionarioResponsavelId: funcionario, motivo }, credito.ocorrenciaId, credito.contratoItemId)
   }
  } catch (e) { setErro(e instanceof Error ? e.message : 'Resultado não confirmado; retome a mesma tentativa.') }
  finally { try { setTentativa(await fluxo044.recuperar(credito.cicloId, credito.ocorrenciaId, credito.contratoItemId)) } catch { /* conservar estado */ } enviando.current = false; setOcupado(false) }
 }
 async function alterar(novo = false) { if (enviando.current) return; enviando.current = true; setOcupado(true); try { await fluxo044.alterar(credito.cicloId, credito.ocorrenciaId, credito.contratoItemId, novo && principal ? String(principal.eventoLiberacaoId) : undefined); setTentativa(null); setResultado(null); setErro(''); setSelecionados([credito.contratoItemId]) } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível alterar.') } finally { enviando.current = false; setOcupado(false) } }
 if (credito.estadoComercial !== 'disponivel' && !tentativa && !erro) return null
 const confirmado = resultado?.status === 'reservado', recusado = resultado?.status === 'recusado', novaLiberacao = confirmado && principal && principal.eventoLiberacaoId !== tentativa?.pedido.creditos.find(c => c.contratoItemId === credito.contratoItemId)?.eventoLiberacaoId
 return <section className="contrato-painel-compacto" aria-label="Reaproveitar crédito"><h3>Agendar com crédito disponível</h3>
  {erro && <p role="alert">{erro}</p>}{resultado && 'mensagem' in resultado && <p role={resultado.status === 'reservado' ? 'status' : 'alert'}>{resultado.mensagem}</p>}
  {!pronto && !erro && <p>Conferindo a liberação do crédito…</p>}
  {pronto && !principal && !tentativa && <p>Este crédito não possui liberação elegível comprovada. Nenhuma reserva será enviada.</p>}
  {novaLiberacao && <Button disabled={ocupado} onClick={() => void alterar(true)}>Preparar outro atendimento com o crédito devolvido</Button>}
  {recusado && <Button disabled={ocupado || !pronto} onClick={() => void alterar()}>Preparar nova tentativa com outra chave</Button>}
  {tentativa?.enviada && !confirmado && !recusado && <Button variant="secondary" disabled={ocupado || !pronto} onClick={() => void agir('reconciliar')}>Consultar desfecho no servidor</Button>}
  {!confirmado && !recusado && (principal || tentativa) && <>
   {!tentativa?.preparo && <fieldset disabled={ocupado || Boolean(tentativa)}><legend>Serviços disponíveis desta ocorrência</legend>{unidades.map(u => <label key={String(u.contratoItemId)}><input type="checkbox" checked={selecionados.includes(String(u.contratoItemId))} disabled={u.contratoItemId === credito.contratoItemId} onChange={e => setSelecionados(xs => e.target.checked ? [...xs, String(u.contratoItemId)] : xs.filter(x => x !== u.contratoItemId))} />{String(u.servicoNome)} · unidade {Number(u.ordinal)}</label>)}<label>Nova data <input type="date" value={data} onChange={e => setData(e.target.value)} /></label><label>Horário / coleta TaxiDog <input type="time" value={hora} onChange={e => setHora(e.target.value)} /></label><label>Responsável <select value={funcionario} onChange={e => setFuncionario(e.target.value)}><option value="">Escolha</option>{lista?.funcionarios.map(f => <option value={f.id} key={f.id}>{f.nome}</option>)}</select></label><label>Motivo <input value={motivo} maxLength={500} onChange={e => setMotivo(e.target.value)} /></label></fieldset>}
   {tentativa?.preparo && <p>Nova Agenda: {tentativa.pedido.data} às {tentativa.pedido.horario} · {tentativa.pedido.creditos.length} unidade(s) selecionada(s).</p>}
   <p>A capacidade será revalidada. Resultado desconhecido mantém a intenção original até reconciliação no servidor.</p>
   {tentativa && !tentativa.enviada && <Button variant="secondary" disabled={ocupado} onClick={() => void alterar()}>Alterar preparação antes de confirmar</Button>}
   {tentativa?.preparo ? <Button disabled={ocupado} onClick={() => void agir('confirmar')}>{ocupado ? 'Confirmando…' : tentativa.enviada ? 'Consultar e retomar a mesma tentativa' : 'Confirmar novo atendimento'}</Button> : <Button disabled={ocupado || !pronto || !principal || !data || !hora || !funcionario || !motivo.trim()} onClick={() => void agir('preparar')}>{ocupado ? 'Preparando…' : 'Consultar e preparar horário'}</Button>}
  </>}
 </section>
}
