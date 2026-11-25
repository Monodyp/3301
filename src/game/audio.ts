export type GlitchSoundType = 'subtle' | 'heavy' | 'jittered'

type SoundName = 'appTouch' | 'notification' | 'glitch' | 'bgm'

const soundUrls: Record<SoundName, string> = {
  appTouch: new URL('../assets/sounds/app_touch.mp3', import.meta.url).href,
  notification: new URL('../assets/sounds/notif.mp3', import.meta.url).href,
  glitch: new URL('../assets/sounds/heavy_glitch.mp3', import.meta.url).href,
  bgm: new URL('../assets/sounds/bgm.mp3', import.meta.url).href,
}

const glitchSources: Record<GlitchSoundType, Exclude<SoundName, 'bgm'>> = {
  subtle: 'glitch',
  heavy: 'glitch',
  jittered: 'glitch',
}

const audioElements = new Map<SoundName, HTMLAudioElement>()
const reportedFailures = new Set<SoundName>()
const playedNotificationIds = new Set<string>()
const playedGlitchIds = new Set<string>()
const activeEffectAudios = new Set<HTMLAudioElement>()
let backgroundMusicStarted = false
let backgroundMusicPending = false

function getAudio(name: SoundName): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') {
    reportFailure(name, 'Audio playback is not available in this environment.')
    return null
  }

  const cached = audioElements.get(name)
  if (cached) return cached

  const audio = new Audio(soundUrls[name])
  if (audio.canPlayType('audio/mpeg') === '') {
    reportFailure(name, 'This browser does not support MP3 playback.')
    return null
  }
  audio.preload = 'auto'
  audio.addEventListener('error', () => {
    reportFailure(name, 'The audio file could not be loaded or decoded.')
  })
  audioElements.set(name, audio)
  return audio
}

function reportFailure(name: SoundName, message: string, error?: unknown) {
  if (reportedFailures.has(name)) return
  reportedFailures.add(name)
  console.warn(`Audio playback unavailable for ${name}: ${message}`, error)
}

function startPlayback(audio: HTMLAudioElement, name: SoundName, onSuccess?: () => void, onFailure?: () => void) {
  try {
    void audio.play().then(() => {
      onSuccess?.()
    }).catch(error => {
      onFailure?.()
      if (error instanceof Error && error.name === 'NotAllowedError') return
      reportFailure(name, 'Playback failed.', error)
    })
  } catch (error) {
    onFailure?.()
    reportFailure(name, 'Playback failed.', error)
  }
}

function playEffect(name: Exclude<SoundName, 'bgm'>, allowOverlap = false) {
  const audio = getAudio(name)
  if (!audio) return
  if (!allowOverlap) {
    for (const activeAudio of activeEffectAudios) activeAudio.pause()
    activeEffectAudios.clear()
  }
  audio.pause()
  audio.currentTime = 0
  audio.volume = name === 'glitch' ? 0.45 : 0.65
  activeEffectAudios.add(audio)
  audio.addEventListener('ended', () => activeEffectAudios.delete(audio), { once: true })
  startPlayback(audio, name)
}

export function startBackgroundMusic() {
  const audio = getAudio('bgm')
  if (!audio || backgroundMusicStarted || backgroundMusicPending) return
  audio.loop = true
  audio.volume = 0.5
  backgroundMusicPending = true
  startPlayback(audio, 'bgm', () => {
    backgroundMusicStarted = true
    backgroundMusicPending = false
  }, () => {
    backgroundMusicPending = false
  })
}

export function playAppTouch() {
  playEffect('appTouch')
}

export function playNotificationOnce(deliveryId: string, allowOverlap = false) {
  if (playedNotificationIds.has(deliveryId)) return
  playedNotificationIds.add(deliveryId)
  playEffect('notification', allowOverlap)
}

export function playGlitchSound(type: GlitchSoundType, eventId?: string, allowOverlap = false) {
  if (eventId) {
    if (playedGlitchIds.has(eventId)) return
    playedGlitchIds.add(eventId)
  }
  playEffect(glitchSources[type], allowOverlap)
}
