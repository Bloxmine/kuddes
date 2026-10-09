import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/auth'
import { BuddyPokeDialog, BuddyPokeView, ReceivedPokes } from '../buddypoke/BuddyPoke'
import { usePlayPoke } from '../buddypoke/usePlayPoke'
import { FarmIcon } from '../../components/ui/FarmIcon'

/**
 * The BuddyPoke gadget on a profile: the member's buddy, who poked them, and
 * a button to poke them (or, on your own profile, to open BuddyPoke).
 */
export function BuddyPokeBox({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const { user } = useAuth()
  const [poking, setPoking] = useState(false)
  const isSelf = !!profile.relation?.isSelf
  const frameRef = useRef<HTMLIFrameElement>(null)
  const { play, playing } = usePlayPoke(frameRef, profile.buddy?.code ?? null)

  if (!profile.buddy && !isSelf) return null

  if (!profile.buddy) {
    return (
      <Box title="BuddyPoke" icon="buddypoke">
        <div className="buddypoke-empty">
          <FarmIcon name="buddypoke" size={32} />
          <p>Maak je eigen 3D-buddy, kies een gevoel en poke je vrienden.</p>
          <Button variant="cta" onClick={onOpen}>
            BuddyPoke toevoegen
          </Button>
        </div>
      </Box>
    )
  }

  return (
    <Box title="BuddyPoke" icon="buddypoke" className="buddypoke-box">
      <BuddyPokeView buddy={profile.buddy} title={`BuddyPoke van ${profile.nickname}`} frameRef={frameRef} />
      <div className="buddypoke-actions">
        {isSelf ? (
          <Button variant="cta" onClick={onOpen}>
            Open BuddyPoke
          </Button>
        ) : user ? (
          <Button variant="cta" onClick={() => setPoking(true)}>
            Poke {profile.nickname}!
          </Button>
        ) : (
          <Link to={`/inloggen?next=/profiel/${profile.username}`}>Log in om {profile.nickname} te poken</Link>
        )}
      </div>
      <ReceivedPokes username={profile.username} nickname={profile.nickname} onPlay={play} playing={playing} />
      {poking && user && (
        <BuddyPokeDialog username={user.username} pokeUser={profile.username} onClose={() => setPoking(false)} />
      )}
    </Box>
  )
}
