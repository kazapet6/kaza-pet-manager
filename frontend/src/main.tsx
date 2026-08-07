import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App'
import { SistemaProvider } from './context/SistemaProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SistemaProvider>
      <App />
    </SistemaProvider>
  </StrictMode>,
)