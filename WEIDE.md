# Weide 1.0

Weide is an open protocol for friends networks without a central owner. It
is ActivityPub (W3C Recommendation, 2018) plus a few extensions for what
ActivityPub has no words for: mutual friendships, guestbook messages
("knuffels"), respect, moods and profile designs. A Weide server talks
normally with any ActivityPub server, such as Mastodon. Between two Weide
servers, nothing is lost.

Anyone may implement Weide. Kuddes is the first implementation; the
references to Kuddes code below show how it does it, not how you must.

The key words MUST, SHOULD and MAY are used as in RFC 2119.

## 1. Servers and accounts

- The network consists of **servers**. Each one has its own members, its own
  admin and its own rules. No server is special. There is no registry or
  central server, and no domain that has to exist for the network to work.
- An account is called `naam@server` (`anna@kuddes.example`). The name is
  lower case: `a-z`, `0-9`, `_`, `.`, `-`.
- A server's admin decides for that server only: who signs up, what's
  allowed, and which other servers it talks to (section 8).
- A member's data is kept by their own server. Another server only gets what
  it needs to show to its own members (section 9).

## 2. Discovery

A server MUST answer:

| Path | What |
| --- | --- |
| `/.well-known/webfinger?resource=acct:naam@server` | WebFinger (RFC 7033) with a `self` link of type `application/activity+json` to the actor; also for the server actor (`acct:server@server`), because Mastodon looks it up before it trusts a signature |
| `/.well-known/nodeinfo` | NodeInfo index, pointing at `/nodeinfo/2.1` |
| `/nodeinfo/2.1` | NodeInfo 2.1 with `metadata.weide` (below) |

`metadata.weide` tells other servers that this server speaks Weide and what
it supports:

```json
{ "version": "1.0", "features": ["vriendschap", "knuffels", "respect", "wiewatwaar", "profielontwerp", "meldingen"] }
```

A server that has no `metadata.weide` is treated as a plain ActivityPub
server (section 7).

## 3. Context

Every document uses the ActivityStreams and security contexts and an inline
term map for Weide. Inline terms mean that no context document has to be
fetched and nobody has to host one. The namespace IRI
`https://w3id.org/weide#` only serves as an identifier.

```json
"@context": [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
  {
    "weide": "https://w3id.org/weide#",
    "manuallyApprovesFollowers": "as:manuallyApprovesFollowers",
    "discoverable": "http://joinmastodon.org/ns#discoverable",
    "plainText": "weide:plainText",
    "friendship": "weide:friendship",
    "knuffelOn": { "@id": "weide:knuffelOn", "@type": "@id" },
    "mood": "weide:mood",
    "where": "weide:where",
    "icon": "weide:icon",
    "realName": "weide:realName",
    "skin": "weide:skin",
    "profileColors": { "@id": "weide:profileColors", "@type": "@json" },
    "knuffelsFrom": "weide:knuffelsFrom",
    "friendRequestsFrom": "weide:friendRequestsFrom",
    "weideVersion": "weide:version"
  }
]
```

A receiver SHOULD accept both the short term (`plainText`) and the prefixed
form (`weide:plainText`), so that it doesn't need a JSON-LD processor.

## 4. Ids

Ids are HTTPS URLs on the server that owns the object. A receiver MUST
ignore an object whose id is on a different host than its actor. Kuddes
uses:

| Object | Id |
| --- | --- |
| Server actor | `/fed/actor` (type `Application`) |
| Member | `/fed/users/{naam}` |
| A photo as JPEG | `/fed/media/photos/{name}.jpg` |
| WieWatWaar | `/fed/statuses/{id}` |
| Knuffel | `/fed/knuffels/{id}` |
| Friend request | `/fed/follows/{id}` |
| Following an account outside Weide | `/fed/subscriptions/{follower}-{followed}` |
| Shared inbox | `/fed/inbox` |

