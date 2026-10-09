import { Link, useNavigate, useParams } from "react-router-dom";
import { blogHref, type Blog } from "../../../shared/blogs";
import { SocialBar } from "../../components/social/SocialBar";
import { Avatar } from "../../components/ui/Avatar";
import { Box } from "../../components/ui/Box";
import { Button } from "../../components/ui/Button";
import { FarmIcon } from "../../components/ui/FarmIcon";
import { BlogCard } from "../../features/blogs/BlogCard";
import {
  useBlog,
  useBlogs,
  useDeleteBlog,
} from "../../features/blogs/blogQueries";
import { ForumBody } from "../../features/forum/ForumBody";
import { ApiRequestError, errorMessage } from "../../lib/api";
import { formatLongDate } from "../../lib/time";
import { usePageTitle } from "../../lib/usePageTitle";
import "../../features/blogs/Blogs.css";
import "../../features/forum/Forum.css";
import { ShareWithFriends } from '../../features/share/ShareWithFriends'
import { ReportButton } from '../../components/social/ReportButton'

/** /blogs/12: the blog, with respect and reactions, and more from the same writer. */
export function BlogPage() {
  const id = Number(useParams().id);
  const { data: blog, isLoading, error } = useBlog(id);
  usePageTitle(blog ? `${blog.title} - Blogs - Kuddes` : "Blogs - Kuddes");

  if (isLoading) return <main className="page page-con muted">Laden…</main>;
  if (!blog) {
    const missing = error instanceof ApiRequestError && error.status === 404;
    return (
      <main className="page page-con">
        <div className="box box-con">
          <p className="empty">
            {missing
              ? "Deze blog bestaat niet (meer), of is alleen voor vrienden."
              : errorMessage(error)}
          </p>
          <Link to="/blogs">« Alle blogs</Link>
        </div>
      </main>
    );
  }
  return <BlogView key={blog.id} blog={blog} />;
}

function BlogView({ blog }: { blog: Blog }) {
  const navigate = useNavigate();
  const remove = useDeleteBlog();
  const { data: more } = useBlogs(blog.author.username, null, 6);
  const others = (more?.items ?? [])
    .filter((b) => b.id !== blog.id)
    .slice(0, 5);
  const edited =
    new Date(blog.updatedAt).getTime() - new Date(blog.createdAt).getTime() >
    60_000;

  return (
    <main className="page page-con blog-page">
      <div>
        {/* A sheet of paper without a box header: the title is the header */}
        <section className="box blog-sheet">
          <div className="box-con">
            <article>
              <h1>{blog.title}</h1>
              <div className="blog-byline">
                <Avatar user={blog.author} size="tiny" />
                <span>
                  door{" "}
                  <b>
                    <Link to={`/profiel/${blog.author.username}`}>
                      {blog.author.nickname}
                    </Link>
                  </b>{" "}
                  op {formatLongDate(blog.createdAt)}
                  {edited && (
                    <> (aangepast op {formatLongDate(blog.updatedAt)})</>
                  )}
                </span>
                {blog.visibility === "vrienden" && (
                  <span className="blog-chip">
                    <FarmIcon name="lock" /> Alleen voor vrienden
                  </span>
                )}
                <span className="blog-chip" title="Keer gelezen">
                  <FarmIcon name="eye" /> {blog.views.toLocaleString("nl-NL")}×
                  gelezen
                </span>
              </div>
              <div className="blog-body">
                <ForumBody body={blog.body} news />
              </div>
            </article>
            {!blog.mine && (
              <div className="blog-tools">
                <ReportButton kind="blog" targetId={blog.id} authorId={blog.author.id} look="button" />
              </div>
            )}
            {blog.mine && (
              <div className="blog-tools">
                <span className="muted">Dit is jouw blog.</span>
                <Link to={`${blogHref(blog.id)}/bewerken`} className="btn">
                  <FarmIcon name="pencil" /> Aanpassen
                </Link>
                <Button
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Deze blog weggooien? Respect en reacties gaan ook weg.",
                      )
                    )
                      remove.mutate(blog.id, {
                        onSuccess: () =>
                          navigate("/blogs?van=" + blog.author.username),
                      });
                  }}
                >
                  <FarmIcon name="bin" /> Weggooien
                </Button>
              </div>
            )}
            {remove.isError && (
              <p className="form-error">{errorMessage(remove.error)}</p>
            )}
            <p className="blog-share">
            <ShareWithFriends path={blogHref(blog.id)} className="link-button share-link" />
          </p>
          <div className="blog-social">
              <SocialBar social={blog.social} />
            </div>
          </div>
        </section>
      </div>

      <aside>
        <Box title={`Meer van ${blog.author.nickname}`} icon="book_open">
          {others.length ? (
            <ul className="blog-list">
              {others.map((b) => (
                <li key={b.id}>
                  <BlogCard blog={b} compact />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              Dit is de enige blog van {blog.author.nickname}.
            </p>
          )}
          <Link to={`/blogs?van=${blog.author.username}`} className="box-more">
            Alle blogs van {blog.author.nickname} »
          </Link>
        </Box>
        <Box title="Zelf bloggen" icon="pencil">
          <Link to="/blogs/nieuw" className="btn btn-cta blog-write">
            <FarmIcon name="pencil" /> Schrijf een blog
          </Link>
        </Box>
      </aside>
    </main>
  );
}
