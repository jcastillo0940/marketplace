import { describe, expect, it } from 'vitest'
import { createChallengeTracker, eyeAspectRatio, shuffledChallenges, yawRatio } from './biometricLiveness'

const neutral = { eyeOpenness: 0.3, yaw: 0.5 }

describe('biometric liveness', () => {
  it('measures eye openness and head direction from landmarks', () => {
    const openEye = [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }]
    expect(eyeAspectRatio(openEye)).toBeCloseTo(2 / 3)
    expect(yawRatio({ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(0.5)
  })

  it('completes the challenges only in order and from a neutral pose', () => {
    const tracker = createChallengeTracker(['left', 'blink', 'right'])
    expect(tracker.update({ eyeOpenness: 0.3, yaw: 0.8 })).toBe(false)
    tracker.update(neutral)
    expect(tracker.update({ eyeOpenness: 0.3, yaw: 0.2 })).toBe(false)
    expect(tracker.update({ eyeOpenness: 0.3, yaw: 0.8 })).toBe(true)
    expect(tracker.current).toBe('blink')

    tracker.update(neutral)
    tracker.update({ eyeOpenness: 0.1, yaw: 0.5 })
    expect(tracker.update(neutral)).toBe(true)

    tracker.update(neutral)
    expect(tracker.update({ eyeOpenness: 0.3, yaw: 0.2 })).toBe(true)
    expect(tracker.done).toBe(true)
  })

  it('does not pass a still face', () => {
    const tracker = createChallengeTracker(['blink', 'left', 'right'])
    for (let frame = 0; frame < 50; frame += 1) tracker.update(neutral)
    expect(tracker.current).toBe('blink')
  })

  it('always includes the three challenges', () => {
    expect([...shuffledChallenges()].sort()).toEqual(['blink', 'left', 'right'])
  })
})
