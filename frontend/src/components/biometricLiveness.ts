export type Point = { x: number; y: number }
export type LivenessChallenge = 'blink' | 'left' | 'right'
export type FaceSample = { eyeOpenness: number; yaw: number }

export const CHALLENGE_INSTRUCTIONS: Record<LivenessChallenge, string> = {
  blink: 'Parpadea una vez',
  left: 'Gira la cabeza a tu izquierda',
  right: 'Gira la cabeza a tu derecha',
}

// Thresholds for the 68-point landmark model.
const EYE_OPEN = 0.25
const EYE_CLOSED = 0.2
const YAW_CENTER_MARGIN = 0.08
const YAW_TURN_MARGIN = 0.14

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Eye aspect ratio: falls towards zero as the eye closes. Expects the six points of one eye. */
export function eyeAspectRatio(eye: Point[]): number {
  return (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / (2 * distance(eye[0], eye[3]))
}

/** Nose position between both sides of the jaw: 0.5 is facing the camera. */
export function yawRatio(nose: Point, jawImageLeft: Point, jawImageRight: Point): number {
  return (nose.x - jawImageLeft.x) / (jawImageRight.x - jawImageLeft.x)
}

export function isFacingCamera(sample: FaceSample): boolean {
  return Math.abs(sample.yaw - 0.5) <= YAW_CENTER_MARGIN && sample.eyeOpenness >= EYE_OPEN
}

export function shuffledChallenges(random: () => number = Math.random): LivenessChallenge[] {
  const challenges: LivenessChallenge[] = ['blink', 'left', 'right']
  for (let index = challenges.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[challenges[index], challenges[other]] = [challenges[other], challenges[index]]
  }
  return challenges
}

/**
 * Walks through the challenges in order. Each one must start from a neutral pose, so a
 * still picture or a face held in one position cannot complete it.
 */
export function createChallengeTracker(challenges: LivenessChallenge[]) {
  let index = 0
  let armed = false
  let eyesClosed = false

  return {
    get current(): LivenessChallenge | null { return challenges[index] ?? null },
    get done(): boolean { return index >= challenges.length },
    update(sample: FaceSample): boolean {
      const challenge = challenges[index]
      if (!challenge) return false
      if (!armed) {
        armed = isFacingCamera(sample)
        return false
      }

      let passed = false
      if (challenge === 'blink') {
        if (sample.eyeOpenness < EYE_CLOSED) eyesClosed = true
        passed = eyesClosed && sample.eyeOpenness >= EYE_OPEN
      } else {
        // The camera sees the person's left on the right side of the raw image.
        passed = challenge === 'left' ? sample.yaw > 0.5 + YAW_TURN_MARGIN : sample.yaw < 0.5 - YAW_TURN_MARGIN
      }

      if (passed) {
        index += 1
        armed = false
        eyesClosed = false
      }
      return passed
    },
  }
}
