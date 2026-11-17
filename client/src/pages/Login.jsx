import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FiClock, FiLogIn, FiX } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import AuthCard from '../components/AuthCard/AuthCard'
import FormField from '../components/FormField/FormField'
import { getFieldErrors } from '../services/http'
import { returnPath, validateLogin } from '../utils/authForms'
import usePageTitle from '../hooks/usePageTitle'
import './Login.css'

// The two accounts npm run seed creates, offered so the demo can be explored in one click.
const demoAccounts = [
  { label: 'demo shopper', email: 'demo@shopsmart.dev', password: 'Demo@1234' },
  { label: 'store admin', email: 'admin@shopsmart.dev', password: 'Admin@1234' }
]

function focusField(name) {
  const field = document.getElementById(`login-${name}`)
  if (field) field.focus()
}

function Login() {
  usePageTitle('Sign in')
  const { user, login, sessionNotice, clearSessionNotice } = useAuth()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // 'form' while the form is sending, or the email of the demo account being used.
  const [submitting, setSubmitting] = useState(null)

  // Signed in (or just signed in): carry on to the page that asked for it.
  if (user) return <Navigate to={returnPath(location.state)} replace />

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  const signIn = async (credentials, source) => {
    setSubmitting(source)
    setFormError('')
    try {
      await login({ email: credentials.email.trim(), password: credentials.password })
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors)
        focusField(Object.keys(fieldErrors)[0])
      } else {
        setFormError(error.message)
      }
      setSubmitting(null)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // The buttons stay focusable while a sign in is on its way (aria-disabled), so a
    // refused attempt leaves focus where it was; a second press is ignored here.
    if (submitting) return
    const clientErrors = validateLogin(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusField(Object.keys(clientErrors)[0])
      return
    }
    signIn(values, 'form')
  }

  const signInWithDemo = (account) => {
    if (submitting) return
    setValues({ email: account.email, password: account.password })
    setErrors({})
    signIn(account, account.email)
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Your cart, wishlist and orders follow you to every device."
      footer={
        <>
          New to ShopSmart?{' '}
          <Link to="/register" state={location.state}>
            Create an account
          </Link>
        </>
      }
    >
      {sessionNotice ? (
        <div className="auth-notice" role="status">
          <FiClock aria-hidden="true" />
          <p>
            <strong>Session ended. </strong>
            {sessionNotice}
          </p>
          <button type="button" onClick={clearSessionNotice}>
            <FiX aria-hidden="true" />
            <span className="visually-hidden">Dismiss notice</span>
          </button>
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField
          id="login-email"
          label="Email address"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={update('email')}
          error={errors.email}
        />
        <FormField
          id="login-password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
        />
        <label className="auth-show-password">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          Show password
        </label>

        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-block" aria-disabled={Boolean(submitting)}>
          <FiLogIn aria-hidden="true" />
          {submitting === 'form' ? 'Signing in' : 'Sign in'}
        </button>
      </form>

      <section className="login-demo" aria-labelledby="login-demo-heading">
        <h2 id="login-demo-heading">Trying the demo?</h2>
        <p>Sign in with one of the seeded accounts.</p>
        <div className="login-demo-buttons">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              type="button"
              className="btn btn-outline"
              onClick={() => signInWithDemo(account)}
              aria-disabled={Boolean(submitting)}
            >
              {submitting === account.email ? (
                'Signing in'
              ) : (
                <>
                  <span className="visually-hidden">Sign in as </span>
                  {account.label}
                </>
              )}
            </button>
          ))}
        </div>
        <dl className="login-demo-accounts">
          {demoAccounts.map((account) => (
            <div key={account.email}>
              <dt>{account.label}</dt>
              <dd>
                {account.email} / {account.password}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </AuthCard>
  )
}

export default Login
