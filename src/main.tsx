import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HistoryControls from './character/HistoryControls'
import TutorialMode from './character/TutorialMode'
import { installSkinMotion } from './skins/motion'
import './style.css'

installSkinMotion()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <TutorialMode />
    <HistoryControls />
    <App />
  </React.StrictMode>,
)
