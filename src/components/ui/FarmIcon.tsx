import type { FarmIconName } from './farmIcons'

/**
 * Farm-Fresh web icons by FatCow Web Hosting (CC BY 3.0 US), from Wikimedia
 * Commons. The PNGs are in public/icons/16 and public/icons/32 (the 16px ones
 * are downscaled from the 32px originals). "buddypoke" is BuddyPoke's own icon.
 */
type FarmIconProps = {
  name: FarmIconName
  /** Display size in px; 16px art is used up to 20px, the 32px art above that. */
  size?: number
  /** Accessible label; omit for decorative icons next to text. */
  label?: string
  className?: string
}

export function FarmIcon({ name, size = 16, label, className }: FarmIconProps) {
  const art = size <= 20 ? 16 : 32
  return (
    <img
      className={className ? `farm-icon ${className}` : 'farm-icon'}
      src={`/icons/${art}/${name}.png`}
      srcSet={art === 16 ? `/icons/16/${name}.png 1x, /icons/32/${name}.png 2x` : undefined}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      title={label}
    />
  )
}
