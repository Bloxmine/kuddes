import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Visibility } from '../../../shared/api'
import { BLOG_LIMITS, blogHref, type Blog } from '../../../shared/blogs'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { uploadBlogImage, useBlog, useSaveBlog } from '../../features/blogs/blogQueries'
import { ForumEditor } from '../../features/forum/ForumEditor'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/blogs/Blogs.css'
import '../../features/forum/Forum.css'

/** /blogs/nieuw and /blogs/12/bewerken */
export function BlogEditPage() {
  const id = Number(useParams().id) || null
  const { data: blog, isLoading, error } = useBlog(id ?? 0)
  usePageTitle(id ? 'Blog aanpassen - Kuddes' : 'Blog schrijven - Kuddes')
  if (id && isLoading) return <main className="page page-con muted">Laden…</main>
  if (id && !blog)
    return (
      <main className="page page-con">
        <div className="box box-con">
          <p className="form-error">{errorMessage(error)}</p>
          <Link to="/blogs">« Alle blogs</Link>
        </div>
      </main>
    )
  return <BlogEditor key={id ?? 'nieuw'} blog={blog ?? null} />
}

function BlogEditor({ blog }: { blog: Blog | null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const save = useSaveBlog(blog?.id ?? null)
  const [title, setTitle] = useState(blog?.title ?? '')
  const [body, setBody] = useState(blog?.body ?? '')
  const [visibility, setVisibility] = useState<Visibility>(blog?.visibility ?? user?.preferences.defaultVisibility ?? 'iedereen')

  if (blog && !blog.mine && !user?.isAdmin)
    return (
      <main className="page page-con">
        <div className="box box-con">
          <p className="form-error">Dit is niet jouw blog.</p>
          <Link to={blogHref(blog.id)}>« Terug naar de blog</Link>
        </div>
      </main>
    )

  return (
    <main className="page page-con blog-edit">
      <Box title={blog ? 'Blog aanpassen' : 'Een blog schrijven'} icon="pencil">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({ title, body, visibility }, { onSuccess: (saved) => navigate(blogHref(saved.id)) })
          }}
        >
          <Field label="Titel">
            <input className="text-box blog-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={BLOG_LIMITS.title} placeholder="Waar gaat je blog over?" required />
          </Field>
          <Field label="Je blog">
            <ForumEditor
              value={body}
              onChange={setBody}
              rows={18}
              maxLength={BLOG_LIMITS.body}
              placeholder="Vertel! Met foto's, een YouTube-filmpje op een eigen regel, smileys en opmaak."
              news={{ upload: uploadBlogImage }}
            />
          </Field>
          <Field label="Wie mag hem lezen?">
            <select className="text-box" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="iedereen">Alle leden van Kuddes</option>
              <option value="vrienden">Alleen mijn vrienden</option>
            </select>
          </Field>
          {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
          <div className="blog-edit-actions">
            <Button type="submit" variant="cta" disabled={save.isPending}>
              <FarmIcon name="accept" /> {blog ? 'Opslaan' : 'Plaatsen'}
            </Button>
            <Link to={blog ? blogHref(blog.id) : '/blogs'}>Annuleren</Link>
          </div>
        </form>
      </Box>
    </main>
  )
}
