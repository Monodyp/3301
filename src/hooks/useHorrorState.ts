import { useCallback, useEffect, useRef, useState } from 'react'
import type { HorrorStage } from '../types'
import { playGlitchSound, type GlitchSoundType } from '../game/audio'

const GLITCH_DURATION_MS = 900
const WARNING_DURATION_MS = 5500

export function useHorrorState() {
  const [stage, setStageState] = useState<HorrorStage>('NORMAL')
  const [glitchActive, setGlitchActive] = useState(false)
  const [glitchId, setGlitchId] = useState(0)
  const [warningVisible, setWarningVisible] = useState(false)
  const [warningId, setWarningId] = useState(0)
  const glitchTimer = useRef<number | null>(null)
  const warningTimer = useRef<number | null>(null)

  const dismissWarning = useCallback(() => {
    if (warningTimer.current !== null) window.clearTimeout(warningTimer.current)
    warningTimer.current = null
    setWarningVisible(false)
  }, [])

  const setStage = useCallback((nextStage: HorrorStage) => {
    if (warningTimer.current !== null) window.clearTimeout(warningTimer.current)
    warningTimer.current = null
    setStageState(nextStage)
    setWarningVisible(nextStage === 'COMPROMISED')
    if (nextStage === 'COMPROMISED') {
      setWarningId(id => id + 1)
      warningTimer.current = window.setTimeout(() => {
        setWarningVisible(false)
        warningTimer.current = null
      }, WARNING_DURATION_MS)
    }
  }, [])

  const triggerGlitch = useCallback((soundType: GlitchSoundType = 'subtle', eventId?: string, corruptionLevel = 0) => {
    if (glitchTimer.current !== null) window.clearTimeout(glitchTimer.current)
    setGlitchId(id => id + 1)
    setGlitchActive(true)
    playGlitchSound(soundType, eventId)
    glitchTimer.current = window.setTimeout(() => {
      setGlitchActive(false)
      glitchTimer.current = null
    }, GLITCH_DURATION_MS + Math.min(4, corruptionLevel) * 150)
  }, [])

  const reset = useCallback(() => {
    if (glitchTimer.current !== null) window.clearTimeout(glitchTimer.current)
    if (warningTimer.current !== null) window.clearTimeout(warningTimer.current)
    glitchTimer.current = null
    warningTimer.current = null
    setStageState('NORMAL')
    setGlitchActive(false)
    setWarningVisible(false)
  }, [])

  useEffect(() => () => {
    if (glitchTimer.current !== null) window.clearTimeout(glitchTimer.current)
    if (warningTimer.current !== null) window.clearTimeout(warningTimer.current)
  }, [])

  return { stage, setStage, glitchActive, glitchId, triggerGlitch, warningVisible, warningId, dismissWarning, reset }
}
