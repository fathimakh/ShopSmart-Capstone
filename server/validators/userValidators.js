import { USER_ROLES } from '../models/user.js'
import { oneOf } from './rules.js'

export const roleRules = {
  role: oneOf({ label: 'Role', values: USER_ROLES })
}
