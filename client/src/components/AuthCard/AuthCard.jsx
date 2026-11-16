import './AuthCard.css'

// The frame shared by the sign in and sign up pages, so both read as one flow.
function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="container auth-page">
      <section className="auth-card card" aria-labelledby="auth-heading">
        <span className="auth-mark" aria-hidden="true">
          S
        </span>
        <h1 id="auth-heading">{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <p className="auth-footer">{footer}</p> : null}
      </section>
    </div>
  )
}

export default AuthCard
