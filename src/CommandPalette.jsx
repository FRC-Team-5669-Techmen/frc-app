import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pageCommands, searchCommands } from './navigation'
import './CommandPalette.css'

// Native modal semantics make the page behind search inert, contain Tab and
// restore focus. The header is its only owner; check-in imports none of this.
export default function CommandPalette({ open, onClose, viewer, returnFocusRef }) {
  const dialog = useRef(null), input = useRef(null), navigate = useNavigate()
  const [query, setQuery] = useState(''), [active, setActive] = useState(0)
  const id = useId()
  const commands = useMemo(() => pageCommands(viewer), [viewer.isStaff, viewer.isAdmin, viewer.isParent, viewer.canApproveSignouts, viewer.memberId, viewer.pathname])
  const results = useMemo(() => {
    const matches = searchCommands(commands, query)
    return [...new Set(matches.map(c => c.group))].flatMap(group => matches.filter(c => c.group === group))
  }, [commands, query])
  const index = Math.min(active, Math.max(0, results.length - 1))
  useEffect(() => {
    const el = dialog.current
    if (!open || !el) return
    setQuery('')
    setActive(0)
    el.showModal()
    input.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      if (el.open) el.close()
      document.body.style.overflow = previous
      returnFocusRef.current?.focus()
    }
  }, [open, returnFocusRef])
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: 'nearest' })
  }, [index, query, open, id])
  const choose = c => { onClose(); navigate(c.to) }
  const groups = [...new Set(results.map(c => c.group))]
  if (!open) return null
  return (
    <dialog ref={dialog} className="command-palette" aria-labelledby={`${id}-title`}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClose={onClose}
      onClick={e => { if (e.target === dialog.current) {
        const r = dialog.current.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose()
      } }}>
      <div className="command-head">
        <h2 id={`${id}-title`}>Search anything</h2>
        <button type="button" onClick={onClose} aria-label="Close search">Close</button>
      </div>
      <label className="command-label" htmlFor={`${id}-input`}>Find a page or a task</label>
      <input ref={input} id={`${id}-input`} type="search" placeholder="Try hours, carpool or practice" autoComplete="off"
        role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`}
        aria-activedescendant={results.length ? `${id}-option-${index}` : undefined}
        value={query} onChange={e => { setQuery(e.target.value); setActive(0) }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && results.length) {
            e.preventDefault()
            setActive(e.key === 'Home' ? 0 : e.key === 'End' ? results.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
          } else if (e.key === 'Enter' && results.length && !e.nativeEvent.isComposing) { e.preventDefault(); choose(results[index]) }
        }} />
      <p className="command-status" role="status">{results.length ? `${results.length} pages. Use arrow keys and Enter, or tap a result.` : 'No pages found. Try a different word.'}</p>
      <div id={`${id}-list`} className="command-results" role="listbox" aria-label="Pages">
        {groups.map(group => <div key={group} role="group" aria-label={group}>
          <div className="command-group" aria-hidden="true">{group}</div>
          {results.map((c, i) => c.group === group && <div key={c.path} id={`${id}-option-${i}`} role="option"
            aria-selected={index === i} className="command-result" data-command={c.path}
            onPointerMove={() => setActive(i)} onClick={() => choose(c)}>
            <span className="command-title">{c.title}</span>
            <span className="command-description">{c.hint || c.what}</span>
          </div>)}
        </div>)}
      </div>
      <p className="command-foot">Ctrl+K or ⌘K to search. Esc to close. Private family pages use your emailed link.</p>
    </dialog>
  )
}
