import { useEffect, useState } from 'react'
import { readChoice, setThemeChoice, subscribeTheme } from './themeMode'
import './ThemeSwitch.css'

// Light / Dark / System. `compact` is the icon row in the account menu; the
// full version, with labels, is on the profile. Both drive src/themeMode.js
// and stay in step through its subscription.

const Sun = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const Moon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
)
const Screen = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" />
  </svg>
)

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Screen },
]

export default function ThemeSwitch({ compact = false }) {
  const [choice, setChoice] = useState(() => readChoice())
  useEffect(() => subscribeTheme(setChoice), [])

  return (
    <div
      className={`theme-switch${compact ? ' theme-switch-compact' : ''}`}
      role="radiogroup"
      aria-label="Theme"
      onClick={compact ? (e) => e.stopPropagation() : undefined}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={compact ? `${label} theme` : undefined}
          title={compact ? label : undefined}
          className={`theme-switch-opt${choice === value ? ' on' : ''}`}
          onClick={() => setChoice(setThemeChoice(value))}
        >
          <Icon />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}
