import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiHeart, FiLock, FiLogOut, FiPackage, FiSettings, FiUser } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import FormField from '../components/FormField/FormField'
import { compactDigits, validatePasswordChange, validateProfile } from '../utils/authForms'
import { formatDate } from '../utils/format'
import usePageTitle from '../hooks/usePageTitle'
import './Account.css'

// Form inputs and the API paths they are saved under. The paths are also how the
// server names a field in its errors ('address.phone').
const profilePaths = {
  name: 'name',
  recipient: 'address.name',
  phone: 'address.phone',
  street: 'address.address',
  city: 'address.city',
  state: 'address.state',
  pincode: 'address.pincode'
}

const emptyPasswords = { currentPassword: '', newPassword: '', confirmPassword: '' }

function profileValues(user) {
  const address = user.address || {}
  return {
    name: user.name || '',
    recipient: address.name || '',
    phone: address.phone || '',
    street: address.address || '',
    city: address.city || '',
    state: address.state || '',
    pincode: address.pincode || ''
  }
}

// Server errors come keyed by API path; the form knows its inputs by their own names.
function errorsByInput(error, paths) {
  return Object.entries(paths).reduce((errors, [input, path]) => {
    if (error.fieldErrors[path]) errors[input] = error.fieldErrors[path]
    return errors
  }, {})
}

function focusField(prefix, name) {
  const field = document.getElementById(`${prefix}-${name}`)
  if (field) field.focus()
}

