import './AdminPageHeader.css'

// Every admin page opens with this, so each has exactly one h1 for the route focus to
// land on, and its main actions sit in the same place on every page. headingRef lets a
// page put focus back on the heading when the control that had it goes away (a retry
// button replaced by a loading list, say).
function AdminPageHeader({ title, description, actions, eyebrow, headingRef }) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header-text">
        {eyebrow ? <div className="admin-page-header-eyebrow">{eyebrow}</div> : null}
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-header-actions">{actions}</div> : null}
    </header>
  )
}

export default AdminPageHeader
