import { Link } from 'react-router-dom'
import { RECIPE_CATEGORIES, formatMinutes, recipeHref, type RecipeSummary } from '../../../shared/recipes'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { categoryIcon } from './recipeQueries'
import './Recipes.css'

/** A recipe as an index card: the photo, the name and how long it takes. */
export function RecipeCard({ recipe: r }: { recipe: RecipeSummary }) {
  return (
    <li className="rc-card">
      <Link to={recipeHref(r)} className="rc-card-link">
        <span className="rc-card-photo">
          {r.photoUrl ? <img src={r.photoUrl} alt="" loading="lazy" /> : <FarmIcon name={categoryIcon(r.category)} size={32} />}
          <span className="rc-card-cat">
            <FarmIcon name={categoryIcon(r.category)} /> {RECIPE_CATEGORIES[r.category].name}
          </span>
        </span>
        <b className="rc-card-title">{r.title}</b>
        <span className="rc-card-meta">
          <span>
            <FarmIcon name="clock" /> {formatMinutes(r.minutes)}
          </span>
          <span>
            <FarmIcon name="group" /> {r.servings}
          </span>
          <span className={r.liked ? 'rc-likes liked' : 'rc-likes'} title={`${r.likes}× lekker`}>
            <FarmIcon name="heart" /> {r.likes}
          </span>
        </span>
      </Link>
      <div className="rc-card-by">
        <Avatar user={r.user} size="tiny" />
        <Link to={`/profiel/${r.user.username}`}>{r.user.nickname}</Link>
      </div>
    </li>
  )
}
