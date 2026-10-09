/** An optional picture that isn't on this server hides itself (e.g. the Mario Kart sprites, see shared/mariokart.ts). */
export const hideMissingSprite = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.display = 'none'
}
