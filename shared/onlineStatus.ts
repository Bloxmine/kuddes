/** The online statuses you can pick in the top bar and the phone menu (stored as users.online_status). */
export const ONLINE_STATUSES = ['Online', 'Bezig', 'Afwezig', 'Toon offline'] as const
export type OnlineStatus = (typeof ONLINE_STATUSES)[number]

/** Online, but shown to others as offline. */
export const HIDDEN_STATUS: OnlineStatus = 'Toon offline'
