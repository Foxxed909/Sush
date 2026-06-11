import React from 'react'
import ReactDOM from 'react-dom/client'
import { initUserScope } from './lib/userScope'
// Install the per-user localStorage scope BEFORE App renders — every Sush key
// read after this point is transparently namespaced to the signed-in identity.
initUserScope()

import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
