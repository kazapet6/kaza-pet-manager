import Paginacao from '../components/ui/Paginacao'
import { usePaginacao } from '../components/ui/usePaginacao'
import { useContext, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { SistemaContext } from '../context/SistemaContext'
import EditorPet from '../components/EditorPet'
import type { Pet } from '../types/Pet'

export default function Pets() {
  const { clientes, pets } =
    useContext(SistemaContext)
  const [editor, setEditor] = useState<{ pet?: Pet } | null>(null)
  const [petSelecionadoId, setPetSelecionadoId] = useState<string | null>(null)
  const [tutorExpandido, setTutorExpandido] = useState(false)
  const [pesquisa, setPesquisa] = useState('')
  const petsFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()

    if (!termo) {
      return pets
    }

    return pets.filter((pet) => {
      return (
        pet.nome.toLowerCase().includes(termo) ||
        (pet.racaNome ?? '').toLowerCase().includes(termo) ||
        pet.id.toLowerCase().includes(termo) ||
        pet.clienteId.toLowerCase().includes(termo)
      )
    })
  }, [pets, pesquisa])

  const paginacao = usePaginacao(petsFiltrados, pesquisa)

  const petSelecionado = pets.find((pet) => pet.id === petSelecionadoId)
  const tutorDoPet = petSelecionado
    ? clientes.find((cliente) => cliente.id === petSelecionado.clienteId)
    : undefined

  function abrirDetalhesDoPet(id: string) {
    setPetSelecionadoId(id)
    setTutorExpandido(false)
  }

  function fecharDetalhesDoPet() {
    setPetSelecionadoId(null)
    setTutorExpandido(false)
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
          <h1 style={{ margin: 0, lineHeight: 1.15 }}>🐶 Pets</h1>

          <p
            style={{
              margin: 0,
              lineHeight: 1.5,
              color: 'var(--color-text-muted)',
            }}
          >
            Gerencie todos os pets cadastrados.
          </p>
        </div>

        <Button onClick={() => setEditor({})}>
          + Novo Pet
        </Button>
      </div>

      <Input
        placeholder="🔍 Pesquisar por nome, raça, cliente ou código..."
        value={pesquisa}
        onChange={(evento) => setPesquisa(evento.target.value)}
      />

      <div ref={paginacao.inicio} tabIndex={-1} aria-label="Início da listagem" />
      {petsFiltrados.length === 0 ? (
        <Card
          style={{
            padding: '48px',
            textAlign: 'center',
            border: '1px dashed var(--color-border)',
            background: 'var(--color-surface-muted)',
            marginTop: '24px',
          }}
        >
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>
            🐾
          </div>

          <strong style={{ fontSize: '18px' }}>
            {pets.length === 0
              ? 'Nenhum pet cadastrado'
              : 'Nenhum pet encontrado'}
          </strong>

          <p
            style={{
              margin: '8px 0 0',
              color: 'var(--color-text-muted)',
            }}
          >
            {pets.length === 0
              ? 'Cadastre o primeiro pet para começar.'
              : 'Tente pesquisar usando outro termo.'}
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          {paginacao.itensPagina.map((pet) => (
            <div
              key={pet.id}
              role="button"
              tabIndex={0}
              onClick={() => abrirDetalhesDoPet(pet.id)}
              onKeyDown={(evento) => {
                if (
                  evento.target === evento.currentTarget &&
                  (evento.key === 'Enter' || evento.key === ' ')
                ) {
                  evento.preventDefault()
                  abrirDetalhesDoPet(pet.id)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
            <Card>
              <span
                style={{
                  color: 'var(--color-primary)',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                {pet.id}
              </span>

              <h2 style={{ margin: '10px 0 6px' }}>
                {pet.especie === 'cao' ? '🐶' : pet.especie === 'gato' ? '🐱' : '🐾'} {pet.nome}
              </h2>

              <p style={{ margin: '4px 0' }}>
                {pet.racaNome ?? 'Raça não informada'} • {formatarPorte(pet.porte)}
              </p>

              {cadastroIncompleto(pet) && <p style={{ margin: '8px 0', color: 'var(--color-warning, #9a6700)', fontWeight: 700 }}>Cadastro incompleto</p>}

              <p
                style={{
                  margin: '4px 0',
                  color: 'var(--color-text-muted)',
                }}
              >
                Tutor: {pet.clienteId}
              </p>

              <p
                style={{
                  margin: '4px 0 16px',
                  color: 'var(--color-text-muted)',
                }}
              >
                {pet.peso !== null
                  ? `${pet.peso} kg`
                  : 'Peso não informado'}
              </p>

              <div onClick={(evento) => evento.stopPropagation()}>
                <Button
                  variant="secondary"
                  onClick={() => { fecharDetalhesDoPet(); setEditor({ pet }) }}
                >
                  Editar
                </Button>
              </div>
            </Card>
            </div>
          ))}
        </div>
      )}

      <Paginacao pagina={paginacao.pagina} total={paginacao.total} quantidade={petsFiltrados.length} onChange={paginacao.mudarPagina} />

      {editor && <EditorPet pet={editor.pet} onClose={() => setEditor(null)} />}

      <Modal
        aberto={Boolean(petSelecionado)}
        titulo="Detalhes do pet"
        onClose={fecharDetalhesDoPet}
      >
        {petSelecionado && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <Detalhe titulo="Código" valor={petSelecionado.id} />
              <Detalhe titulo="Nome" valor={petSelecionado.nome} />
              <Detalhe
                titulo="Espécie"
                valor={petSelecionado.especie === 'cao' ? 'Cão' : petSelecionado.especie === 'gato' ? 'Gato' : 'Não informado'}
              />
              <Detalhe titulo="Raça" valor={petSelecionado.racaNome ?? 'Não informado'} />
              <Detalhe
                titulo="Sexo"
                valor={petSelecionado.sexo === 'macho' ? 'Macho' : petSelecionado.sexo === 'femea' ? 'Fêmea' : 'Não informado'}
              />
              <Detalhe
                titulo="Porte"
                valor={formatarPorte(petSelecionado.porte)}
              />
              <Detalhe titulo="Pelagem" valor={formatarPelagem(petSelecionado.pelagem)} />
              <Detalhe
                titulo="Peso"
                valor={
                  petSelecionado.peso === null
                    ? ''
                    : `${petSelecionado.peso} kg`
                }
              />
              <Detalhe titulo="Cor" valor={petSelecionado.cor} />
              <Detalhe
                titulo="Data de nascimento"
                valor={petSelecionado.dataNascimento}
              />
              <Detalhe
                titulo="Castrado"
                valor={petSelecionado.castrado === null ? 'Não informado' : petSelecionado.castrado ? 'Sim' : 'Não'}
              />
              <Detalhe
                titulo="Temperamento"
                valor={formatarTemperamento(petSelecionado.temperamento)}
              />
              <Detalhe
                titulo="Data de cadastro"
                valor={formatarDataCadastro(petSelecionado.criadoEm)}
              />
            </div>

            <Detalhe
              titulo="Observações"
              valor={petSelecionado.observacoes}
            />

            <div>
              <strong>Tutor</strong>

              {tutorDoPet ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setTutorExpandido((valor) => !valor)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault()
                      setTutorExpandido((valor) => !valor)
                    }
                  }}
                  style={{ cursor: 'pointer', marginTop: '12px' }}
                >
                  <Card style={{ padding: '16px' }}>
                    <strong>{tutorDoPet.nome}</strong>
                    <p
                      style={{
                        margin: '6px 0 0',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {tutorDoPet.id} • {tutorDoPet.whatsapp}
                    </p>

                    {tutorExpandido && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(2, minmax(0, 1fr))',
                          gap: '12px',
                          marginTop: '16px',
                        }}
                      >
                        <Detalhe
                          titulo="Endereço"
                          valor={tutorDoPet.endereco}
                        />
                        <Detalhe titulo="Bairro" valor={tutorDoPet.bairro} />
                        <Detalhe titulo="Cidade" valor={tutorDoPet.cidade} />
                        <Detalhe
                          titulo="Observações"
                          valor={tutorDoPet.observacoes}
                        />
                      </div>
                    )}

                    <small
                      style={{
                        display: 'block',
                        marginTop: '12px',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {tutorExpandido
                        ? 'Ocultar informações'
                        : 'Ver informações do responsável'}
                    </small>
                  </Card>
                </div>
              ) : (
                <p
                  style={{
                    margin: '10px 0 0',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Responsável não encontrado.
                </p>
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

function formatarPorte(porte: Pet['porte']) {
  if (!porte) return 'Não informado'
  const nomes = {
    mini: 'Mini',
    pequeno: 'Pequeno',
    medio: 'Médio',
    grande: 'Grande',
    gigante: 'Gigante',
  }

  return nomes[porte]
}

function formatarTemperamento(temperamento: Pet['temperamento']) {
  if (!temperamento) return 'Não informado'
  const nomes = {
    calmo: 'Calmo',
    moderado: 'Moderado',
    dificil: 'Difícil',
  }

  return nomes[temperamento]
}

function formatarPelagem(pelagem: Pet['pelagem']) {
  if (!pelagem) return 'Não informado'
  return { curta: 'Curta', media: 'Média', longa: 'Longa' }[pelagem]
}

function cadastroIncompleto(pet: Pet) {
  return [pet.especie, pet.racaId, pet.sexo, pet.porte, pet.pelagem, pet.temperamento, pet.castrado].some((valor) => valor === null)
}

function formatarDataCadastro(valor: string) {
  const data = new Date(valor)

  return Number.isNaN(data.getTime())
    ? 'Não informado'
    : data.toLocaleDateString('pt-BR')
}
