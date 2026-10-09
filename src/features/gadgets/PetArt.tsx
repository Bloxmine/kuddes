import type { CSSProperties } from 'react'
import type { PetAction, PetHat, PetSpecies } from '../../../shared/gadgets'

export type PetMood = 'blij' | 'gewoon' | 'verdrietig' | 'slaap'

/**
 * The Virtueel huisdier, drawn: a kat, hond, konijn or draakje in the owner's
 * colour. It bobs, blinks and wags; asleep it curls its eyes shut, and after
 * feeding, petting or playing it shows a bowl, hearts or a ball.
 */
export function PetArt({ species, color, mood, stage = 'volwassen', reaction = null, hat = 'geen', size = 150 }: { species: PetSpecies; color: string; mood: PetMood; stage?: 'baby' | 'jong' | 'volwassen'; reaction?: PetAction | null; hat?: PetHat; size?: number }) {
  const scale = stage === 'baby' ? 0.72 : stage === 'jong' ? 0.86 : 1
  const asleep = mood === 'slaap'
  return (
    <svg
      className={['pet-art', `pet-${species}`, `mood-${mood}`, reaction && `react-${reaction}`].filter(Boolean).join(' ')}
      viewBox="0 0 140 130"
      width={size}
      height={(size * 130) / 140}
      style={{ '--pet': color } as CSSProperties}
      aria-hidden="true"
    >
      <ellipse cx="70" cy="121" rx={34 * scale} ry="5" className="pet-shadow" />
      <g className="pet-body-wrap" style={{ transform: `translate(70px, 122px) scale(${scale}) translate(-70px, -122px)` }}>
        <g className="pet-bob">
          {/* Behind the body: tail and wings */}
          <g className="pet-tail">
            {species === 'kat' && <path d="M98 100 C122 96 124 70 112 62" className="pet-stroke" strokeWidth="9" fill="none" strokeLinecap="round" />}
            {species === 'hond' && <path d="M98 98 C112 92 116 84 114 76" className="pet-stroke" strokeWidth="8" fill="none" strokeLinecap="round" />}
            {species === 'konijn' && <circle cx="100" cy="104" r="9" className="pet-light" />}
            {species === 'draak' && <path d="M96 104 C118 108 124 94 130 84 L122 100 C128 102 126 106 132 104 C120 118 104 114 96 110 Z" className="pet-fill" />}
          </g>
          {species === 'draak' && (
            <g className="pet-wings">
              {/* Each wing grows out of the back, behind the body */}
              <g className="pet-wing-l">
                <path d="M58 84 C46 70 32 60 16 58 C20 66 20 72 24 77 C28 75 32 77 33 81 C37 79 41 83 41 87 C45 87 49 91 50 95 Z" className="pet-dark" />
                <path d="M56 84 L20 61 M52 88 L27 76 M50 92 L37 82" className="pet-wing-bone" />
              </g>
              <g className="pet-wing-r">
                <path d="M82 84 C94 70 108 60 124 58 C120 66 120 72 116 77 C112 75 108 77 107 81 C103 79 99 83 99 87 C95 87 91 91 90 95 Z" className="pet-dark" />
                <path d="M84 84 L120 61 M88 88 L113 76 M90 92 L103 82" className="pet-wing-bone" />
              </g>
            </g>
          )}

          {/* Body, belly and feet */}
          <ellipse cx="70" cy="97" rx="31" ry="23" className="pet-fill" />
          <ellipse cx="70" cy="101" rx="18" ry="15" className="pet-light" />
          <ellipse cx="54" cy="118" rx="10" ry="5.5" className="pet-dark" />
          <ellipse cx="86" cy="118" rx="10" ry="5.5" className="pet-dark" />
          {species === 'draak' && (
            <g className="pet-horn">
              <path d="M62 76 L66 70 L70 76 Z M72 78 L76 72 L80 78 Z" />
            </g>
          )}

          {/* Ears (behind the head for the rabbit and the dog) */}
          {species === 'konijn' && (
            <g className="pet-ears">
              <ellipse cx="56" cy="22" rx="8" ry="22" className="pet-fill" transform="rotate(-10 56 40)" />
              <ellipse cx="56" cy="24" rx="4" ry="16" className="pet-inner" transform="rotate(-10 56 40)" />
              <ellipse cx="84" cy="22" rx="8" ry="22" className="pet-fill" transform="rotate(12 84 40)" />
              <ellipse cx="84" cy="24" rx="4" ry="16" className="pet-inner" transform="rotate(12 84 40)" />
            </g>
          )}

          {/* Head */}
          <g className="pet-head">
            <circle cx="70" cy="56" r="28" className="pet-fill" />
            {species === 'kat' && (
              <g className="pet-ears">
                <path d="M46 44 L44 18 L64 32 Z" className="pet-fill" />
                <path d="M49 38 L48 24 L59 32 Z" className="pet-inner" />
                <path d="M94 44 L96 18 L76 32 Z" className="pet-fill" />
                <path d="M91 38 L92 24 L81 32 Z" className="pet-inner" />
              </g>
            )}
            {species === 'hond' && (
              <g className="pet-ears">
                <ellipse cx="43" cy="56" rx="9" ry="19" className="pet-dark" transform="rotate(18 43 44)" />
                <ellipse cx="97" cy="56" rx="9" ry="19" className="pet-dark" transform="rotate(-18 97 44)" />
              </g>
            )}
            {species === 'draak' && (
              <g className="pet-horn">
                <path d="M52 34 L46 14 L60 30 Z" />
                <path d="M88 34 L94 14 L80 30 Z" />
              </g>
            )}
            {/* Snout */}
            <ellipse cx="70" cy="66" rx={species === 'hond' ? 14 : 12} ry={species === 'hond' ? 10 : 8} className="pet-light" />

            {/* Eyes */}
            <g className="pet-eyes">
              {asleep ? (
                <>
                  <path d="M52 55 Q58 60 64 55" className="pet-line" />
                  <path d="M76 55 Q82 60 88 55" className="pet-line" />
                </>
              ) : mood === 'blij' ? (
                <>
                  <path d="M52 57 Q58 49 64 57" className="pet-line" />
                  <path d="M76 57 Q82 49 88 57" className="pet-line" />
                </>
              ) : (
                <g className="pet-blink">
                  <circle cx="58" cy="54" r="5.5" className="pet-eye" />
                  <circle cx="82" cy="54" r="5.5" className="pet-eye" />
                  <circle cx="60" cy="52" r="1.8" fill="#fff" />
                  <circle cx="84" cy="52" r="1.8" fill="#fff" />
                  {mood === 'verdrietig' && (
                    <>
                      <path d="M51 44 L63 47" className="pet-line" />
                      <path d="M89 44 L77 47" className="pet-line" />
                    </>
                  )}
                </g>
              )}
            </g>
            <ellipse cx="50" cy="66" rx="5" ry="3" className="pet-cheek" />
            <ellipse cx="90" cy="66" rx="5" ry="3" className="pet-cheek" />

            {/* Nose and mouth */}
            {species === 'hond' ? <ellipse cx="70" cy="62" rx="5" ry="3.5" fill="#2a2320" /> : species === 'draak' ? (
              <>
                <circle cx="66" cy="63" r="1.4" fill="#2a2320" />
                <circle cx="74" cy="63" r="1.4" fill="#2a2320" />
              </>
            ) : (
              <path d="M66 61 L74 61 L70 65 Z" fill="#e67a94" />
            )}
            {asleep ? (
              <circle cx="70" cy="71" r="2" className="pet-mouth-o" />
            ) : mood === 'verdrietig' ? (
              <path d="M63 73 Q70 67 77 73" className="pet-line" />
            ) : (
              <path d="M62 68 Q66 73 70 68 Q74 73 78 68" className="pet-line" />
            )}
            {species === 'kat' && !asleep && (
              <g className="pet-whiskers">
                <path d="M40 64 L54 66 M40 70 L54 69 M100 64 L86 66 M100 70 L86 69" />
              </g>
            )}
            {hat !== 'geen' && <Hat hat={hat} />}
          </g>
        </g>
      </g>

      {/* Asleep: Zzz */}
      {asleep && (
        <g className="pet-zzz">
          <text x="102" y="36">z</text>
          <text x="112" y="24">z</text>
          <text x="122" y="12">Z</text>
        </g>
      )}
      {/* What just happened */}
      {reaction === 'voeren' && (
        <g className="pet-bowl">
          <path d="M14 112 L42 112 L38 124 L18 124 Z" fill="#d9534f" />
          <ellipse cx="28" cy="112" rx="14" ry="3.5" fill="#8a5a2b" />
          <circle cx="24" cy="109" r="2.5" fill="#b3743a" />
          <circle cx="31" cy="108" r="2.5" fill="#b3743a" />
        </g>
      )}
      {reaction === 'aaien' && (
        <g className="pet-hearts">
          <path d="M40 30 c-4 -6 -12 -2 -8 4 l8 8 l8 -8 c4 -6 -4 -10 -8 -4 Z" />
          <path d="M100 38 c-3 -5 -10 -2 -7 3 l7 7 l7 -7 c3 -5 -4 -8 -7 -3 Z" />
          <path d="M70 12 c-3 -5 -10 -2 -7 3 l7 7 l7 -7 c3 -5 -4 -8 -7 -3 Z" />
        </g>
      )}
      {reaction === 'spelen' && (
        <g className="pet-ball">
          <circle cx="116" cy="110" r="9" fill="#f2c230" />
          <path d="M107 110 Q116 102 125 110 M107 110 Q116 118 125 110" stroke="#d9534f" strokeWidth="2" fill="none" />
        </g>
      )}
    </svg>
  )
}

