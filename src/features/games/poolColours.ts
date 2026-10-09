/** Ball colours: 1–7 solid, 8 black, 9–15 the same colours as stripes; 0 is the cue ball. */
const COLOURS: Record<number, string> = { 1: '#f5c518', 2: '#1f5bd1', 3: '#d8262a', 4: '#6b2fa8', 5: '#f07818', 6: '#12824a', 7: '#8a1c1c', 8: '#151515' }
export const ballColour = (id: number) => (id === 0 ? '#fbfbf5' : COLOURS[id > 8 ? id - 8 : id])
