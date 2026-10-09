import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { formatMinutes, recipeHref } from '../../../shared/recipes'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { categoryIcon } from '../recipes/recipeQueries'
import './RecipesGadget.css'

type RecipesData = Extract<Gadget, { type: 'recepten' }>

/** A checked recipe tin with index cards: the owner's recipes and the ones they found lekker. */
export function RecipesGadget({ gadget, username, isOwner }: { gadget: RecipesData; username: string; isOwner: boolean }) {
  const recipes = gadget.recipes
  if (recipes.length === 0) {
    return (
      <p className="empty">
        Nog geen recepten.{isOwner && <> <Link to="/recepten/nieuw">Deel je eerste recept</Link> of zoek er een op <Link to="/recepten">Recepten</Link>.</>}
      </p>
    )
  }
  return (
    <div className="rg-tin">
      <div className="rg-lid" aria-hidden="true">
        <span>Receptenbak</span>
      </div>
      <ul className="rg-cards">
        {recipes.map((r) => (
          <li key={r.id}>
            <Link to={recipeHref(r)} className="rg-card">
              <span className="rg-thumb">{r.photoUrl ? <img src={r.photoUrl} alt="" loading="lazy" /> : <FarmIcon name={categoryIcon(r.category)} size={24} />}</span>
              <span className="rg-text">
                <b>{r.title}</b>
                <span>
                  <FarmIcon name="clock" /> {formatMinutes(r.minutes)}
                  {r.user.username !== username && (
                    <>
                      {' · '}
                      <FarmIcon name="heart" /> van {r.user.nickname}
                    </>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/recepten?van=${username}`} className="gadget-note muted">
        Alle recepten »
      </Link>
    </div>
  )
}
