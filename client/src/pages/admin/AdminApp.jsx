import { useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { FiArrowLeft, FiBox, FiGrid, FiPackage, FiSettings, FiUsers } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import AdminToasts from '../../components/admin/AdminToasts/AdminToasts'
import AdminDashboard from './AdminDashboard'
import AdminProducts from './AdminProducts'
import AdminProductEdit from './AdminProductEdit'
import AdminOrders from './AdminOrders'
import AdminOrderDetails from './AdminOrderDetails'
import AdminUsers from './AdminUsers'
import AdminNotFound from './AdminNotFound'
import './AdminApp.css'

// Absolute paths, because the app opts in to v7_relativeSplatPath and these links are
// rendered under /admin/*.
const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/admin/products', label: 'Products', icon: FiBox },
  { to: '/admin/orders', label: 'Orders', icon: FiPackage },
  { to: '/admin/users', label: 'Accounts', icon: FiUsers }
]

/**
 * The store admin area, mounted at /admin/* behind ProtectedRoute requiredRole="admin".
 * It keeps its own navigation beside the pages (a bar across the top on small screens)
 * and its own toast messages, which stay visible while the admin moves between pages.
 */
function AdminApp() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const sidebar = useRef(null)
  const content = useRef(null)
  const lastPathname = useRef(pathname)

  // Each admin page starts at its top. The app's route focus leaves focus alone while it
  // is inside the main area, which is where this menu lives, so after a menu link the
  // new page's heading is focused here instead, as it would be after any other link.
  useEffect(() => {
    if (lastPathname.current === pathname) return
    lastPathname.current = pathname
    window.scrollTo({ top: 0 })

    if (!sidebar.current || !sidebar.current.contains(document.activeElement)) return
    const heading = content.current ? content.current.querySelector('h1') : null
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }, [pathname])

  return (
    <AdminToasts>
      <div className="container admin-app">
        <aside className="admin-sidebar card" ref={sidebar}>
          <div className="admin-sidebar-head">
            <span className="admin-sidebar-icon" aria-hidden="true">
              <FiSettings />
            </span>
            <div className="admin-sidebar-who">
              <p className="admin-sidebar-title">Store admin</p>
              <p className="admin-sidebar-user">{user.name}</p>
            </div>
          </div>

          <nav className="admin-nav" aria-label="Store admin">
            <ul>
              {adminLinks.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) => (isActive ? 'admin-nav-link is-active' : 'admin-nav-link')}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <Link className="admin-sidebar-shop" to="/">
            <FiArrowLeft aria-hidden="true" />
            Back to the shop
          </Link>
        </aside>

        <div className="admin-content" ref={content}>
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="products/new" element={<AdminProductEdit />} />
            <Route path="products/:id/edit" element={<AdminProductEdit />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:ref" element={<AdminOrderDetails />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="*" element={<AdminNotFound />} />
          </Routes>
        </div>
      </div>
    </AdminToasts>
  )
}

export default AdminApp