function Account() {
  usePageTitle('Your account')
  const { user, isAdmin, updateProfile, changePassword, logout } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(() => profileValues(user))
  const [profileErrors, setProfileErrors] = useState({})
  const [profileStatus, setProfileStatus] = useState({ state: 'idle', message: '' })

  const [passwords, setPasswords] = useState(emptyPasswords)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordStatus, setPasswordStatus] = useState({ state: 'idle', message: '' })

  const [signingOut, setSigningOut] = useState(null)
  const [signOutError, setSignOutError] = useState('')

  const updateProfileField = (field) => (event) => {
    setProfile((current) => ({ ...current, [field]: event.target.value }))
  }

  const updatePasswordField = (field) => (event) => {
    setPasswords((current) => ({ ...current, [field]: event.target.value }))
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    const clientErrors = validateProfile(profile)
    setProfileErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      setProfileStatus({ state: 'idle', message: '' })
      focusField('profile', Object.keys(clientErrors)[0])
      return
    }

    setProfileStatus({ state: 'saving', message: 'Saving your details' })
    try {
      const saved = await updateProfile({
        name: profile.name.trim(),
        address: {
          name: profile.recipient.trim(),
          phone: compactDigits(profile.phone),
          address: profile.street.trim(),
          city: profile.city.trim(),
          state: profile.state.trim(),
          pincode: compactDigits(profile.pincode)
        }
      })
      setProfile(profileValues(saved))
      setProfileStatus({ state: 'saved', message: 'Your details are saved.' })
    } catch (error) {
      const fieldErrors = errorsByInput(error, profilePaths)
      setProfileErrors(fieldErrors)
      setProfileStatus({ state: 'error', message: error.message })
      if (Object.keys(fieldErrors).length) focusField('profile', Object.keys(fieldErrors)[0])
    }
  }

  const savePassword = async (event) => {
    event.preventDefault()
    const clientErrors = validatePasswordChange(passwords)
    setPasswordErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      setPasswordStatus({ state: 'idle', message: '' })
      focusField('password', Object.keys(clientErrors)[0])
      return
    }

    setPasswordStatus({ state: 'saving', message: 'Changing your password' })
    try {
      await changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      })
      setPasswords(emptyPasswords)
      setPasswordStatus({
        state: 'saved',
        message: 'Password changed. Any other device signed in to this account has been signed out.'
      })
    } catch (error) {
      const fieldErrors = errorsByInput(error, {
        currentPassword: 'currentPassword',
        newPassword: 'newPassword'
      })
      setPasswordErrors(fieldErrors)
      setPasswordStatus({ state: 'error', message: error.message })
      if (Object.keys(fieldErrors).length) focusField('password', Object.keys(fieldErrors)[0])
    }
  }

  const signOut = async (allDevices) => {
    setSigningOut(allDevices ? 'all' : 'this')
    setSignOutError('')
    try {
      await logout({ allDevices })
      navigate('/', { replace: true })
    } catch (error) {
      setSignOutError(error.message)
      setSigningOut(null)
    }
  }

  const statusClass = (status) =>
    status.state === 'error' ? 'account-status is-error' : 'account-status'

  return (
    <div className="container account">
      <header className="account-header card">
        <span className="account-avatar" aria-hidden="true">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="account-identity">
          <h1>Your account</h1>
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <p className="account-meta">
            <span className={isAdmin ? 'badge badge-accent' : 'badge badge-primary'}>
              {isAdmin ? 'Store admin' : 'Shopper'}
            </span>
            {user.createdAt ? <span>Member since {formatDate(user.createdAt)}</span> : null}
          </p>
        </div>
        <nav className="account-links" aria-label="Account shortcuts">
          <Link className="btn btn-outline" to="/orders">
            <FiPackage aria-hidden="true" />
            Your orders
          </Link>
          <Link className="btn btn-outline" to="/wishlist">
            <FiHeart aria-hidden="true" />
            Wishlist
          </Link>
          {isAdmin ? (
            <Link className="btn btn-primary" to="/admin">
              <FiSettings aria-hidden="true" />
              Store admin
            </Link>
          ) : null}
        </nav>
      </header>

      <div className="account-grid">
        <section className="account-panel card" aria-labelledby="profile-heading">
          <h2 id="profile-heading">
            <FiUser aria-hidden="true" />
            Profile and delivery address
          </h2>
          <p className="account-panel-intro">
            Checkout fills the delivery form in from this address. Leave a field empty to clear it.
          </p>

          <form className="account-form" onSubmit={saveProfile} noValidate>
            <FormField
              id="profile-name"
              label="Full name"
              autoComplete="name"
              value={profile.name}
              onChange={updateProfileField('name')}
              error={profileErrors.name}
            />

            <fieldset className="account-fieldset">
              <legend>Saved delivery address</legend>
              <div className="account-form-grid">
                <FormField
                  id="profile-recipient"
                  label="Deliver to"
                  autoComplete="shipping name"
                  value={profile.recipient}
                  onChange={updateProfileField('recipient')}
                  error={profileErrors.recipient}
                />
                <FormField
                  id="profile-phone"
                  label="Phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="shipping tel-national"
                  value={profile.phone}
                  onChange={updateProfileField('phone')}
                  error={profileErrors.phone}
                  hint="10 digits"
                />
                <div className="account-form-wide">
                  <FormField
                    id="profile-street"
                    label="Street address"
                    autoComplete="shipping street-address"
                    value={profile.street}
                    onChange={updateProfileField('street')}
                    error={profileErrors.street}
                  />
                </div>
                <FormField
                  id="profile-city"
                  label="City"
                  autoComplete="shipping address-level2"
                  value={profile.city}
                  onChange={updateProfileField('city')}
                  error={profileErrors.city}
                />
                <FormField
                  id="profile-state"
                  label="State"
                  autoComplete="shipping address-level1"
                  value={profile.state}
                  onChange={updateProfileField('state')}
                  error={profileErrors.state}
                />
                <FormField
                  id="profile-pincode"
                  label="PIN code"
                  inputMode="numeric"
                  autoComplete="shipping postal-code"
                  value={profile.pincode}
                  onChange={updateProfileField('pincode')}
                  error={profileErrors.pincode}
                  hint="6 digits"
                />
              </div>
            </fieldset>

            <div className="account-form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={profileStatus.state === 'saving'}
              >
                {profileStatus.state === 'saving' ? 'Saving' : 'Save changes'}
              </button>
              <p className={statusClass(profileStatus)} role="status">
                {profileStatus.state === 'saving' ? '' : profileStatus.message}
              </p>
            </div>
          </form>
        </section>

        <div className="account-side">
          <section className="account-panel card" aria-labelledby="password-heading">
            <h2 id="password-heading">
              <FiLock aria-hidden="true" />
              Change password
            </h2>
            <p className="account-panel-intro">
              Changing it signs out every other device that uses this account.
            </p>

            <form className="account-form" onSubmit={savePassword} noValidate>
              <FormField
                id="password-currentPassword"
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={updatePasswordField('currentPassword')}
                error={passwordErrors.currentPassword}
              />
              <FormField
                id="password-newPassword"
                label="New password"
                type="password"
                autoComplete="new-password"
                hint="At least 8 characters, with a letter and a number."
                value={passwords.newPassword}
                onChange={updatePasswordField('newPassword')}
                error={passwordErrors.newPassword}
              />
              <FormField
                id="password-confirmPassword"
                label="Repeat the new password"
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={updatePasswordField('confirmPassword')}
                error={passwordErrors.confirmPassword}
              />
              <div className="account-form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={passwordStatus.state === 'saving'}
                >
                  {passwordStatus.state === 'saving' ? 'Changing password' : 'Change password'}
                </button>
                <p className={statusClass(passwordStatus)} role="status">
                  {passwordStatus.state === 'saving' ? '' : passwordStatus.message}
                </p>
              </div>
            </form>
          </section>

          <section className="account-panel card" aria-labelledby="signout-heading">
            <h2 id="signout-heading">
              <FiLogOut aria-hidden="true" />
              Sign out
            </h2>
            <p className="account-panel-intro">
              Signing out clears your cart and wishlist from this device. They stay saved to
              your account for next time.
            </p>
            <div className="account-signout">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => signOut(false)}
                disabled={Boolean(signingOut)}
              >
                {signingOut === 'this' ? 'Signing out' : 'Sign out'}
              </button>
              <button
                type="button"
                className="btn btn-ghost account-signout-all"
                onClick={() => signOut(true)}
                disabled={Boolean(signingOut)}
              >
                {signingOut === 'all' ? 'Signing out everywhere' : 'Sign out of every device'}
              </button>
            </div>
            {signOutError ? (
              <p className="account-status is-error" role="alert">
                {signOutError}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Account
