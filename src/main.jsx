import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/design-system.css'

const EXTENSION_CONNECTION_ERROR = 'Could not establish connection. Receiving end does not exist.'

window.addEventListener('error', (event) => {
  const message = String(event?.message || '')
  if (message.includes(EXTENSION_CONNECTION_ERROR)) {
    event.preventDefault()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reasonMessage = String(event?.reason?.message || event?.reason || '')
  if (reasonMessage.includes(EXTENSION_CONNECTION_ERROR)) {
    event.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
