import { useEffect, useRef, type RefObject } from 'react'
import type { Game } from '../../game/useGame'
import type { AppId } from '../../types'

export function usePassiveClueTarget<T extends HTMLElement = HTMLDivElement>(
  game: Game,
  app: AppId,
  surface: 'incident' | 'app',
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T>(null)
  const clueIds = game.clues
    .filter(clue => clue.source.app === app && clue.source.surface === surface && !clue.discovered)
    .map(clue => clue.artifact.id)
  const clueKey = clueIds.join('|')
  const { clueVisible, clueHidden } = game.actions

  useEffect(() => {
    const node = ref.current
    const clueIds = clueKey ? clueKey.split('|') : []
    if (!active || !node || clueIds.length === 0) return

    const taggedTargets = new Map<string, HTMLElement>()
    for (const target of node.querySelectorAll<HTMLElement>('[data-clue-target]')) {
      const artifactId = target.dataset.clueTarget
      if (artifactId && clueIds.includes(artifactId) && !taggedTargets.has(artifactId)) {
        taggedTargets.set(artifactId, target)
      }
    }
    const targets = taggedTargets.size > 0
      ? [...taggedTargets.entries()].map(([artifactId, target]) => ({ artifactId, target }))
      : [{ artifactId: clueIds[0]!, target: node }]
    const visibility = new Map(targets.map(({ artifactId }) => [artifactId, false]))
    const update = () => {
      for (const { artifactId } of targets) {
        if (visibility.get(artifactId) && document.visibilityState === 'visible') clueVisible(artifactId)
        else clueHidden(artifactId)
      }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = targets.find(item => item.target === entry.target)
        if (target) visibility.set(target.artifactId, entry.isIntersecting)
      }
      update()
    }, { threshold: 0 })
    for (const { target } of targets) observer.observe(target)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
      for (const { artifactId } of targets) clueHidden(artifactId)
    }
  }, [active, clueKey, clueVisible, clueHidden])

  return ref
}
