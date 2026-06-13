import { randomBytes } from 'crypto'

// One-shot "pending sign-in" tickets: a provider flow completed but no
// identity matched, so the profile (and GitHub token) parks here until the
// renderer creates the user and claims it via users-create { providerTicket }.
// Tickets are validated BEFORE createUser so create+link stays atomic.

const TICKET_TTL = 5 * 60 * 1000
const tickets = new Map()

export function createTicket(payload) {
  // Sweep expired tickets here — abandoned sign-ins otherwise pile up for the
  // app's whole lifetime (each holds a profile and possibly a token string).
  const now = Date.now()
  for (const [tid, t] of tickets) {
    if (now > t.expiresAt) tickets.delete(tid)
  }
  const id = randomBytes(12).toString('hex')
  tickets.set(id, { ...payload, expiresAt: now + TICKET_TTL })
  return id
}

export function peekTicket(id) {
  const ticket = tickets.get(id)
  if (!ticket) return null
  if (Date.now() > ticket.expiresAt) {
    tickets.delete(id)
    return null
  }
  return ticket
}

export function consumeTicket(id) {
  const ticket = peekTicket(id)
  if (ticket) tickets.delete(id)
  return ticket
}
