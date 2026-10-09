import { Link } from 'react-router-dom'
import { blogHref, type BlogSummary } from '../../../shared/blogs'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { withSmileys } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import './Blogs.css'

/** A blog in a list: a small thumbnail (if it has a picture), title, writer, the start of the text. */
export function BlogCard({ blog, compact = false }: { blog: BlogSummary; compact?: boolean }) {
  return (
    <article className={compact ? 'blog-card compact' : 'blog-card'}>
      {blog.imageUrl ? (
        <Link to={blogHref(blog.id)} className="blog-thumb" aria-hidden="true" tabIndex={-1}>
          <img src={blog.imageUrl} alt="" loading="lazy" />
        </Link>
      ) : (
        <Avatar user={blog.author} size={compact ? 'tiny' : 'small'} />
      )}
      <div className="blog-card-text">
        <h3>
          <Link to={blogHref(blog.id)}>{blog.title}</Link>
          {blog.visibility === 'vrienden' && (
            <span className="blog-friends" title="Alleen voor vrienden">
              <FarmIcon name="lock" />
            </span>
          )}
        </h3>
        <p className="blog-meta">
          <Link to={`/profiel/${blog.author.username}`}>{blog.author.nickname}</Link> · {formatTime(blog.createdAt)}
        </p>
        {!compact && <p className="blog-snippet">{withSmileys(blog.snippet)}</p>}
        <p className="blog-counts">
          <span title="Respect">
            <FarmIcon name="star" /> {blog.respectCount}
          </span>
          <span title="Reacties">
            <FarmIcon name="comment" /> {blog.commentCount}
          </span>
          {!compact && (
            <span title="Keer gelezen">
              <FarmIcon name="eye" /> {blog.views}
            </span>
          )}
        </p>
      </div>
    </article>
  )
}
