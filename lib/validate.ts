const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/** Rejects traversal, absolute paths, control chars, and paths > 260 chars */
export function isValidFilePath(path: string): boolean {
  if (!path || path.length > 260) return false
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) return false
  if (/[<>:"|?*\x00-\x1f]/.test(path)) return false
  return true
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Basic format check, max 254 chars */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}
