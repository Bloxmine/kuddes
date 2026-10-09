/**
 * Whether this computer can run BuddyPoke. It draws in 3D with WebGL, and the
 * frame runs on the same thread as the page: without WebGL it can't start at
 * all, and with only the slow software kind (old computers, blocked graphics
 * drivers) it can freeze the whole profile. So it's only loaded when the
 * browser offers real, hardware WebGL, unless the member asks to try anyway.
 */
let cached: boolean | null = null
const FORCE_KEY = 'kuddes.buddypoke.force'

export function hasFastWebGL(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    // Refuses the slow software fallback (SwiftShader and the like)
    const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    cached = !!gl
    // Browsers only allow a few WebGL contexts: give this test one back straight away
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

/** "Toch proberen": remembered in this browser. */
export function forcedBuddyPoke(): boolean {
  try {
    return localStorage.getItem(FORCE_KEY) === '1'
  } catch {
    return false
  }
}

export function forceBuddyPoke() {
  try {
    localStorage.setItem(FORCE_KEY, '1')
  } catch {
    // only for this visit then
  }
}

/** It didn't work after all: don't try again on the next visit. */
export function unforceBuddyPoke() {
  try {
    localStorage.removeItem(FORCE_KEY)
  } catch {
    // nothing remembered
  }
}

/** How long BuddyPoke may take to start before it's stopped (slow computers, broken graphics). */
export const START_TIMEOUT_MS = 20_000
