import { useEffect, useState } from 'react'
import type { Cliente } from '../types/Cliente'
import { supabase } from '../lib/supabase'
import EnvioManualWhatsAppHml from './EnvioManualWhatsAppHml'

type Props = {
  email: string
  autorizado: boolean
  onSair: () => Promise<void>
}

export default function WhatsAppHmlPiloto({ email, autorizado, onSair }: Props) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [recarregar, setRecarregar] = useState(0)

  useEffect(() => {
    if (!autorizado) {
      setCarregando(false)
      return
    }
    let ativo = true
    async function consultar() {
      setCarregando(true)
      setErro('')
      try {
        const { data, error } = await supabase.functions.invoke<{ cliente?: Cliente }>(
          'enviar-whatsapp-hml',
          { body: { acao: 'cliente_piloto' } },
        )
        if (!ativo) return
        if (error || data?.cliente?.id !== 'CLI-990003') {
          setErro('A função não conseguiu disponibilizar a ficha fictícia autorizada.')
        } else {
          setCliente(data.cliente)
        }
      } catch {
        if (ativo) setErro('Falha ao consultar a função de homologação.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    void consultar()
    return () => { ativo = false }
  }, [autorizado, recarregar])

  return (
    <main style={{
      minHeight: '100dvh', background: '#f7f4ee',
      padding: 'clamp(20px, 4vw, 60px)', color: '#253a2b',
      fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 810, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header style={{
          padding: 24, background: '#234c32', color: 'white',
          borderRadius: 18, display: 'flex', flexWrap: 'wrap',
          justifyContent: 'space-between', gap: 16, alignItems: 'center',
        }}>
          <div>
            <strong style={{ fontSize: 24 }}>KAZA PET MANAGER</strong>
            <p style={{ marginBottom: 0 }}>WhatsApp • Piloto local de homologação</p>
          </div>
          <button type="button" onClick={() => void onSair()}
            style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid white',
              background: 'transparent', color: 'white', cursor: 'pointer' }}>Sair</button>
        </header>
        <section style={{ background: 'white', padding: 24, borderRadius: 18, display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: '#6b746b' }}>Conta de homologação: {email}</p>
          <h1 style={{ margin: 0, fontSize: 28 }}>Cliente de teste autorizado</h1>
          <p style={{ margin: 0 }}>
            Esta tela isolada não carrega clientes, raças, agenda ou dados operacionais.
            Não altera o KAZA PET MANAGER publicado.
          </p>
          {!autorizado && <p role="alert">Esta conta não está autorizada para o piloto WhatsApp.</p>}
          {autorizado && carregando && <p role="status">Consultando a ficha fictícia…</p>}
          {autorizado && erro && <div role="alert">
            <p>{erro}</p>
            <button type="button" onClick={() => setRecarregar(n => n + 1)}>
              Tentar novamente
            </button>
          </div>}
          {autorizado && cliente && !carregando && !erro && (
            <div style={{ padding: 16, border: '1px solid #d1dfce', borderRadius: 14 }}>
              <p style={{ margin: 0 }}><strong>{cliente.nome}</strong> — {cliente.id}</p>
              <p style={{ margin: '8px 0 0', color: '#6b746b' }}>
                Destino permitido: final {cliente.whatsapp.slice(-4)}
              </p>
            </div>
          )}
        </section>
        {autorizado && cliente && !carregando && !erro && (
          <section style={{ background: 'white', padding: 24, borderRadius: 18 }}>
            <h2 style={{ marginTop: 0 }}>WhatsApp — envio manual</h2>
            <EnvioManualWhatsAppHml cliente={cliente} />
          </section>
        )}
      </div>
    </main>
  )
}
