import { useEffect, useRef } from 'react'
import { displayName } from './names'
import { isStaffRoles } from './permissions'

// "Who can do what" on /roster (admin): one card per capability with the
// people who hold it, one tap to remove and one pick to add anyone on the
// club. The same grants as each member's Permissions row below it, through
// the same admin functions (setCapability); this is just the view by
// permission instead of by person. /roster?perm=<key> opens on one card, so
// Scouting and the Match log link straight here.

/** Approved, active members who are not parent-only, by name: who may be given a permission. */
export function grantable(members) {
  return (members ?? []).filter((m) => m.approved && (m.status ?? 'active') === 'active'
    && (m.roles ?? []).some((r) => r !== 'parent'))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

export default function PermissionHolders({ caps, members, grants, saving, onToggle, focus }) {
  const ref = useRef(null)
  useEffect(() => { if (focus && ref.current) ref.current.scrollIntoView({ block: 'start' }) }, [focus])
  const pool = grantable(members)
  return (
    <section className="roster-holders" aria-labelledby="roster-holders-title">
      <h2 id="roster-holders-title" className="roster-domains-title">Who can do what</h2>
      <p className="roster-holders-sub">Give anyone on the team a job in the app. Staff can already do all of these.</p>
      <div className="roster-holders-grid">
        {caps.map((c) => {
          const holders = pool.filter((m) => (grants[m.id] ?? []).includes(c.key) && !isStaffRoles(m.roles))
          const others = pool.filter((m) => !(grants[m.id] ?? []).includes(c.key) && !isStaffRoles(m.roles))
          return (
            <article key={c.key} className={`roster-holder-card${focus === c.key ? ' focus' : ''}`} data-perm={c.key} ref={focus === c.key ? ref : null}>
              <h3>{c.people ?? c.label}</h3>
              <p>{c.hint}</p>
              <div className="roster-holder-chips">
                {holders.length === 0 && <span className="roster-domain-none">Nobody yet.</span>}
                {holders.map((m) => (
                  <span key={m.id} className="roster-holder-chip" data-holder={displayName(m)}>
                    {displayName(m)}
                    <button type="button" className="roster-holder-remove" disabled={!!saving[`${m.id}_cap_${c.key}`]}
                      onClick={() => onToggle(m.id, c.key, true)} aria-label={`Remove ${displayName(m)} from ${c.people ?? c.label}`}>×</button>
                  </span>
                ))}
              </div>
              <label className="roster-holder-add">
                <select value="" aria-label={`Add to ${c.people ?? c.label}`} onChange={(e) => { if (e.target.value) onToggle(e.target.value, c.key, false) }}>
                  <option value="">+ Add someone</option>
                  {others.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
                </select>
              </label>
            </article>
          )
        })}
      </div>
    </section>
  )
}
