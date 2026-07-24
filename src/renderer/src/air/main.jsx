import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './air.css'

// Air's mount. Deliberately shorter than the main renderer's entry: there is no
// per-user localStorage scope to install here, because Air has no identity
// system to scope to. Everything Air remembers is one machine's preferences.

ReactDOM.createRoot(document.getElementById('air-root')).render(<App />)
