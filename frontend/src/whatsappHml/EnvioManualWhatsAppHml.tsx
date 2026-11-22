import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { numeroWhatsAppBrasil, validarTextoManual } from './validacao'
import type { Cliente } from '../types/Cliente'

type Envio = {
  id: string
  estado: 'reservado' | 'aceito' | 'falha' | 'indeterminado'
  criado_em: string
  erro_codigo: string | null
  status_entrega?: 'sent' | 'delivered' | 'read' | 'failed' | null
}
type RespostaHistorico = { envios?: Envio[] }
type RespostaEnvio = { estado?: string; codigo?: string }
type Props = { cliente: Cliente }

const botao: CSSProperties = {
  padding: '11px 16px', borderRadius: 12, border: 0, fontWeight: 700,
  background: '#285336', color: '#fff', cursor: 'pointer',
}

export default function EnvioManualWhatsAppHml({ cliente }: Props) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [estado, setEstado] = useState('')
  const [historico, setHistorico] = useState<Envio[]>([])
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const [confirmado, setConfirmado] = useState(false)
  const numero = numeroWhatsAppBrasil(cliente.whatsapp)
  const valido = Boolean(validarTextoManual(texto)) && Boolean(numero)
  const envioLiberadoNaTela = import.meta.env.VITE_WHATSAPP_HML_SEND_UI_ENABLED === 'true'

  async function carregarHistorico() {
    const { data, error } = await supabase.functions.invoke<RespostaHistorico>(
      'enviar-whatsapp-hml', { body: { acao: 'historico', cliente_id: cliente.id } },
    )
    if (!error && Array.isArray(data?.envios)) setHistorico(data.envios)
  }

  useEffect(() => {
    void carregarHistorico()
    // O componente é recriado ao selecionar outro cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id])

  async function enviar() {
    const mensagem = validarTextoManual(texto)
    if (!mensagem || !numero || ocupado || !confirmado || !envioLiberadoNaTela) return
    if (!window.confirm(`Enviar uma mensagem de TESTE para ${cliente.nome} (${numero}) pela API oficial da Meta?`)) return
    setOcupado(true)
    setEstado('Solicitando o envio à Meta…')
    try {
      const { data, error } = await supabase.functions.invoke<RespostaEnvio>(
        'enviar-whatsapp-hml',
        { body: { acao: 'enviar', cliente_id: cliente.id, texto: mensagem, chave_idempotencia: chave } },
      )
      if (error || !data || data.estado !== 'aceito') {
        setEstado(data?.codigo ? `Envio não confirmado: ${data.codigo}.` :
          'Envio não confirmado. Não repita automaticamente; verifique o histórico.')
      } else {
        setEstado('Meta aceitou a mensagem. Entrega no celular ainda não confirmada.')
        setConfirmado(false)
      }
      await carregarHistorico()
    } catch {
      setEstado('Resultado incerto. Verifique o histórico antes de tentar novamente.')
    } finally {
      setOcupado(false)
    }
  }

  function editarTexto(valor: string) {
    setTexto(valor)
    setChave(crypto.randomUUID())
    setConfirmado(false)
    setEstado('')
  }

  const jaAceito = historico.some(e => e.estado === 'aceito') && estado.startsWith('Meta aceitou')
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, color: '#64726b' }}>
        <strong>Piloto de homologação.</strong> O servidor só envia para o número
        pessoal autorizado. Nenhuma mensagem automática é habilitada.
      </p>
      <p style={{ margin: 0 }}><strong>Cliente:</strong> {cliente.nome}
        <br /><strong>Destino:</strong> {numero ?? 'WhatsApp inválido'}</p>
      <label htmlFor="whatsapp-hml-texto" style={{ fontWeight: 700 }}>Mensagem de teste (até 512 caracteres)</label>
      <textarea id="whatsapp-hml-texto" value={texto} onChange={e => editarTexto(e.target.value)}
        maxLength={512} rows={4} placeholder="Digite a mensagem manual…"
        style={{ padding: 12, borderRadius: 12, border: '1px solid #d4cdbd', width: '100%', resize: 'vertical' }} />
      {!envioLiberadoNaTela && (
        <p role="status" style={{ margin: 0, color: '#a05b15', fontWeight: 700 }}>
          Envio bloqueado na interface. Apenas visualização da homologação.
        </p>
      )}
      <p style={{ margin: 0, color: '#64726b', fontSize: 13 }}>
        Texto livre só pode ser enviado dentro da janela de 24 horas após uma mensagem do destinatário.
      </p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
        Confirmo o destinatário e autorizo uma única mensagem de teste.
      </label>
      <button type="button" onClick={() => void enviar()}
        disabled={!envioLiberadoNaTela || !valido || !confirmado || ocupado || jaAceito}
        style={{ ...botao, opacity: !envioLiberadoNaTela || !valido || !confirmado || ocupado || jaAceito ? 0.5 : 1 }}>
        {ocupado ? 'Enviando…' : 'Enviar via Meta (teste)'}
      </button>
      {estado && <p role="status" style={{ margin: 0, color: '#285336' }}>{estado}</p>}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Histórico de testes</strong>
          <button type="button" onClick={() => void carregarHistorico()}
            style={{ ...botao, background: '#f2eee7', color: '#285336' }}>Atualizar</button>
        </div>
        {historico.length === 0
          ? <p style={{ color: '#64726b' }}>Nenhum envio registrado para este cliente.</p>
          : <ul style={{ paddingLeft: 20 }}>
            {historico.map(envio => <li key={envio.id}>
              {new Date(envio.criado_em).toLocaleString('pt-BR')} — {envio.estado === 'aceito'
                ? 'Aceito pela Meta (entrega não confirmada)'
                : envio.estado === 'indeterminado' || envio.estado === 'reservado'
                  ? 'Resultado incerto; não repetir automaticamente'
                  : 'Falhou'}
              {envio.status_entrega === 'read' ? ' — lida' :
                envio.status_entrega === 'delivered' ? ' — entregue' :
                envio.status_entrega === 'sent' ? ' — enviada' :
                envio.status_entrega === 'failed' ? ' — falhou na entrega' : ''}
              {envio.erro_codigo ? ` (${envio.erro_codigo})` : ''}
            </li>)}
          </ul>}
      </div>
    </section>
  )
}