A profile page (`/profiel/{naam}`) requested with
`Accept: application/activity+json` redirects to the actor.

## 5. Signatures

Every POST to an inbox MUST be signed with HTTP Signatures
(draft-cavage-http-signatures-12, `rsa-sha256`), the way Mastodon does it:

- The signed headers are `(request-target) host date digest`.
- `Digest` is `SHA-256=` followed by the base64 SHA-256 of the body.
- The `keyId` is the actor's `publicKey.id` (`…/fed/users/anna#main-key`).

The receiver:

1. fetches the key's owner;
2. checks the signature, a `Date` within one hour, and the digest;
3. checks that the activity's `actor` is the owner of the key.

If the signature doesn't match, the receiver fetches the actor once more (it
may have a new key) before refusing with 401.

GETs MAY be signed by the server actor, for servers that require "authorized
fetch". When a signed GET is refused (401 or 403), Kuddes tries once more
without a signature. Each member has their own RSA-2048 key pair.

## 6. Actors

A member is a `Person` (a bot is a `Service`) with the usual ActivityPub
fields (`inbox`, `outbox`, `followers`, `following`, `endpoints.sharedInbox`,
`publicKey`, `icon`, `summary`, `url`) and:

| Field | Meaning |
| --- | --- |
| `manuallyApprovesFollowers` | `true` (a friendship is asked for and answered), except when accounts outside Weide may follow the member (section 7). |
| `weideVersion` | `"1.0"`. Its presence marks a Weide account. |
| `realName` | The real name, next to the display name in `name`. |
| `skin` | The key of a built-in profile design, or `"eigen"` for the member's own. |
| `profileColors` | The colours and fonts of the design (JSON). Images are left out: they stay on the member's server. |
| `knuffelsFrom` | `"iedereen"` or `"vrienden"`: who may leave a knuffel. |
| `friendRequestsFrom` | `"iedereen"`, `"vriendenvanvrienden"` or `"niemand"`. |

When a member's profile is for friends only, the actor MUST only have the
name, the photo (if public) and the key. It leaves out `summary`,
`realName`, `skin` and `profileColors`.

A changed profile is sent as `Update` with the whole actor.

## 7. Activities

### Friendship

A friendship is mutual and always asked for.

- **Ask:** `Follow` with `"friendship": true`, sent to the other actor's
  inbox.
- **Accept:** `Accept` with the `Follow` as object. On a Weide server an
  accepted friendship works in both directions: both sides deliver their
  posts to the other, and no second `Follow` is needed.
- **Decline or end:**
  - `Reject` of the other's `Follow`;
  - `Undo` of your own `Follow`.

  Either one ends the friendship on both sides.
- **Crossing requests:** if both sides ask at the same time, the receiver
  accepts the other's request and answers with `Accept`.
- **Privacy:** the receiver MUST apply its member's `friendRequestsFrom`
  setting, and answers `Reject` when it doesn't allow the request.

With a plain ActivityPub server:

- An incoming `Follow` is shown as a friend request.
- Accepting it also sends a `Follow` back (id ending in `/terug`), so that
  the other account's posts arrive.

### Following accounts outside Weide

Friendships only exist between Weide servers. An account on a server without
`metadata.weide` (Mastodon and the like) is followed one way instead:

- **Follow:** a plain `Follow`, without `friendship`. Kuddes gives it an id
  of the form `/fed/subscriptions/{follower}-{followed}`.
- **Stop following:** `Undo` of that `Follow`.
- **Their answer:** an `Accept` means the follow is active; a `Reject` ends
  it.
