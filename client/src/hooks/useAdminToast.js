import { createContext, useContext } from 'react'

/**
 * Filled in by the AdminToasts component, which owns the message list and the live region
 * that announces it. Kept in its own module so hooks and pages can reach it without
 * importing the component.
 */
export const AdminToastContext = createContext(null)

const ignore = () => {}

/**
 * Returns notify(message, { tone }) for short results such as "Product saved". Outside
 * the admin area (a test rendering one component, say) it quietly does nothing.
 */
export default function useAdminToast() {
  return useContext(AdminToastContext) || ignore
}
