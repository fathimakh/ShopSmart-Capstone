import { number, text } from './rules.js'

export const reviewRules = {
  rating: number({ label: 'Rating', min: 1, max: 5, integer: true }),
  comment: text({ label: 'Comment', min: 3, max: 1000 })
}
