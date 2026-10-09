/**
 * The Blog gadget on a profile (shared/gadgets.ts "blog"): the owner's newest
 * blogs, maybe one uitgelicht on top, in a diary with lined paper or as a
 * plain list; and its settings.
 */
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { blogHref, type BlogSummary } from '../../../shared/blogs'
import type { GadgetConfig } from '../../../shared/gadgets'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { useAuth } from '../../lib/auth'
import { withSmileys } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { BlogCard } from './BlogCard'
import { useBlogs } from './blogQueries'
import './Blogs.css'

type BlogData = Extract<Gadget, { type: 'blog' }>
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const shortDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function Featured({ blog }: { blog: BlogSummary }) {
  return (
    <Link to={blogHref(blog.id)} className="bg-featured">
      {blog.imageUrl && <img src={blog.imageUrl} alt="" loading="lazy" />}
      <span>
        <span className="bg-pin">
          <FarmIcon name="star" /> Uitgelicht
        </span>
        <b>{blog.title}</b>
        <span className="bg-snippet">{withSmileys(blog.snippet)}</span>
        <span className="muted">
          {formatTime(blog.createdAt)} · {blog.views}× gelezen · {blog.respectCount} respect
        </span>
      </span>
    </Link>
  )
}

export function BlogGadget({ gadget, username, isOwner }: { gadget: BlogData; username: string; isOwner: boolean }) {
  const { blogs, config } = gadget
  const empty = !blogs.featured && !blogs.items.length
  return (
    <div className={config.look === 'dagboek' ? 'bg-gadget bg-diary' : 'bg-gadget'}>
      {config.look === 'dagboek' && <div className="bg-rings" aria-hidden="true" />}
      {config.showStats && (
        <div className="gh-stats bg-stats">
          <div>
            <b>{blogs.total}</b>
            <span>{blogs.total === 1 ? 'blog' : 'blogs'}</span>
          </div>
          <div>
            <b>{blogs.views.toLocaleString('nl-NL')}</b>
            <span>gelezen</span>
          </div>
          <div>
            <b>{blogs.respect}</b>
            <span>respect</span>
          </div>
        </div>
      )}
      {empty ? (
        <p className="empty">
          Nog geen blogs.{isOwner && <> <Link to="/blogs/nieuw">Schrijf je eerste blog</Link></>}
        </p>
      ) : (
        <>
          {blogs.featured && <Featured blog={blogs.featured} />}
          {config.look === 'dagboek' ? (
            <ul className="bg-lines">
              {blogs.items.map((b) => (
                <li key={b.id}>
                  <span className="bg-date">{shortDate(b.createdAt)}</span>
                  <Link to={blogHref(b.id)}>{b.title}</Link>
                  {b.visibility === 'vrienden' && <FarmIcon name="lock" label="Alleen voor vrienden" />}
                  <span className="bg-count" title="Reacties">
                    <FarmIcon name="comment" /> {b.commentCount}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="blog-list">
              {blogs.items.map((b) => (
                <li key={b.id}>
                  <BlogCard blog={b} compact />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="bg-foot">
        <Link to={`/blogs?van=${username}`} className="gadget-note muted">
          Alle blogs »
        </Link>
        {isOwner && (
          <Link to="/blogs/nieuw" className="gadget-note">
            <FarmIcon name="pencil" /> Nieuwe blog
          </Link>
        )}
      </div>
    </div>
  )
}

export function BlogGadgetEditor({ value, onChange }: { value: GadgetConfig['blog']; onChange: (next: GadgetConfig['blog']) => void }) {
  const { user } = useAuth()
  const { data } = useBlogs(user?.username ?? null, null, 30, !!user)
  return (
    <div className="gadget-rows">
      <Field label="Uitgelichte blog (bovenaan, met een stukje tekst)">
        <select className="text-box" value={value.featured ?? ''} onChange={(e) => onChange({ ...value, featured: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Geen</option>
          {data?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hoeveel blogs daaronder">
        <select className="text-box" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) })}>
          {[3, 5, 8, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Uiterlijk">
        <select className="text-box" value={value.look} onChange={(e) => onChange({ ...value, look: e.target.value as GadgetConfig['blog']['look'] })}>
          <option value="dagboek">Dagboek (gelinieerd papier)</option>
          <option value="simpel">Simpel</option>
        </select>
      </Field>
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.showStats} onChange={(e) => onChange({ ...value, showStats: e.target.checked })} /> Toon hoeveel blogs, keer gelezen en respect
      </label>
      <p className="muted">
        Blogs schrijf je op <Link to="/blogs">Blogs</Link>. Blogs voor vrienden zien alleen je vrienden.
      </p>
    </div>
  )
}
