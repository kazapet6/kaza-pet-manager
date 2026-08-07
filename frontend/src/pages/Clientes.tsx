import { useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import type { Cliente } from '../types/Cliente'

export default function Clientes() {
  const [modalAberto, setModalAberto] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pesquisa, setPesquisa] = useState('')

  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const clientesFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()

    if (!termo) {
      return clientes
    }

    return clientes.filter((cliente) => {
      return (
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.whatsapp.toLowerCase().includes(termo) ||
        cliente.id.toLowerCase().includes(termo)
      )
    })
  }, [clientes, pesquisa])

  function abrirModal() {
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    limparFormulario()
  }

  function limparFormulario() {
    setNome('')
    setWhatsapp('')
    setEndereco('')
    setBairro('')
    setCidade('')
    setObservacoes('')
  }

  function gerarProximoId() {
    const maiorNumero = clientes.reduce((maior, cliente) => {
      const numero = Number(cliente.id.replace('CLI-', ''))
      return numero > maior ? numero : maior
    }, 0)

    return `CLI-${String(maiorNumero + 1).padStart(6, '0')}`
  }

  function salvarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (!nome.trim()) {
      alert('Preencha o nome do cliente.')
      return
    }

    if (!whatsapp.trim()) {
      alert('Preencha o WhatsApp do cliente.')
      return
    }

    const novoCliente: Cliente = {
      id: gerarProximoId(),
      nome: nome.trim(),
      whatsapp: whatsapp.trim(),
      endereco: endereco.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      observacoes: observacoes.trim(),
      criadoEm: new Date().toISOString(),
    }

    setClientes((clientesAtuais) => [...clientesAtuais, novoCliente])
    fecharModal()
  }

  return (
    <div style={{ padding: '40px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>👥 Clientes</h1>

          <p
            style={{
              margin: '6px 0 0',
              color: 'var(--color-text-muted)',
            }}
          >
            Gerencie os clientes cadastrados na KAZA PET.
          </p>
        </div>

        <Button onClick={abrirModal}>
          + Novo Cliente
        </Button>
      </div>

      <Input
        placeholder="🔍 Pesquisar por nome, WhatsApp ou código..."
        value={pesquisa}
        onChange={(evento) => setPesquisa(evento.target.value)}
      />

      {clientesFiltrados.length === 0 ? (
        <Card
          style={{
            padding: '48px',
            textAlign: 'center',
            border: '1px dashed var(--color-border)',
            background: 'var(--color-surface-muted)',
            marginTop: '24px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>
            👥
          </div>

          <strong style={{ fontSize: '18px' }}>
            {clientes.length === 0
              ? 'Nenhum cliente cadastrado'
              : 'Nenhum cliente encontrado'}
          </strong>

          <p
            style={{
              margin: '8px 0 0',
              color: 'var(--color-text-muted)',
            }}
          >
            {clientes.length === 0
              ? 'Cadastre o primeiro cliente para começar.'
              : 'Tente pesquisar usando outro nome ou telefone.'}
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          {clientesFiltrados.map((cliente) => (
            <Card key={cliente.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '20px',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      marginBottom: '8px',
                      color: 'var(--color-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {cliente.id}
                  </span>

                  <h2
                    style={{
                      margin: '0 0 8px',
                      fontSize: '20px',
                    }}
                  >
                    {cliente.nome}
                  </h2>

                  <p
                    style={{
                      margin: '4px 0',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    📱 {cliente.whatsapp}
                  </p>

                  {(cliente.endereco ||
                    cliente.bairro ||
                    cliente.cidade) && (
                    <p
                      style={{
                        margin: '4px 0',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      📍{' '}
                      {[
                        cliente.endereco,
                        cliente.bairro,
                        cliente.cidade,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  )}

                  <p
                    style={{
                      margin: '12px 0 0',
                      color: 'var(--color-text-muted)',
                      fontSize: '14px',
                    }}
                  >
                    🐶 0 pets cadastrados
                  </p>
                </div>

                <Button variant="secondary">
                  Ver cliente
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo="Novo cliente"
        onClose={fecharModal}
      >
        <p
          style={{
            margin: '0 0 20px',
            color: 'var(--color-text-muted)',
          }}
        >
          Cadastre os dados principais do cliente.
        </p>

        <form
          onSubmit={salvarCliente}
          style={{
            display: 'grid',
            gap: '14px',
          }}
        >
          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontWeight: 600 }}>
              Nome *
            </label>

            <Input
              placeholder="Nome completo"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontWeight: 600 }}>
              WhatsApp *
            </label>

            <Input
              type="tel"
              placeholder="(00) 00000-0000"
              value={whatsapp}
              onChange={(evento) =>
                setWhatsapp(evento.target.value)
              }
            />
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontWeight: 600 }}>
              Endereço
            </label>

            <Input
              placeholder="Rua, número e complemento"
              value={endereco}
              onChange={(evento) =>
                setEndereco(evento.target.value)
              }
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
            }}
          >
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 600 }}>
                Bairro
              </label>

              <Input
                placeholder="Bairro"
                value={bairro}
                onChange={(evento) =>
                  setBairro(evento.target.value)
                }
              />
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 600 }}>
                Cidade
              </label>

              <Input
                placeholder="Cidade"
                value={cidade}
                onChange={(evento) =>
                  setCidade(evento.target.value)
                }
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontWeight: 600 }}>
              Observações
            </label>

            <textarea
              placeholder="Informações adicionais"
              value={observacoes}
              onChange={(evento) =>
                setObservacoes(evento.target.value)
              }
              style={{
                width: '100%',
                minHeight: '90px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                outline: 'none',
                fontSize: '15px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            <Button
              variant="secondary"
              onClick={fecharModal}
            >
              Cancelar
            </Button>

            <Button type="submit">
              Salvar Cliente
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}