const RESERVED_ADMIN_USERNAMES = new Set(['admin', 'administrator', 'administrators'])

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function isReservedAdminUsername(value) {
  return RESERVED_ADMIN_USERNAMES.has(normalizeUsername(value))
}

export function getReservedAdminUsernames() {
  return Array.from(RESERVED_ADMIN_USERNAMES)
}
