import { object, text } from './rules.js'

// Any JSON object, as long as it stays small enough to go into a prompt.
function jsonObject({ label, maxLength, required = false }) {
  return {
    label,
    required,
    check(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return `${label} must be an object`
      return JSON.stringify(value).length > maxLength ? `${label} is too long` : null
    }
  }
}

export const searchRules = {
  query: text({ label: 'Message', min: 2, max: 300 }),
  // The earlier turn of the conversation, so a follow up such as "only Apple" refines it.
  previous: object({
    label: 'Earlier request',
    required: false,
    fields: {
      query: text({ label: 'Earlier message', max: 300 }),
      filters: jsonObject({ label: 'Earlier filters', maxLength: 2000 })
    }
  })
}
