import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerGolfVoices } from './utils/sfx'
import App from './App'

// Register golf SFX voices before anything renders.
registerGolfVoices()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
