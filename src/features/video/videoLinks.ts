export const videoHref = (id: string) => `/video/kijk?v=${id}`

/** "1.234 keer bekeken" */
export const viewsLabel = (n: number) => `${n.toLocaleString('nl-NL')} keer bekeken`
