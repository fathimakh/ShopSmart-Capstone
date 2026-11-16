import { Link } from 'react-router-dom'
import { FiCompass } from 'react-icons/fi'
import EmptyState from '../../components/EmptyState/EmptyState'
import usePageTitle from '../../hooks/usePageTitle'

// Inside the admin area an unknown address keeps the admin navigation on screen, rather
// than dropping the admin on the shop's own not found page.
function AdminNotFound() {
  usePageTitle('Admin page not found')

  return (
    <EmptyState
      icon={FiCompass}
      headingLevel={1}
      title="There is no admin page here"
      message="The address may be mistyped, or the page has moved. The menu links to every admin page."
      action={
        <Link className="btn btn-primary" to="/admin">
          Go to the dashboard
        </Link>
      }
    />
  )
}

export default AdminNotFound
