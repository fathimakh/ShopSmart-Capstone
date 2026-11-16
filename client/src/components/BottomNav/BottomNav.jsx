import { NavLink } from 'react-router-dom'
import {
  FiGrid,
  FiHeart,
  FiLogIn,
  FiPackage,
  FiSettings,
  FiShoppingCart,
  FiUser,
  FiZap
} from 'react-icons/fi'
import { useShop } from '../../context/ShopContext'
import { useAuth } from '../../context/AuthContext'
import './BottomNav.css'

const shopItem = { to: '/', label: 'Shop', icon: FiGrid, end: true, countKey: null }
const assistantItem = { to: '/assistant', label: 'Assistant', icon: FiZap, countKey: null }
const savedItem = { to: '/wishlist', label: 'Saved', icon: FiHeart, countKey: 'wishlistCount' }
const ordersItem = { to: '/orders', label: 'Orders', icon: FiPackage, countKey: null }
const adminItem = { to: '/admin', label: 'Admin', icon: FiSettings, countKey: null }
const cartItem = { to: '/cart', label: 'Cart', icon: FiShoppingCart, countKey: 'cartCount' }
const accountItem = { to: '/account', label: 'Account', icon: FiUser, countKey: null }
const signInItem = { to: '/login', label: 'Sign in', icon: FiLogIn, countKey: null }

// Phone sized screens get the usual thumb reachable bar instead of reaching for the
// menu button in the top corner.
function BottomNav() {
  const counts = useShop()
  const { user, status, isAdmin } = useAuth()
  const hasSession = Boolean(user) || status === 'checking' || status === 'error'

  // Six tabs is the most that keeps every label readable on a 360px screen, so admins
  // trade Orders (still in the menu and on the account page) for the admin area.
  const items = [
    shopItem,
    assistantItem,
    savedItem,
    isAdmin ? adminItem : ordersItem,
    cartItem,
    hasSession ? accountItem : signInItem
  ]

  return (
    <nav className="bottom-nav" aria-label="Primary mobile">
      <ul>
        {items.map(({ to, label, icon: Icon, end, countKey }) => {
          const count = countKey ? counts[countKey] : 0

          return (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'bottom-nav-link is-active' : 'bottom-nav-link')}
              >
                <span className="bottom-nav-icon">
                  <Icon aria-hidden="true" />
                  {count > 0 ? (
                    <span className="bottom-nav-count">
                      {count > 9 ? '9+' : count}
                      <span className="visually-hidden"> items</span>
                    </span>
                  ) : null}
                </span>
                {label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default BottomNav
