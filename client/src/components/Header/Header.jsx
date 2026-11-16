import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  FiColumns,
  FiHeart,
  FiLogIn,
  FiMenu,
  FiPackage,
  FiSettings,
  FiShoppingCart,
  FiTruck,
  FiUser,
  FiX,
  FiZap
} from 'react-icons/fi'
import { useShop } from '../../context/ShopContext'
import { useAuth } from '../../context/AuthContext'
import AccountNotices from '../AccountNotices/AccountNotices'
import './Header.css'

const navLinks = [
  { to: '/', label: 'Shop', icon: null, end: true, countKey: null },
  { to: '/assistant', label: 'Assistant', icon: FiZap, countKey: null },
  { to: '/compare', label: 'Compare', icon: FiColumns, countKey: 'compareCount' },
  { to: '/wishlist', label: 'Wishlist', icon: FiHeart, countKey: 'wishlistCount' },
  { to: '/orders', label: 'Orders', icon: FiPackage, countKey: null },
  { to: '/cart', label: 'Cart', icon: FiShoppingCart, countKey: 'cartCount' }
]

const adminLink = { to: '/admin', label: 'Admin', icon: FiSettings, countKey: null }
const accountLink = { to: '/account', label: 'Account', icon: FiUser, countKey: null }
const signInLink = { to: '/login', label: 'Sign in', icon: FiLogIn, countKey: null }

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const counts = useShop()
  const { user, status, isAdmin } = useAuth()

  // A stored session that is still being checked shows Account rather than flashing
  // Sign in for a moment.
  const hasSession = Boolean(user) || status === 'checking' || status === 'error'
  const links = [
    ...navLinks,
    ...(isAdmin ? [adminLink] : []),
    hasSession ? accountLink : signInLink
  ]

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <header className="header">
      <p className="header-strip">
        <FiTruck aria-hidden="true" />
        Free delivery over $150
        <span className="header-strip-divider" aria-hidden="true" />
        <span className="header-strip-note">Demo store, no real payments are taken</span>
      </p>

      <div className="container header-inner">
        <Link className="header-brand" to="/">
          <span className="header-mark" aria-hidden="true">
            S
          </span>
          <span>
            Shop<strong>Smart</strong>
          </span>
        </Link>

        <button
          type="button"
          className="header-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>

        <nav
          id="primary-navigation"
          className={menuOpen ? 'header-nav is-open' : 'header-nav'}
          aria-label="Primary"
        >
          <ul>
            {links.map(({ to, label, icon: Icon, end, countKey }) => {
              const count = countKey ? counts[countKey] : 0

              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      isActive ? 'header-link is-active' : 'header-link'
                    }
                  >
                    {Icon ? <Icon aria-hidden="true" /> : null}
                    {label}
                    {count > 0 ? (
                      <span className="header-count">
                        {count}
                        <span className="visually-hidden"> items</span>
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>

      {/* Inside the sticky header so a note that arrives mid-scroll is still seen. */}
      <AccountNotices />
    </header>
  )
}

export default Header
