/**
 * The parts of a catalogue page (Glitterplaatjes, Recepten, Recensies, the
 * Gadgetmarkt): a title with a big search box, the categories as a bar of
 * big icons along the top, the list with its sort tabs, and a column on the
 * right with what's yours. Styles in Catalog.css; the URL parameters in
 * useCatalogParams.ts.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pageList } from "../../lib/pageList";
import { FarmIcon } from "../ui/FarmIcon";
import type { FarmIconName } from "../ui/farmIcons";
import "./Catalog.css";

type Search = {
  q: string;
  placeholder: string;
  label: string;
  onSearch: (q: string) => void;
  /** Search while typing (a list that's already loaded) instead of on Zoeken. */
  live?: boolean;
};

/** Title and intro on the left, a big search box (or something else, `side`) on the right. */
export function CatalogHero({
  title,
  intro,
  side,
  ...search
}: { title: string; intro: ReactNode; side?: ReactNode } & (
  Search | { [K in keyof Search]?: never }
)) {
  return (
    <header className="ct-hero">
      <div className="ct-hero-text">
        <h1>{title}</h1>
        <p className="muted">{intro}</p>
      </div>
      {search.onSearch && <SearchBox {...(search as Search)} />}
      {side}
    </header>
  );
}

function SearchBox({ q, placeholder, label, onSearch, live }: Search) {
  const [search, setSearch] = useState(q);
  // A search removed elsewhere (a chip, a link) empties the box too
  const [shown, setShown] = useState(q);
  if (q !== shown) {
    setShown(q);
    setSearch(q);
  }
  return (
    <form
      className="ct-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(search.trim());
      }}
    >
      <FarmIcon name="magnifier" />
      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (live) onSearch(e.target.value.trim());
        }}
        placeholder={placeholder}
        aria-label={label}
      />
      {!live && (
        <button type="submit" className="btn btn-cta">
          Zoeken
        </button>
      )}
    </form>
  );
}

export type CategoryItem<K extends string> = {
  key: K | null;
  name: string;
  hint: string;
  icon: FarmIconName;
  count?: number;
};

/** The categories: big icons with a short hint, in one row that scrolls sideways, with dividers. */
export function CategoryBar<K extends string>({
  label,
  items,
  current,
  onPick,
}: {
  label: string;
  items: CategoryItem<K>[];
  current: K | null;
  onPick: (key: K | null) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  // The chosen category in view, e.g. when the page opens on one near the end
  useEffect(() => {
    const row = list.current;
    const item = row?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    )?.parentElement;
    if (!row || !item) return;
    const left = item.offsetLeft - row.offsetLeft;
    if (
      left < row.scrollLeft ||
      left + item.offsetWidth > row.scrollLeft + row.clientWidth
    )
      row.scrollTo({
        left: left - (row.clientWidth - item.offsetWidth) / 2,
        behavior: "smooth",
      });
  }, [current]);
  const scroll = (dir: number) =>
    list.current?.scrollBy({
      left: dir * list.current.clientWidth * 0.7,
      behavior: "smooth",
    });
  return (
    <nav className="box ct-cats" aria-label={label}>
      <button
        type="button"
        className="ct-cats-arrow prev"
        onClick={() => scroll(-1)}
        aria-label="Vorige"
        tabIndex={-1}
      >
        <FarmIcon name="arrow_left" />
      </button>
      <ul className="ct-cats-list" ref={list}>
        {items.map((c) => (
          <li key={c.key ?? "alles"}>
            <button
              type="button"
              aria-pressed={current === c.key}
              className={current === c.key ? "current" : undefined}
              onClick={() => onPick(c.key)}
            >
              <span className="ct-cat-icon">
                <FarmIcon name={c.icon} size={32} />
                {!!c.count && <b>{c.count}</b>}
              </span>
              <span className="ct-cat-name">{c.name}</span>
              <small>{c.hint}</small>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ct-cats-arrow next"
        onClick={() => scroll(1)}
        aria-label="Volgende"
        tabIndex={-1}
      >
        <FarmIcon name="arrow_right" />
      </button>
    </nav>
  );
}

/** The list: a heading with a count, sort tabs, the chips for what's active, then the contents. */
export function CatalogMain({
  icon,
  title,
  sub,
  sort,
  chips,
  children,
}: {
  icon?: FarmIconName;
  title: string;
  sub: ReactNode;
  sort?: ReactNode;
  chips?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="box ct-main" aria-label={title}>
      <div className="ct-bar">
        <div className="ct-title">
          <h2>
            {icon && <FarmIcon name={icon} size={24} />} {title}
          </h2>
          <span className="muted">{sub}</span>
        </div>
        {sort}
      </div>
      {chips && <div className="ct-active">{chips}</div>}
      {children}
    </section>
  );
}

export function SortTabs<S extends string>({
  options,
  value,
  onChange,
}: {
  options: [S, string, FarmIconName?][];
  value: S;
  onChange: (s: S) => void;
}) {
  return (
    <div className="ct-sort" role="tablist" aria-label="Sorteren">
      {options.map(([key, label, icon]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={value === key ? "current" : undefined}
          onClick={() => onChange(key)}
        >
          {icon && <FarmIcon name={icon} />} {label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  icon,
  label,
  onRemove,
}: {
  icon: FarmIconName;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="ct-chip">
      <FarmIcon name={icon} /> {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} weghalen`}
        title="Weghalen"
      >
        ×
      </button>
    </span>
  );
}

export function CatalogEmpty({
  icon,
  children,
}: {
  icon: FarmIconName;
  children: ReactNode;
}) {
  return (
    <div className="ct-empty">
      <FarmIcon name={icon} size={48} />
      {children}
    </div>
  );
}

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="ct-pager" aria-label="Pagina's">
      <button
        type="button"
        className="btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ‹ Vorige
      </button>
      {pageList(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`gap${i}`} className="muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={p === page ? "btn btn-cta" : "btn"}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="btn"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Volgende ›
      </button>
    </nav>
  );
}

/** The column on the right. */
export function CatalogLayout({
  side,
  children,
}: {
  side: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ct-layout">
      {children}
      <aside className="ct-side sticky-side">{side}</aside>
    </div>
  );
}

/** "Jouw …": a short list to switch between everything and what's yours. */
export function SideFilters<F extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: [F, string, FarmIconName, number?][];
  value: F | null;
  onChange: (f: F) => void;
}) {
  return (
    <section className="box ct-mine">
      <h2>{title}</h2>
      <ul className="ct-filters" aria-label={title}>
        {options.map(([key, label, icon, count]) => (
          <li key={key}>
            <button
              type="button"
              className={value === key ? "current" : undefined}
              aria-pressed={value === key}
              onClick={() => onChange(key)}
            >
              <FarmIcon name={icon} /> <span>{label}</span>
              {count !== undefined && <b>{count}</b>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A box on the right with a big icon: adding something yourself. */
export function SidePlace({
  icon,
  title,
  children,
  action,
}: {
  icon: FarmIconName;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <section className="box ct-place">
      <FarmIcon name={icon} size={32} />
      <div>
        <h2>{title}</h2>
        <div className="ct-place-text muted">{children}</div>
        {action}
      </div>
    </section>
  );
}

/** A box on the right with a short list, hidden on phones. */
export function SideList({
  title,
  items,
  className,
}: {
  title: string;
  items: [FarmIconName, ReactNode][];
  className?: string;
}) {
  return (
    <section className={className ? `box ct-list ${className}` : "box ct-list"}>
      <h2>{title}</h2>
      <ul>
        {items.map(([icon, text], i) => (
          <li key={i}>
            <FarmIcon name={icon} /> <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
