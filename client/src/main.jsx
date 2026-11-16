import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CatalogProvider } from './context/CatalogContext'
import { ShopProvider } from './context/ShopContext'
import App from './App'
import './index.css'
import './styles/browse.css'

// Opting in to the React Router v7 behaviour now keeps the console free of upgrade
// warnings. With relative splat paths, links inside /admin/* resolve from the full URL.
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

// ShopProvider sits inside AuthProvider because the saved lists follow the signed in account.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={routerFuture}>
      <AuthProvider>
        <CatalogProvider>
          <ShopProvider>
            <App />
          </ShopProvider>
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
