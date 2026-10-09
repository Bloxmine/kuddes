import { useEffect, useMemo, useRef, useState } from "react";
import { MSN_EMOTICONS, msnCode } from "../../../shared/msnEmoticons";
import { SMILEY_CATEGORIES, SMILEYS } from "../../../shared/smileys";
import { RichText } from "../../lib/richText";
import { Smiley } from "../../lib/smileys";
import { Icon } from "../ui/Icon";
import "./SmileyPicker.css";

const byCategory = SMILEY_CATEGORIES.map((_, i) =>
  Object.keys(SMILEYS)
    .filter((name) => SMILEYS[name][2] === i)
    .sort(),
);

/**
 * The Hyves smiley picker: a "Smiley" tab with the categories on the left and
 * the GIFs on the right. Picking one calls onPick with its code, e.g. ":dj:".
 * `msn` (Kuddes Messenger only): a second tab with the MSN emoticons.
 */
export function SmileyPicker({
  onPick,
  msn = false,
}: {
  onPick: (code: string) => void;
  msn?: boolean;
}) {
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"smiley" | "msn">("smiley");
  const msnShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? MSN_EMOTICONS.filter(
          (e) =>
            e.name.toLowerCase().includes(q) || e.shortcut.toLowerCase() === q,
        )
      : MSN_EMOTICONS;
  }, [query]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/:/g, "");
    if (!q) return byCategory[category];
    return Object.keys(SMILEYS)
      .filter((n) => n.toLowerCase().includes(q))
      .sort();
  }, [category, query]);

  return (
    <div className="smiley-picker">
      <div className="smiley-picker-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "smiley"}
          className={tab === "smiley" ? "current" : undefined}
          onClick={() => setTab("smiley")}
        >
          <Smiley name="lach" /> Smiley
        </button>
        {msn && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "msn"}
            className={tab === "msn" ? "current" : undefined}
            onClick={() => setTab("msn")}
          >
            <img src="/msn/smile.png" alt="" width={19} height={19} /> MSN
          </button>
        )}
        <input
          className="smiley-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een smiley"
          aria-label="Zoek een smiley"
        />
      </div>
      {tab === "msn" ? (
        <div className="smiley-picker-body msn">
          <div className="smiley-grid">
            {msnShown.length ? (
              msnShown.map((e) => (
                <button
                  key={e.file}
                  type="button"
                  title={`${e.name} ${e.shortcut}`}
                  onClick={() => onPick(msnCode(e.file))}
                >
                  <img
                    src={`/msn/${e.file}.png`}
                    alt={e.shortcut}
                    width={19}
                    height={19}
                    loading="lazy"
                  />
                </button>
              ))
            ) : (
              <p className="empty">Geen emoticons gevonden.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="smiley-picker-body">
          <ul className="smiley-cats">
            {SMILEY_CATEGORIES.map((name, i) => (
              <li key={name}>
                <button
                  type="button"
                  className={!query && i === category ? "current" : undefined}
                  onClick={() => {
                    setCategory(i);
                    setQuery("");
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
          <div className="smiley-grid">
            {shown.length ? (
              shown.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={`:${name}:`}
                  onClick={() => onPick(`:${name}:`)}
                >
                  <Smiley name={name} />
                </button>
              ))
            ) : (
              <p className="empty">Geen smileys gevonden.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A small smiley picker in a pop-up, for one-line boxes like the reactions
 * under a WieWatWaar: a category menu, a search box and a tight grid. It
 * stays open while you pick, and closes with Escape or a click outside.
 */
export function MiniSmileyPicker({
  onPick,
  onClose,
}: {
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/:/g, "");
    if (!q) return byCategory[category];
    return Object.keys(SMILEYS)
      .filter((n) => n.toLowerCase().includes(q))
      .sort();
  }, [category, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      // The button that opened it toggles it itself
      if (box.current?.contains(el) || el?.closest("[data-mini-smileys]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div className="mini-smileys" ref={box} role="dialog" aria-label="Smileys">
      <div className="mini-smileys-bar">
        <select
          value={query ? -1 : category}
          onChange={(e) => {
            setCategory(Number(e.target.value));
            setQuery("");
          }}
          aria-label="Soort smileys"
        >
          {query && <option value={-1}>Zoeken</option>}
          {SMILEY_CATEGORIES.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek…"
          aria-label="Zoek een smiley"
        />
      </div>
      <div className="mini-smileys-grid">
        {shown.length ? (
          shown.map((name) => (
            <button
              key={name}
              type="button"
              title={`:${name}:`}
              onClick={() => onPick(`:${name}:`)}
            >
              <Smiley name={name} />
            </button>
          ))
        ) : (
          <p className="empty">Geen smileys gevonden.</p>
        )}
      </div>
    </div>
  );
}

/** The "Voorbeeld" panel: the text as it will look, smileys and all. */
export function TextPreview({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <div className="text-preview" role="region" aria-label="Voorbeeld">
      <header>
        <span>Voorbeeld</span>
        <button type="button" onClick={onClose} aria-label="Voorbeeld sluiten">
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="text-preview-body">
        <RichText text={text} />
      </div>
    </div>
  );
}