/** A hat on top of the head (the head is a circle at 70,56 with radius 28). */
function Hat({ hat }: { hat: PetHat }) {
  switch (hat) {
    case 'strik':
      return (
        <g className="pet-hat">
          <path d="M84 30 L72 22 L73 38 Z M84 30 L96 22 L95 38 Z" fill="#ff6fa3" stroke="#c83f75" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="84" cy="30" r="4" fill="#c83f75" />
        </g>
      )
    case 'pet':
      return (
        <g className="pet-hat">
          <path d="M46 36 C46 18 94 18 94 36 Z" fill="#2f7fd6" />
          <path d="M88 35 C100 34 110 36 112 39 C104 41 94 40 86 38 Z" fill="#1f5ea6" />
          <circle cx="70" cy="21" r="3" fill="#1f5ea6" />
          <path d="M58 34 C58 26 66 22 70 22" stroke="#fff" strokeWidth="2" fill="none" opacity="0.5" />
        </g>
      )
    case 'feest':
      return (
        <g className="pet-hat">
          <path d="M56 34 L70 0 L84 34 Z" fill="#8a63c9" />
          <path d="M60 25 L80 25 M64 15 L76 15" stroke="#f2c230" strokeWidth="3" />
          <path d="M56 34 Q70 38 84 34" stroke="#f2c230" strokeWidth="2" fill="none" />
          <circle cx="70" cy="1" r="4" fill="#ff6fa3" />
        </g>
      )
    case 'kerst':
      return (
        <g className="pet-hat">
          <path d="M48 34 C52 12 76 2 96 14 C88 14 84 20 90 34 Z" fill="#d63a3a" />
          <rect x="46" y="30" width="46" height="8" rx="4" fill="#fff" />
          <circle cx="97" cy="16" r="5" fill="#fff" />
        </g>
      )
    case 'tovenaar':
      return (
        <g className="pet-hat">
          <ellipse cx="70" cy="34" rx="30" ry="6" fill="#3c2a78" />
          <path d="M54 34 L74 -4 L86 34 Z" fill="#4b3596" />
          <path d="M66 20 l2 -4 l2 4 l4 1 l-4 2 l-2 4 l-2 -4 l-4 -2 Z" fill="#f2c230" />
          <circle cx="78" cy="10" r="1.6" fill="#f2c230" />
        </g>
      )
    case 'kroon':
      return (
        <g className="pet-hat">
          <path d="M52 36 L50 16 L60 26 L70 10 L80 26 L90 16 L88 36 Z" fill="#f2c230" stroke="#c7921a" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="70" cy="28" r="3" fill="#d63a3a" />
          <circle cx="59" cy="30" r="2" fill="#2f7fd6" />
          <circle cx="81" cy="30" r="2" fill="#3d9a2b" />
        </g>
      )
    default:
      return null
  }
}
