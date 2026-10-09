import { useEffect, useRef, useState } from 'react'
import { STEPS_PER_BAR, type StudioProject } from '../../../shared/studio'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Player, songSteps } from './engine'
import './Studio.css'

/** A Kuddes Studio project to listen to (a shared file): the song, or else the first pattern. */
export function StudioPreview({ project }: { project: StudioProject }) {
  const player = useRef<Player | null>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(
    () => () => {
      player.current?.close()
      player.current = null
    },
    [],
  )
  const bars = songSteps(project) / STEPS_PER_BAR
  const toggle = () => {
    if (!player.current || player.current.ctx.state === 'closed') player.current = new Player(new AudioContext(), () => project)
    const p = player.current
    if (p.playing) {
      p.stop()
      setPlaying(false)
    } else {
      p.mode = bars ? { song: true } : { song: false, pattern: project.patterns[0].id }
      p.start(0)
      setPlaying(true)
    }
  }
  return (
    <div className="std-preview">
      <button type="button" className="std-tbtn play" onClick={toggle} aria-label={playing ? 'Stoppen' : 'Afspelen'}>
        <span className={playing ? 'g-stop' : 'g-play'} />
      </button>
      <span>
        <b>
          {project.tempo} bpm · {bars ? `${bars} maten` : `${project.patterns[0].length / STEPS_PER_BAR} maat in een lus`}
        </b>
        <small>
          <FarmIcon name="drum" size={16} /> {project.channels.map((c) => c.name).join(', ') || 'Geen kanalen'}
        </small>
      </span>
    </div>
  )
}
