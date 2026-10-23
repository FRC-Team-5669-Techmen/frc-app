import { useRef } from 'react'

// Shared by the match simulator (ledger 0017) and the human player match run
// (ledger 0025), moved here from MatchSimPage.jsx so the two sound the same.
// Audio cues through WebAudio, so nothing is downloaded: start a rising
// triple, a phase change a double tone, the warning three short beeps, the end
// a long low tone. A browser allows sound only after a tap, which Start is.
export function useCues() {
  const ctx = useRef(null)
  const beep = (freq, start, dur, gain = 0.25) => {
    const c = ctx.current; if (!c) return
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'square'; o.frequency.value = freq
    g.gain.setValueAtTime(gain, c.currentTime + start); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
    o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05)
  }
  return {
    unlock() { try { ctx.current = ctx.current ?? new (window.AudioContext || window.webkitAudioContext)(); ctx.current.resume?.() } catch { ctx.current = null } },
    play(kind) {
      if (kind === 'start') { beep(660, 0, 0.18); beep(880, 0.22, 0.18); beep(1320, 0.44, 0.4) }
      else if (kind === 'phase') { beep(990, 0, 0.2); beep(990, 0.28, 0.2) }
      else if (kind === 'warning') { beep(1200, 0, 0.12); beep(1200, 0.2, 0.12); beep(1200, 0.4, 0.12) }
      else if (kind === 'end') beep(330, 0, 1.4, 0.35)
    },
  }
}
