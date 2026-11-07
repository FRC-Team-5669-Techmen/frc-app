import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { coreComplete } from './progress.js'
import { tracksFor, tourFor } from './catalog.js'
import {
  readProgress,
  writeProgress,
  freshProgress,
  positionFor,
} from './progress.js'

const TourContext = createContext(null)
export const useTour = () => useContext(TourContext)
export function TourProvider({ session, hasRole, children }) {
  const uid = session.user.id
  const context = {
    isStaff: ['mentor', 'lead', 'admin'].some(hasRole),
    isAdmin: hasRole('admin'),
    isParent: hasRole('parent'),
  }
  const tracks = tracksFor(context)
  const [progress, setProgress] = useState(() => {
    try {
      const saved = readProgress(window.localStorage, uid)
      return saved
        ? { ...saved, index: positionFor(saved, tourFor(saved.track, context)) }
        : null
    } catch {
      return null
    }
  })
  const [storageOk, setStorageOk] = useState(true)
  const [record, setRecord] = useState('idle')
  const update = useCallback(
    (fn) => setProgress((p) => (typeof fn === 'function' ? fn(p) : fn)),
    [],
  )
  useEffect(() => {
    if (!progress) return
    try {
      setStorageOk(
        writeProgress(window.localStorage, uid, {
          ...progress,
          stepId: steps[progress.index]?.id ?? null,
        }),
      )
    } catch {
      setStorageOk(false)
    }
  }, [progress, uid])
  const permitted = progress && tracks.includes(progress.track)
  const steps = permitted ? tourFor(progress.track, context) : []
  function start(track, eventId = '') {
    if (!tracks.includes(track)) return
    setRecord('idle')
    setProgress({ ...freshProgress(track), eventId })
  }
  function resume() {
    if (permitted) update((p) => ({ ...p, status: 'active' }))
  }
  function pause() {
    update((p) => (p ? { ...p, status: 'paused' } : p))
  }
  return (
    <TourContext.Provider
      value={{
        uid,
        context,
        tracks,
        progress: permitted ? progress : null,
        steps,
        storageOk,
        update,
        start,
        resume,
        pause,
        record,
        setRecord,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function TourInvitation() {
  const t = useTour()
  const { pathname } = useLocation()
  if (
    pathname !== '/dashboard' ||
    t.progress?.status === 'active' ||
    (t.progress && coreComplete(t.progress, t.steps))
  )
    return null
  return (
    <Link className="tour-invite" to="/training">
      {t.progress
        ? 'Continue app training'
        : 'New to Techmen? Learn the app by doing'}
    </Link>
  )
}
