/**
 * Where the pointer is inside an element that is `w` × `h` CSS pixels, in
 * those pixels. Works out the ratio from what's on screen, so it stays right
 * when the page is zoomed (the text size setting puts `zoom` on the body).
 */
export function pointIn(e: { clientX: number; clientY: number }, el: Element, w: number, h: number) {
  const r = el.getBoundingClientRect()
  return { x: r.width ? ((e.clientX - r.left) / r.width) * w : 0, y: r.height ? ((e.clientY - r.top) / r.height) * h : 0 }
}

/** How many screen pixels one CSS pixel of this element is (1 without zoom). */
export const screenScale = (el: Element, w: number) => (w ? el.getBoundingClientRect().width / w : 1) || 1
