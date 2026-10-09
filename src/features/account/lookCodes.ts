/**
 * Reading the newer look fields from a shared design or theme code: only known
 * values pass, anything else is dropped (the server checks again on saving).
 */
import { BACKGROUND_EFFECTS, EFFECT_AMOUNTS, type BackgroundEffect } from '../../../shared/backgroundEffects'
import { BODY_FONTS, BOX_GLOW_LIMITS, TEXTURE_OVERLAYS, type BodyFont, type BoxLook, type TextureOverlay } from '../../../shared/customization'
import { TEXTURE_PATTERNS, type TexturePattern } from '../../../shared/textures'

const HEX = /^#[0-9a-f]{6}$/i
const TEXTURES = new Set<string>(TEXTURE_PATTERNS)
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)
const clamp = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined)

export function readOverlay(v: unknown): TextureOverlay | null {
  const o = obj(v)
  if (!o || typeof o.style !== 'string' || !(o.style in TEXTURE_OVERLAYS) || o.style === 'geen') return null
  return { style: o.style as TextureOverlay['style'], opacity: clamp(o.opacity, 0.05, 0.95) ?? 0.4 }
}

export function readEffect(v: unknown): BackgroundEffect | null {
  const o = obj(v)
  if (!o || typeof o.kind !== 'string' || !(o.kind in BACKGROUND_EFFECTS)) return null
  return {
    kind: o.kind as BackgroundEffect['kind'],
    ...(typeof o.color === 'string' && HEX.test(o.color) ? { color: o.color } : null),
    ...(typeof o.amount === 'string' && o.amount in EFFECT_AMOUNTS ? { amount: o.amount as BackgroundEffect['amount'] } : null),
  }
}

export const readBodyFont = (v: unknown): BodyFont | null => (typeof v === 'string' && v in BODY_FONTS && v !== 'standaard' ? (v as BodyFont) : null)

const texture = (v: unknown) => (typeof v === 'string' && TEXTURES.has(v) ? (v as TexturePattern) : null)

/** Glow, box textures and the moving background. */
export function readLookExtras(data: Record<string, unknown>): Partial<BoxLook> & { effect: BackgroundEffect | null } {
  const g = obj(data.boxGlow)
  return {
    boxGlow: g && typeof g.color === 'string' && HEX.test(g.color) ? { color: g.color, size: Math.round(clamp(g.size, BOX_GLOW_LIMITS.min, BOX_GLOW_LIMITS.max) ?? 10) } : null,
    boxTexture: texture(data.boxTexture),
    boxTextureFade: clamp(data.boxTextureFade, 0, 0.95),
    boxHeaderTexture: texture(data.boxHeaderTexture),
    boxHeaderFade: clamp(data.boxHeaderFade, 0, 0.95),
    effect: readEffect(data.effect),
  }
}
