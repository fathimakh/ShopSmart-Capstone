import { FiSettings } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import usePageTitle from '../../hooks/usePageTitle'
import './AdminApp.css'

// Mounted at /admin/* behind ProtectedRoute requiredRole="admin", so only store admins
// get here. The admin pages add their own nested routes below this one.
function AdminApp() {
  usePageTitle('Store admin')
  const { user } = useAuth()

  return (
    <div className="container admin-app">
      <header className="admin-app-header card">
        <span className="admin-app-icon" aria-hidden="true">
          <FiSettings />
        </span>
        <div>
          <h1>Store admin</h1>
          <p>Signed in as {user.email}. Products, orders and accounts are managed here.</p>
        </div>
      </header>
    </div>
  )
}

export default AdminApp
