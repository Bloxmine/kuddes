import type { ReactNode } from 'react'
import { isAnimatedFrame, type AvatarFrame } from '../../../shared/frames'
import './AvatarFrames.css'
import './AnimatedFrames.css'

/**
 * A profile photo in the member's border, or the seasonal one when the viewer
 * has that on (see AvatarFrames.css). `seasonal={false}` always shows the
 * member's own, e.g. in the picker.
 */
export function FramedAvatar({ frame, seasonal = true, children }: { frame: AvatarFrame | null; seasonal?: boolean; children: ReactNode }) {
  // "Ring" frames draw their moving part in the border area (AnimatedFrames.css)
  const ring = frame && isAnimatedFrame(frame) && frame !== 'neon'
  const classes = ['avatar-frame', frame && `framed frame-${frame}`, ring && 'frame-ring', !seasonal && 'no-season']
  return <div className={classes.filter(Boolean).join(' ')}>{children}</div>
}
