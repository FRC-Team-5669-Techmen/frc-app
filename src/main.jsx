import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './theme.css'
import './App.css'
import './plate.css'
import { APP_PLATE } from './plate.js'
import App from './App.jsx'

// The plate's one switch (src/plate.js): every rule in plate.css is keyed on
// this class on <html>, so an empty constant leaves the app exactly as it was.
if (APP_PLATE) document.documentElement.classList.add(APP_PLATE)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
