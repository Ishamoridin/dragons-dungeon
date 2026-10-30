import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HistoryControls from './character/HistoryControls'
import './style.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <HistoryControls />
    <App />
  </React.StrictMode>,
)
