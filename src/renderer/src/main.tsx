import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/widget.css'
import './styles/player.css'
import './styles/lyrics.css'
import './styles/panels.css'
import './styles/android.css'
import './styles/polish.css'
import './styles/redesign.css'
import './styles/stage.css'
import { useSettings } from './store/settings'

// let CSS honour the in-app reduced-motion setting (the OS preference is handled by media queries)
useSettings.subscribe((st) => {
  document.documentElement.dataset.motion = st.settings.reducedMotion === 'on' ? 'off' : 'on'
  document.documentElement.dataset.rim = st.settings.rimLight ? 'on' : 'off'
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
