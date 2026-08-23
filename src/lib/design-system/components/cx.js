// Tiny class joiner. No dependency.
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
