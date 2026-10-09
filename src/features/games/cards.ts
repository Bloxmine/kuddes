/** Suits and ranks of playing cards (PlayingCard.tsx, Patience, Poker). `rank` 1 or 14 is the ace; `suit` 0–3 is ♠ ♥ ♦ ♣. */
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const
export const SUIT_NAMES = ['schoppen', 'harten', 'ruiten', 'klaveren'] as const
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'B', 12: 'V', 13: 'H', 14: 'A' }
const RANK_NAME: Record<number, string> = { 1: 'aas', 11: 'boer', 12: 'vrouw', 13: 'heer', 14: 'aas' }
export const rankText = (rank: number) => RANK_LABEL[rank] ?? String(rank)
export const cardName = (rank: number, suit: number) => `${SUIT_NAMES[suit]} ${RANK_NAME[rank] ?? rank}`
export const isRed = (suit: number) => suit === 1 || suit === 2
