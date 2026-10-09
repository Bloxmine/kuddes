/**
 * The original MSN / Windows Live Messenger emoticons, for Kuddes Messenger
 * only (public/msn/, from github.com/bernzrdo/msn-emoticons, extracted from
 * Escargot; the art is Microsoft's). In a message they're `:msn-<file>:`, so
 * they never clash with the Hyves smileys and their codes like :) and (L).
 * `shortcut` is what you typed in MSN, shown as the tooltip.
 */
export const MSN_EMOTICONS: readonly {
  file: string;
  name: string;
  shortcut: string;
}[] = [
  { file: "smile", name: "Smile", shortcut: ":)" },
  { file: "open-mouthed-smile", name: "Open-mouthed smile", shortcut: ":D" },
  { file: "winking-smile", name: "Winking smile", shortcut: ";)" },
  { file: "surprised-smile", name: "Surprised smile", shortcut: ":-O" },
  {
    file: "smile-with-tongue-out",
    name: "Smile with tongue out",
    shortcut: ":P",
  },
  { file: "hot-smile", name: "Hot smile", shortcut: "(H)" },
  { file: "angry-smile", name: "Angry smile", shortcut: ":@" },
  { file: "embarrassed-smile", name: "Embarrassed smile", shortcut: ":$" },
  { file: "confused-smile", name: "Confused smile", shortcut: ":S" },
  { file: "sad-smile", name: "Sad smile", shortcut: ":(" },
  { file: "crying-face", name: "Crying face", shortcut: ":'(" },
  { file: "disappointed-smile", name: "Disappointed smile", shortcut: ":|" },
  { file: "devil", name: "Devil", shortcut: "(6)" },
  { file: "angel", name: "Angel", shortcut: "(A)" },
  { file: "red-heart", name: "Red heart", shortcut: "(L)" },
  { file: "broken-heart", name: "Broken heart", shortcut: "(U)" },
  { file: "messenger", name: "Messenger", shortcut: "(M)" },
  { file: "cat-face", name: "Cat face", shortcut: "(@)" },
  { file: "dog-face", name: "Dog face", shortcut: "(&)" },
  { file: "sleeping-half-moon", name: "Sleeping half-moon", shortcut: "(S)" },
  { file: "star", name: "Star", shortcut: "(*)" },
  { file: "filmstrip", name: "Filmstrip", shortcut: "(~)" },
  { file: "note", name: "Note", shortcut: "(8)" },
  { file: "e-mail", name: "E-mail", shortcut: "(E)" },
  { file: "red-rose", name: "Red rose", shortcut: "(F)" },
  { file: "wilted-rose", name: "Wilted rose", shortcut: "(W)" },
  { file: "clock", name: "Clock", shortcut: "(O)" },
  { file: "red-lips", name: "Red lips", shortcut: "(K)" },
  { file: "gift-with-a-bow", name: "Gift with a bow", shortcut: "(G)" },
  { file: "birthday-cake", name: "Birthday cake", shortcut: "(^)" },
  { file: "camera", name: "Camera", shortcut: "(P)" },
  { file: "light-bulb", name: "Light bulb", shortcut: "(I)" },
  { file: "coffee-cup", name: "Coffee cup", shortcut: "(C)" },
  { file: "telephone-receiver", name: "Telephone receiver", shortcut: "(T)" },
  { file: "left-hug", name: "Left hug", shortcut: "({)" },
  { file: "right-hug", name: "Right hug", shortcut: "(})" },
  { file: "beer-mug", name: "Beer mug", shortcut: "(B)" },
  { file: "martini-glass", name: "Martini glass", shortcut: "(D)" },
  { file: "boy", name: "Boy", shortcut: "(Z)" },
  { file: "girl", name: "Girl", shortcut: "(X)" },
  { file: "thumbs-up", name: "Thumbs up", shortcut: "(Y)" },
  { file: "thumbs-down", name: "Thumbs down", shortcut: "(N)" },
  { file: "vampire-bat", name: "Vampire bat", shortcut: ":[" },
  { file: "goat", name: "Goat", shortcut: "(nnh)" },
  { file: "sun", name: "Sun", shortcut: "(#)" },
  { file: "rainbow", name: "Rainbow", shortcut: "(R)" },
  {
    file: "dont-tell-anyone-smile",
    name: "Don't tell anyone smile",
    shortcut: ":-#",
  },
  { file: "baring-teeth-smile", name: "Baring teeth smile", shortcut: "8o|" },
  { file: "nerd-smile", name: "Nerd smile", shortcut: "8-|" },
  { file: "sarcastic-smile", name: "Sarcastic smile", shortcut: "^o)" },
  {
    file: "secret-telling-smile",
    name: "Secret telling smile",
    shortcut: ":-*",
  },
  { file: "sick-smile", name: "Sick smile", shortcut: "+o(" },
  { file: "snail", name: "Snail", shortcut: "(sn)" },
  { file: "turtle", name: "Turtle", shortcut: "(tu)" },
  { file: "plate", name: "Plate", shortcut: "(pl)" },
  { file: "bowl", name: "Bowl", shortcut: "(||)" },
  { file: "pizza", name: "Pizza", shortcut: "(pi)" },
  { file: "soccer-ball", name: "Soccer ball", shortcut: "(so)" },
  { file: "auto", name: "Auto", shortcut: "(au)" },
  { file: "airplane", name: "Airplane", shortcut: "(ap)" },
  { file: "umbrella", name: "Umbrella", shortcut: "(um)" },
  {
    file: "island-with-a-palm-tree",
    name: "Island with a palm tree",
    shortcut: "(ip)",
  },
  { file: "computer", name: "Computer", shortcut: "(co)" },
  { file: "mobile-phone", name: "Mobile phone", shortcut: "(mp)" },
  { file: "be-right-back", name: "Be right back", shortcut: "(brb)" },
  { file: "storm-cloud", name: "Storm cloud", shortcut: "(st)" },
  { file: "high-five", name: "High five!", shortcut: "(h5)" },
  { file: "money", name: "Money", shortcut: "(mo)" },
  { file: "black-sheep", name: "Black sheep", shortcut: "(bah)" },
  { file: "i-dont-know-smile", name: "I don't know smile", shortcut: ":^)" },
  { file: "thinking-smile", name: "Thinking smile", shortcut: "*-)" },
  { file: "lightning", name: "Lightning", shortcut: "(li)" },
  { file: "party-smile", name: "Party smile", shortcut: "<:o)" },
  { file: "eye-rolling-smile", name: "Eye-rolling smile", shortcut: "8-)" },
  { file: "sleepy-smile", name: "Sleepy smile", shortcut: "|-)" },
  { file: "bunny", name: "Bunny", shortcut: "('.')" },
];

const FILES = new Set(MSN_EMOTICONS.map((e) => e.file));

/** `:msn-thumbs-up:` and the like, in a message. */
export const MSN_PATTERN = /:msn-([a-z0-9-]+):/g;

export const msnCode = (file: string) => `:msn-${file}:`;
export const isMsnEmoticon = (file: string) => FILES.has(file);