- **What's kept:** only public posts (`Public` in `to` or `cc`) of followed
  accounts.
  - A content warning (`summary`) is put in front of the text.
  - Posts of type `Note`, `Image`, `Article`, `Page` and `Video` are
    accepted, so Pixelfed and the like work too.
  - Kuddes downloads up to four pictures per post and keeps them, with their
    descriptions (`name`), as that account's photos: in the post and in the
    Foto's of its profile.
  - When the first member follows an account, Kuddes also fetches its 20
    newest posts, so the profile isn't empty. They come from its `outbox`,
    or, when that only gives a count (as on Pixelfed), from the server's
    public Mastodon-style API. Each post found there is then fetched as
    ActivityPub from its own id.
  - Pictures of a `sensitive` post stay links; other attachments (video,
    audio) are links too.
  - Kuddes shows these posts in a separate "Fediverse" tab, not between the
    WieWatWaars of members.
- **Boosts:** an `Announce` from a followed account brings the boosted post,
  fetched from its own server, with who boosted it. An `Undo` of the
  `Announce` takes the "boosted by" away again.
- **Counts and replies:** ActivityPub doesn't carry them, so Kuddes reads
  them from the server's public Mastodon-style API:
  - likes, boosts and replies from the account's post list, refreshed at most
    every 15 minutes when the posts are shown; likes count as respect;
  - the replies themselves when a member opens them (Mastodon's
    `/api/v1/statuses/{id}/context`, Pixelfed's
    `/api/v2/comments/{account}/status/{id}`). They're shown, not stored.
- **Turning it off:** a server MAY switch following outside Weide off. It
  then refuses new follows and ignores posts that only come in through a
  follow.

The other way around, accounts outside Weide may follow a member:

- **Following:** a `Follow` without `friendship` from a server without Weide
  is accepted right away (`Accept`), unless the member turned that off or
  has a profile for friends only. In those cases it becomes a friend request
  as before.
- **What followers get:** the member's WieWatWaars for everyone, profile
  updates and deletions; never what's for friends only.
- **`manuallyApprovesFollowers`** in the actor is `false` exactly when
  followers are accepted like this.
- **Photos** go out as JPEG (`/fed/media/photos/{name}.jpg`), because
  Pixelfed and older Mastodon servers don't take WebP. Pixelfed only shows
  posts with a photo.

### Communities (Lemmy and the like)

A community is an ActivityPub `Group`. On a Weide server it becomes a Kudde:

- **Finding it:** `!naam@server` (WebFinger; when a person and a community
  share a name, the `!` picks the link whose `properties` say `Group`).
- **Joining:** joining the Kudde sends a `Follow` to the Group as the member
  (an `Undo` when they leave). The first member's join also reads the Group's
  `outbox`, so the newest posts are there right away.
- **What comes in:** the Group sends `Announce` activities wrapping a
  `Create`, `Update`, `Delete` or `Remove`.
  - A `Page` (or a `Note` without `inReplyTo`) becomes a post on the Kudde's
    Prikbord: the title in bold, the text, the link it's about, and its
    picture stored here.
  - A `Note` with `inReplyTo` becomes a reply under the post it belongs to
    (replies to replies go under the same post).
  - A `Delete` or `Remove` takes them away again.
- **Trust:** what the Group passes on from accounts on other servers is
  fetched again from its own server, not taken from the announcement.
- **Read-only:** members read along here and post on the community's own
  server (posting through Weide comes in a later version).

### WieWatWaar (status)

A WieWatWaar is a `Create` of a `Note`:

```json
{
  "type": "Note",
  "id": "https://a.example/fed/statuses/12",
  "attributedTo": "https://a.example/fed/users/anna",
  "content": "<p>Naar het strand!</p>",
  "plainText": "Naar het strand!",
  "mood": "blij",
  "where": "Scheveningen",
  "icon": "sun",
  "published": "2026-10-09T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://a.example/fed/users/anna/followers"]
}
```

- `plainText` is the exact text. A Weide receiver uses it instead of
  converting `content` back from HTML.
- **Photos** go along as `attachment`, each a `Document` with `mediaType`,
  `url`, `width` and `height`. A receiver SHOULD store copies itself rather
  than load them from the sender's server for every viewer.
