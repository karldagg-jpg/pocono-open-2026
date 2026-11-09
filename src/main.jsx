import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/swClient'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Keep the app on the phone so it opens with no signal (production builds only).
registerServiceWorker({ base: import.meta.env.BASE_URL, prod: import.meta.env.PROD })
