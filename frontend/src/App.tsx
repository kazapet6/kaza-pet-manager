import { useState, type FormEvent } from 'react'
import './App.css'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Clientes from './pages/Clientes'
import Pets from './pages/Pets'

function App() {
  const [estaLogado, setEstaLogado] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState('dashboard')
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')

  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  function entrarNoSistema(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (!usuario.trim() || !senha.trim()) {
      alert('Preencha o usuário e a senha.')
      return
    }

    setEstaLogado(true)
  }

  function sairDoSistema() {
    setEstaLogado(false)
    setSenha('')
  }

  const avatarLetra = usuario.trim()
    ? usuario.trim().charAt(0).toUpperCase()
    : 'A'

  const nomePagina =
    paginaAtual === 'agenda'
      ? 'Agenda'
      : paginaAtual === 'clientes'
        ? 'Clientes'
        : paginaAtual === 'pets'
          ? 'Pets'
          : paginaAtual === 'pacotes'
            ? 'Pacotes'
            : paginaAtual === 'financeiro'
              ? 'Financeiro'
              : 'Visão geral'

  function renderizarPagina() {
    switch (paginaAtual) {
      case 'agenda':
        return <Agenda />

      case 'clientes':
        return <Clientes />

      case 'pets':
        return <Pets />

      case 'pacotes':
        return (
          <section className="panel" style={{ padding: '32px' }}>
            <h2>Pacotes</h2>
            <p>Esta página de pacotes está em construção.</p>
          </section>
        )

      case 'financeiro':
        return (
          <section className="panel" style={{ padding: '32px' }}>
            <h2>Financeiro</h2>
            <p>Esta página financeira está em construção.</p>
          </section>
        )

      case 'dashboard':
      default:
        return <Dashboard />
    }
  }

  if (!estaLogado) {
    return (
      <main className="pagina-login">
        <section className="cartao-login">
          <div className="login-hero">
            <div className="icone-logo">🐾</div>

            <div>
              <h1>KAZA PET</h1>

              <p className="subtitulo">
                Gerencie clientes, pets e agendas com estilo
              </p>
            </div>
          </div>

          <form
            className="formulario-login"
            onSubmit={entrarNoSistema}
          >
            <label htmlFor="usuario">Usuário</label>

            <input
              id="usuario"
              type="text"
              placeholder="Digite seu usuário"
              value={usuario}
              onChange={(evento) =>
                setUsuario(evento.target.value)
              }
            />

            <label htmlFor="senha">Senha</label>

            <input
              id="senha"
              type="password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={(evento) =>
                setSenha(evento.target.value)
              }
            />

            <button type="submit">Entrar</button>
          </form>

          <p className="versao">
            KAZA PET Manager • versão 0.2
          </p>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside
        className="sidebar"
        aria-label="Menu lateral"
      >
        <div className="brand">
          <div className="brand-mark">KP</div>

          <div>
            <strong>KAZA PET</strong>
            <small>Manager</small>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={
              paginaAtual === 'dashboard'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('dashboard')}
          >
            <span className="nav-icon">🏠</span>
            <span>Visão geral</span>
          </button>

          <button
            className={
              paginaAtual === 'agenda'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('agenda')}
          >
            <span className="nav-icon">📅</span>
            <span>Agenda</span>
          </button>

          <button
            className={
              paginaAtual === 'clientes'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('clientes')}
          >
            <span className="nav-icon">👥</span>
            <span>Clientes</span>
          </button>

          <button
            className={
              paginaAtual === 'pets'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('pets')}
          >
            <span className="nav-icon">🐶</span>
            <span>Pets</span>
          </button>

          <button
            className={
              paginaAtual === 'pacotes'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('pacotes')}
          >
            <span className="nav-icon">📦</span>
            <span>Pacotes</span>
          </button>

          <button
            className={
              paginaAtual === 'financeiro'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('financeiro')}
          >
            <span className="nav-icon">💰</span>
            <span>Financeiro</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="logout"
            onClick={sairDoSistema}
          >
            Sair
          </button>

          <p className="sidebar-note">
            Versão 0.2 • Dashboard premium
          </p>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              Painel • {nomePagina}
            </p>

            <h1>Olá, {usuario}!</h1>

            <p className="date-label">
              {dataFormatada}
            </p>
          </div>

          <div className="profile-card">
            <div className="profile-avatar">
              {avatarLetra}
            </div>

            <div>
              <strong>{usuario}</strong>
              <small>Administrador</small>
            </div>
          </div>
        </header>

        {renderizarPagina()}
      </main>
    </div>
  )
}

export default App