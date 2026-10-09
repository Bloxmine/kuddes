import { KUDDE_CATEGORIES, type KuddeCategory } from '../../../shared/kuddes'
import type { FarmIconName } from '../ui/farmIcons'

/**
 * A menu link with its Farm-Fresh icon. In `to`, "@me" stands for the
 * logged-in member's username (visitors are sent to log in first).
 */
export type MenuLink = { label: string; to: string; icon: FarmIconName }

export type MenuSection = { title?: string; links: MenuLink[] }

export type MenuItem = {
  key: string
  label: string
  icon: FarmIconName
  sections: MenuSection[]
}

export const mainMenu: MenuItem[] = [
  {
    key: 'ontmoeten',
    label: 'Ontmoeten',
    icon: 'group',
    sections: [
      {
        title: 'Jij en je vrienden',
        links: [
          { label: 'Mijn profiel', to: '/profiel/@me', icon: 'user' },
          { label: 'Vrienden', to: '/vrienden', icon: 'group' },
          { label: 'Berichten', to: '/berichten', icon: 'email' },
          { label: 'Messenger', to: '/messenger', icon: 'msn_messenger' },
        ],
      },
      {
        title: 'Forum',
        links: [
          { label: 'Kuddes Forum', to: '/forum', icon: 'comments' },
          { label: 'Chat', to: '/forum/chat', icon: 'transmit' },
          { label: 'Mijn forumprofiel', to: '/forum/lid/@me', icon: 'vcard' },
        ],
      },
      {
        title: 'Wat gebeurt er?',
        links: [
          { label: 'Overzicht', to: '/tijdlijn', icon: 'newspaper' },
          { label: 'WieWatWaar', to: '/tijdlijn?tab=wiewatwaars', icon: 'comment' },
          { label: "Foto's", to: '/tijdlijn?tab=fotos', icon: 'images' },
          { label: 'Blogs', to: '/blogs', icon: 'book_open' },
          { label: 'Nieuwe mensen', to: '/leden', icon: 'user_add' },
        ],
      },
    ],
  },
  {
    key: 'kuddes',
    label: 'Kuddes',
    icon: 'tag_blue',
    sections: [
      {
        title: 'Kuddes',
        links: (Object.keys(KUDDE_CATEGORIES) as KuddeCategory[]).map((k) => ({
          label: KUDDE_CATEGORIES[k].name,
          to: `/kuddes?categorie=${k}`,
          icon: KUDDE_CATEGORIES[k].icon,
        })),
      },
      {
        title: 'Agenda',
        links: [
          { label: 'Agenda', to: '/agenda', icon: 'calendar_view_month' },
          { label: 'Alle Kuddes', to: '/kuddes', icon: 'tag_blue' },
          { label: 'Nieuwe Kudde aanmaken', to: '/kuddes/nieuw', icon: 'add' },
        ],
      },
    ],
  },
  {
    key: 'vermaak',
    label: 'Vermaak',
    icon: 'controller',
    sections: [
      {
        title: "Video's & plaatjes",
        links: [
          { label: 'Kuddes Video', to: '/video', icon: 'television' },
          { label: 'Video uploaden', to: '/video/uploaden', icon: 'film_add' },
          { label: 'Glitterplaatjes', to: '/glitterplaatjes', icon: 'rainbow' },
          { label: 'Fotografie', to: '/fotografie', icon: 'camera' },
        ],
      },
      {
        title: 'Muziek & radio',
        links: [
          { label: 'Muziek luisteren', to: '/muziek', icon: 'music' },
          { label: 'Hitlijst', to: '/muziek/hitlijst', icon: 'award_star_gold_1' },
          { label: 'Muziek uploaden', to: '/muziek/uploaden', icon: 'microphone' },
          { label: 'Kuddes Radio', to: '/radio', icon: 'transmit' },
          { label: 'Radio maken', to: '/radio/studio', icon: 'headphone' },
        ],
      },
      {
        title: 'Koken',
        links: [
          { label: 'Recepten', to: '/recepten', icon: 'cutlery' },
          { label: 'Recept plaatsen', to: '/recepten/nieuw', icon: 'add' },
        ],
      },
      {
        title: 'Recensies',
        links: [
          { label: 'Recensies', to: '/recensies', icon: 'star' },
          { label: 'Boeken', to: '/recensies?soort=boeken', icon: 'book' },
          { label: 'Films en series', to: '/recensies?soort=films', icon: 'film' },
          { label: 'Muziek', to: '/recensies?soort=muziek', icon: 'music' },
        ],
      },
      {
        title: 'Spellen',
        links: [
          { label: 'Spellen', to: '/spellen', icon: 'controller' },
          { label: 'Graffitimuur', to: '/graffiti', icon: 'paintcan' },
          { label: 'Mijn prestaties', to: '/prestaties/@me', icon: 'award_star_gold_1' },
        ],
      },
      {
        title: 'Op je profiel',
        links: [
          { label: 'BuddyPoke', to: '/profiel/@me?tab=buddypoke', icon: 'buddypoke' },
          { label: 'Gadgetmarkt', to: '/gadgetmarkt', icon: 'cart' },
          { label: 'Designgalerij', to: '/designs', icon: 'palette' },
          { label: 'Profielkaartje', to: '/profielkaartje', icon: 'vcard' },
        ],
      },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    icon: 'toolbox',
    sections: [
      {
        title: 'Kantoor',
        links: [
          { label: 'Kuddes Woord', to: '/tools/woord', icon: 'page_white_word' },
          { label: 'Kuddes Rekenblad', to: '/tools/rekenblad', icon: 'page_white_excel' },
          { label: 'Kuddes Presentatie', to: '/tools/presentatie', icon: 'page_white_powerpoint' },
          { label: 'Mijn bestanden', to: '/tools#documenten', icon: 'folder_page' },
        ],
      },
      {
        title: 'Creatief en handig',
        links: [
          { label: 'Kuddes Studio', to: '/tools/studio', icon: 'drum' },
          { label: 'Kuddes Paint', to: '/tools/paint', icon: 'paintbrush' },
          { label: 'Kuddes Planner', to: '/tools/planner', icon: 'calendar_view_week' },
          { label: 'Kuddes Mindmap', to: '/tools/mindmap', icon: 'chart_organisation' },
          { label: 'Kuddes Formulieren', to: '/tools/formulier', icon: 'application_form' },
          { label: 'Rekenmachine', to: '/tools/rekenmachine', icon: 'calculator' },
          { label: 'Kladblok', to: '/tools/kladblok', icon: 'note' },
          { label: 'Alle tools', to: '/tools', icon: 'toolbox' },
        ],
      },
    ],
  },
  {
    key: 'over',
    label: 'Over Kuddes',
    icon: 'star',
    sections: [
      {
        title: 'Over Kuddes',
        links: [
          { label: 'Over Kuddes', to: '/over-kuddes', icon: 'information' },
          { label: 'Suggesties', to: '/suggesties', icon: 'lightbulb' },
          { label: 'Privacyverklaring', to: '/privacy', icon: 'lock' },
        ],
      },
      {
        title: 'Actueel',
        links: [
          { label: 'Nieuws', to: '/nieuws', icon: 'newspaper' },
          { label: 'Weer', to: '/#weer', icon: 'weather_sun' },
        ],
      },
    ],
  },
  {
    key: 'hulp',
    label: 'Hulp',
    icon: 'help',
    sections: [
      {
        title: 'Hulp',
        links: [
          { label: 'Probleem melden', to: '/suggesties?soort=probleem', icon: 'warning' },
          { label: 'Suggestie doen', to: '/suggesties', icon: 'lightbulb' },
        ],
      },
    ],
  },
]

/** Fills in "@me"; visitors go to the login page first and come back. */
export function resolveMenuLink(to: string, username: string | null): string {
  if (!to.includes('@me')) return to
  // /profiel/@me also works after logging in: the profile page sends you to your own
  return username ? to.replace('@me', username) : `/inloggen?next=${encodeURIComponent(to)}`
}