- `mood`, `where` and `icon` are optional; a receiver ignores values it
  doesn't know.
- **For friends only:** `to` is only the followers collection.
- **Delivery:** to the inboxes of the author's friends, using the shared
  inbox where there is one.
- **Edit:** an `Update` of the `Note`.
- **Remove:** a `Delete` with a `Tombstone`.
- **Ignored:** replies (`inReplyTo`) are not WieWatWaars, and a receiver
  ignores posts of an account that has no friends on that receiving server.

### Knuffel (guestbook message)

A knuffel is a `Create` of a `Note` with `knuffelOn`, set to the actor whose
profile it is on:

```json
{
  "type": "Note",
  "id": "https://b.example/fed/knuffels/7",
  "attributedTo": "https://b.example/fed/users/bram",
  "knuffelOn": "https://a.example/fed/users/anna",
  "content": "<p><span class=\"h-card\"><a href=\"https://a.example/fed/users/anna\" class=\"u-url mention\">@anna</a></span> </p><p>Fijne dag!</p>",
  "plainText": "Fijne dag!",
  "to": ["https://a.example/fed/users/anna"],
  "cc": ["https://www.w3.org/ns/activitystreams#Public"],
  "tag": [{ "type": "Mention", "href": "https://a.example/fed/users/anna", "name": "@anna@a.example" }]
}
```

- It goes to the profile owner's inbox only.
- The mention in `content` makes it readable on servers without knuffels
  (they show it as a mention).
- The receiving server applies its member's `knuffelsFrom` setting.
- **The author takes it back:** `Delete`.
- **The profile owner takes it off their profile:** `Remove` with the
  knuffel's id as object, sent to the author.

### Respect

Respect is a `Like`:

- **For a WieWatWaar:** the object is the `Note`. Mastodon shows this as a
  favourite.
- **For a person:** the object is the actor itself.

Withdrawing respect is an `Undo` of the `Like`, with the whole `Like` as its
object.

### Accounts

- A deleted account sends `Delete` with the actor as object, to its friends'
  servers.
- The receivers remove the account and everything it left with them.

### Reports

A report is a `Flag`, sent by the server actor to the reported account's
server:

- `object` is the actor plus the reported objects.
- `content` is the reason.
- It MUST NOT say who reported it.

The receiver treats it as a report by one of its own members, for its own
admin to handle.

## 8. Server policies

Each admin decides how their server takes part:

| Mode | Meaning |
| --- | --- |
| `open` | Talks with every server, except blocked ones. |
| `beperkt` | Only talks with servers the admin allowed. |
| `uit` | Doesn't federate. WebFinger and the inboxes answer 404. |

And per other server:

| Policy | Meaning |
| --- | --- |
| `normaal` | Like any other server. |
| `toegestaan` | Allowed, also in `beperkt` mode. |
| `stil` | No new friend requests from there (they get `Reject`). Existing friendships keep working. |
| `geblokkeerd` | Nothing from or to there: inbox requests get 403, and accounts and posts from there are removed. A block covers subdomains. |

A server SHOULD only fetch public addresses (no private or loopback
networks) and limit the size and time of what it fetches.

## 9. Privacy

- A server sends another server only what that server's members may see.
- Public data goes to anyone; anything for friends only goes only to the
  servers of friends.
- E-mail addresses, passwords, IP addresses and private messages never leave
  the member's server.
- Each server is responsible for the personal data it keeps (under the GDPR:
  each admin is a separate controller) and says in its privacy statement
  what it keeps of accounts of other servers and for how long.

## 10. Not in 1.0 yet

The following are local to each server for now:

- private messages and Messenger;
- Kuddes (groups);
- photos, comments and reactions under WieWatWaars;
- polls;
- gadgets;
- the forum;
- events.

They will be added as later versions. A receiver MUST ignore activities and
fields it doesn't know, so that older servers keep working.
