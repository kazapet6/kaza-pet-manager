import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App'
import { SistemaProvider } from './context/SistemaProvider'
import { AgendaProvider } from './context/AgendaProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SistemaProvider>
      <AgendaProvider>
        <App />
      </AgendaProvider>
    </SistemaProvider>
  </StrictMode>,
)
