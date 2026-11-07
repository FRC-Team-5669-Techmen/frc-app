import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useTour } from './context.jsx'
import { routeFor, TRACK_NAMES } from './catalog.js'
import { advance, coreComplete } from './progress.js'
import { recordCore } from './api.js'
import Practice from './Practice.jsx'
import './tour.css'

export default function Runner() {
  const t = useTour()
  const { progress: p, steps } = t
  const navigate = useNavigate(),
    location = useLocation()
  const [target, setTarget] = useState(null),
    [waiting, setWaiting] = useState(true),
    [ready, setReady] = useState(false)
  const panel = useRef(null),
    heading = useRef(null),
    opener = useRef(null)
  const active = p?.status === 'active',
    step = steps[p?.index],
    route = step && routeFor(step, p.eventId, t.uid)
  const reference =
    step && (step.reference || route?.startsWith('/training?feature='))
  const anchor = reference ? 'feature-reference' : step?.target
  const done = step && p.done.includes(step.id)

  useEffect(() => {
    if (active && step && route) navigate(route)
  }, [active, p?.index, p?.eventId, route, navigate, step?.id])
  useEffect(() => {
    if (!active) return
    opener.current = document.activeElement
    return () => {
      const destination = opener.current?.isConnected
        ? opener.current
        : document.querySelector('[data-tour="nav-profile"]')
      destination?.focus()
    }
  }, [active])
  useLayoutEffect(() => {
    if (!active) return
    const node = panel.current
    const size = () =>
      document.documentElement.style.setProperty(
        '--tour-space',
        `${node?.getBoundingClientRect().height + 32 || 360}px`,
      )
    size()
    const observer = new ResizeObserver(size)
    if (node) observer.observe(node)
    document.documentElement.classList.add('tour-active')
    return () => {
      observer.disconnect()
      document.documentElement.classList.remove('tour-active')
      document.documentElement.style.removeProperty('--tour-space')
    }
  }, [active, step?.id])
  useEffect(() => {
    setReady(false)
    setTarget(null)
    setWaiting(true)
    if (!active || !step) return
    heading.current?.focus({ preventScroll: true })
    let found = null
    const scan = () => {
      if (!route || location.pathname !== route.split('?')[0]) return
      const node = document.querySelector(`[data-tour="${anchor}"]`)
      if (!node || !node.getClientRects().length) {
        if (found) {
          found.removeAttribute('data-tour-active')
          found = null
          setTarget(null)
        }
        return
      }
      if (node !== found) {
        found?.removeAttribute('data-tour-active')
        found = node
        node.setAttribute('data-tour-active', '')
        setTarget(node)
        setWaiting(false)
      }
    }
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour', 'hidden', 'style'],
    })
    const timer = setTimeout(() => {
      scan()
      setWaiting(false)
    }, 5000)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
      found?.removeAttribute('data-tour-active')
    }
  }, [active, step?.id, anchor, route, location.pathname])
  useEffect(() => {
    if (!target || !step?.action) return
    const acted = (e) => {
      if (target.contains(e.target) && e.target.closest('button,a,summary'))
        setReady(true)
    }
    document.addEventListener(step.action, acted, true)
    return () => document.removeEventListener(step.action, acted, true)
  }, [target, step?.id, step?.action])
  function focusTarget() {
    if (!target) return
    const had = target.hasAttribute('tabindex')
    if (!had) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start', behavior: 'instant' })
    if (!had)
      target.addEventListener(
        'blur',
        () => target.removeAttribute('tabindex'),
        { once: true },
      )
  }
  useEffect(() => {
    if (!active) return
    const keys = (e) => {
      if (e.key === 'F8') {
        e.preventDefault()
        if (panel.current?.contains(document.activeElement)) focusTarget()
        else heading.current?.focus()
      }
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !document.querySelector('dialog[open]') &&
        !document.querySelector('.fb-panel')
      ) {
        e.preventDefault()
        t.pause()
      }
    }
    document.addEventListener('keydown', keys)
    return () => document.removeEventListener('keydown', keys)
  })
  useEffect(() => {
    if (!target) return
    focusTarget()
    // Home can insert pending work above the target after its first render.
    // Keep the initially focused feature visible while that layout settles.
    // Once the learner moves focus, their own scrolling takes precedence.
    const reveal = () => {
      if (document.activeElement !== target) return
      const rect = target.getBoundingClientRect()
      const limit =
        innerWidth < 900
          ? (panel.current?.getBoundingClientRect().top ?? innerHeight) - 16
          : innerHeight - 16
      const obscured =
        rect.height < limit - 32 ? rect.bottom > limit : rect.top > limit - 44
      if (rect.top < 0 || obscured)
        target.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
    const observer = new ResizeObserver(reveal)
    observer.observe(target)
    const page = document.querySelector('[data-tour="feature-page"]')
    if (page) observer.observe(page)
    return () => observer.disconnect()
  }, [target])
  // Core completion is independent of skipped library lessons and legacy onboarding.
  useEffect(() => {
    if (!p || !coreComplete(p, steps) || t.record !== 'idle') return
    t.setRecord('saving')
    recordCore(supabase, p.track)
      .then((r) => t.setRecord(r.state))
      .catch(() => t.setRecord('error'))
  }, [p?.done.join('|'), p?.track, t.record, steps.length])
  if (!active) return null
  const canContinue =
    !!target && (done || ready || (!step?.exercise && !step?.action))
  function next(completed) {
    t.update((current) => advance(current, steps, completed))
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  return (
    <aside
      ref={panel}
      className="tour-runner"
      role="region"
      aria-labelledby="tour-heading"
      data-tour-runner
    >
      <div className="tour-top">
        <span>
          {TRACK_NAMES[p.track]} training ·{' '}
          {Math.min(p.index + 1, steps.length)} of {steps.length}
        </span>
        <button onClick={t.pause} aria-label="Pause training">
          Pause
        </button>
      </div>
      <p className="tour-sr" role="status">
        {step ? `Step ${p.index + 1}: ${step.title}` : 'Walkthrough finished'}
      </p>
      <h2 id="tour-heading" ref={heading} tabIndex={-1}>
        {step?.title ?? 'Walkthrough finished'}
      </h2>
      {!t.storageOk && (
        <p role="alert">
          This browser could not save your place. Keep this tab open to
          continue.
        </p>
      )}
      {step ? (
        <>
          <p>{step.text}</p>
          {route === null && (
            <>
              <p role="status">
                Choose a real competition on Training to open this lesson. You
                can skip it and return later.
              </p>
              <Link to="/training" onClick={t.pause}>
                Choose an event
              </Link>
            </>
          )}
          {waiting && route && <p role="status">Waiting for this feature…</p>}
          {!waiting && !target && route && (
            <p role="alert">
              This feature is unavailable or its training target is missing.
              Completion is blocked. Reopen it, or skip and return later.
            </p>
          )}
          {target && (
            <button onClick={focusTarget}>Focus the feature (F8)</button>
          )}
          {step.exercise && step.exercise !== 'absence' && (
            <Practice
              key={step.id}
              kind={step.exercise}
              onDone={() => setReady(true)}
            />
          )}
          {step.exercise === 'absence' && (
            <p>
              Use the practice form on the page. Its receipt unlocks Continue.
            </p>
          )}
          <div className="tour-actions">
            <button
              disabled={p.index === 0}
              onClick={() =>
                t.update((c) => ({ ...c, index: Math.max(0, c.index - 1) }))
              }
            >
              Back
            </button>
            <button disabled={!canContinue} onClick={() => next(true)}>
              Continue
            </button>
            <button onClick={() => next(false)}>Skip step</button>
          </div>
          {step.action && (
            <p className="tour-hint">
              {ready || done
                ? 'Action tried. Continue when ready.'
                : 'Try the highlighted control to continue.'}
            </p>
          )}
          <p className="tour-hint">
            F8 moves between guidance and the feature. Escape pauses. Use Tab
            and Shift+Tab to explore.
          </p>
        </>
      ) : (
        <>
          <p>
            {coreComplete(p, steps)
              ? 'You finished the core activities.'
              : 'Some core activities were skipped. Return to them to finish core training.'}
          </p>
          <Link to="/training" onClick={t.pause}>
            Review training
          </Link>
        </>
      )}
      {coreComplete(p, steps) && (
        <p role="status">
          {t.record === 'saved'
            ? 'Core completion recorded for your mentors.'
            : t.record === 'saving'
              ? 'Recording core completion…'
              : t.record === 'missing'
                ? 'Completion tracking is not set up yet. Core work stays on this device.'
                : 'Core done on this device. Completion has not reached the team server.'}
        </p>
      )}
      {['error', 'missing'].includes(t.record) && (
        <button onClick={() => t.setRecord('idle')}>
          Retry completion save
        </button>
      )}
      <AbsenceReceipt onDone={() => setReady(true)} />
    </aside>
  )
}
// Shared production practice form reports only a local success event.
function AbsenceReceipt({ onDone }) {
  useEffect(() => {
    window.addEventListener('techmen:absence-practiced', onDone)
    return () => window.removeEventListener('techmen:absence-practiced', onDone)
  }, [onDone])
  return null
}
