import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FiUserPlus } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import AuthCard from '../components/AuthCard/AuthCard'
import FormField from '../components/FormField/FormField'
import { getFieldErrors } from '../services/http'
import { returnPath, validateRegister } from '../utils/authForms'
import usePageTitle from '../hooks/usePageTitle'

function focusField(name) {
  const field = document.getElementById(`register-${name}`)
  if (field) field.focus()
}

function Register() {
  usePageTitle('Create an account')
  const { user, register } = useAuth()
  const location = useLocation()
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={returnPath(location.state)} replace />

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const clientErrors = validateRegister(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusField(Object.keys(clientErrors)[0])
      return
    }

    setSubmitting(true)
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password
      })
    } catch (error) {
      // A taken email belongs next to the email field, where the shopper can fix it.
      const fieldErrors =
        error.code === 'EMAIL_TAKEN' ? { email: error.message } : getFieldErrors(error)
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors)
        focusField(Object.keys(fieldErrors)[0])
      } else {
        setFormError(error.message)
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Save your cart and wishlist, check out faster and track every order."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state}>
            Sign in
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField
          id="register-name"
          label="Full name"
          autoComplete="name"
          value={values.name}
          onChange={update('name')}
          error={errors.name}
        />
        <FormField
          id="register-email"
          label="Email address"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={update('email')}
          error={errors.email}
        />
        <FormField
          id="register-password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
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

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          <FiUserPlus aria-hidden="true" />
          {submitting ? 'Creating your account' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  )
}

export default Register
