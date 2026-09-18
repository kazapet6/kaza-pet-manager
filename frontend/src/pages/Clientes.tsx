import Paginacao from '../components/ui/Paginacao'
import { usePaginacao } from '../components/ui/usePaginacao'
import { useContext, useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { SistemaContext } from '../context/SistemaContext'
import type { Cliente } from '../types/Cliente'

export default function Clientes() {
  const { clientes, pets, adicionarCliente, atualizarCliente } =
    useContext(SistemaContext)
  const [modalAberto, setModalAberto] = useState(false)
  const [clienteEmEdicaoId, setClienteEmEdicaoId] = useState<
    string | null
  >(null)
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<
    string | null
  >(null)
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

  const paginacao = usePaginacao(clientesFiltrados, pesquisa)

  const clienteSelecionado = clientes.find(
    (cliente) => cliente.id === clienteSelecionadoId,
  )

  const petsDoClienteSelecionado = clienteSelecionado
    ? pets.filter((pet) => pet.clienteId === clienteSelecionado.id)
    : []

  function abrirModal() {
    setClienteEmEdicaoId(null)
    limparFormulario()
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setClienteEmEdicaoId(null)
    limparFormulario()
  }

  function abrirEdicaoCliente(cliente: Cliente) {
    setNome(cliente.nome)
    setWhatsapp(cliente.whatsapp)
    setEndereco(cliente.endereco)
    setBairro(cliente.bairro)
    setCidade(cliente.cidade)
    setObservacoes(cliente.observacoes)
    setClienteEmEdicaoId(cliente.id)
    setClienteSelecionadoId(null)
    setModalAberto(true)
  }

  function editarCliente() {
    if (clienteSelecionado) {
      abrirEdicaoCliente(clienteSelecionado)
    }
  }

  function limparFormulario() {
    setNome('')
    setWhatsapp('')
    setEndereco('')
    setBairro('')
    setCidade('')
    setObservacoes('')
  }

  function contarPetsDoCliente(clienteId: string) {
    return pets.filter((pet) => pet.clienteId === clienteId).length
  }

  async function salvarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (!nome.trim()) {
      alert('Preencha o nome do cliente.')
      return
    }

    if (!whatsapp.trim()) {
      alert('Preencha o WhatsApp do cliente.')
      return
    }

    const dadosCliente = {
      nome: nome.trim(),
      whatsapp: whatsapp.trim(),
      endereco: endereco.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      observacoes: observacoes.trim(),
    }

    try {
      if (clienteEmEdicaoId) {
        await atualizarCliente(clienteEmEdicaoId, dadosCliente)
      } else {
        await adicionarCliente(dadosCliente)
      }

      fecharModal()
    } catch (error) {
      alert(obterMensagemErro(error))
    }
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
        <div style={{ display: 'grid', gap: '10px' }}>
          <h1 style={{ margin: 0, lineHeight: 1.15 }}>👥 Clientes</h1>

          <p
            style={{
              margin: 0,
              lineHeight: 1.5,
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

      <div ref={paginacao.inicio} tabIndex={-1} aria-label="Início da listagem" />
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
          {paginacao.itensPagina.map((cliente) => {
            const quantidadePets = contarPetsDoCliente(cliente.id)

            return (
            <div
              key={cliente.id}
              role="button"
              tabIndex={0}
              onClick={() => setClienteSelecionadoId(cliente.id)}
              onKeyDown={(evento) => {
                if (
                  evento.target === evento.currentTarget &&
                  (evento.key === 'Enter' || evento.key === ' ')
                ) {
                  evento.preventDefault()
                  setClienteSelecionadoId(cliente.id)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
            <Card>
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
                    🐶 {quantidadePets}{' '}
                    {quantidadePets === 1
                      ? 'pet cadastrado'
                      : 'pets cadastrados'}
                  </p>
                </div>

                <div onClick={(evento) => evento.stopPropagation()}>
                  <Button
                    variant="secondary"
                    onClick={() => abrirEdicaoCliente(cliente)}
                  >
                    Editar
                  </Button>
                </div>
              </div>
            </Card>
            </div>
            )
          })}
        </div>
      )}

      <Paginacao pagina={paginacao.pagina} total={paginacao.total} quantidade={clientesFiltrados.length} onChange={paginacao.mudarPagina} />

      <Modal
        aberto={modalAberto}
        titulo={clienteEmEdicaoId ? 'Editar cliente' : 'Novo cliente'}
        onClose={fecharModal}
      >
        <p
          style={{
            margin: '0 0 20px',
            color: 'var(--color-text-muted)',
          }}
        >
          {clienteEmEdicaoId
            ? 'Atualize os dados principais do cliente.'
            : 'Cadastre os dados principais do cliente.'}
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
              {clienteEmEdicaoId ? 'Salvar alterações' : 'Salvar Cliente'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        aberto={Boolean(clienteSelecionado)}
        titulo="Detalhes do cliente"
        onClose={() => setClienteSelecionadoId(null)}
      >
        {clienteSelecionado && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <Detalhe titulo="Código" valor={clienteSelecionado.id} />
              <Detalhe titulo="Nome" valor={clienteSelecionado.nome} />
              <Detalhe
                titulo="WhatsApp"
                valor={clienteSelecionado.whatsapp}
              />
              <Detalhe
                titulo="Endereço"
                valor={clienteSelecionado.endereco}
              />
              <Detalhe titulo="Bairro" valor={clienteSelecionado.bairro} />
              <Detalhe titulo="Cidade" valor={clienteSelecionado.cidade} />
            </div>

            <Detalhe
              titulo="Observações"
              valor={clienteSelecionado.observacoes}
            />

            <div>
              <Button onClick={editarCliente}>Editar cliente</Button>
            </div>

            <div>
              <strong>
                {petsDoClienteSelecionado.length}{' '}
                {petsDoClienteSelecionado.length === 1
                  ? 'pet vinculado'
                  : 'pets vinculados'}
              </strong>

              {petsDoClienteSelecionado.length === 0 ? (
                <p
                  style={{
                    margin: '10px 0 0',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Nenhum pet cadastrado para este cliente.
                </p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    marginTop: '12px',
                  }}
                >
                  {petsDoClienteSelecionado.map((pet) => (
                    <Card key={pet.id} style={{ padding: '16px' }}>
                      <strong>{pet.nome}</strong>
                      <p
                        style={{
                          margin: '6px 0 0',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {pet.especie === 'cao' ? 'Cão' : pet.especie === 'gato' ? 'Gato' : 'Espécie não informada'} •{' '}
                        {pet.racaNome ?? 'Raça não informada'}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

type DetalheProps = {
  titulo: string
  valor: string
}

function Detalhe({ titulo, valor }: DetalheProps) {
  return (
    <div>
      <small
        style={{
          display: 'block',
          marginBottom: '4px',
          color: 'var(--color-text-muted)',
        }}
      >
        {titulo}
      </small>
      <span>{valor || 'Não informado'}</span>
    </div>
  )
}

function obterMensagemErro(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Não foi possível salvar o cliente. Tente novamente.'
}
