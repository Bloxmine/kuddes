import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { FarmIcon } from "../../components/ui/FarmIcon";
import type { FarmIconName } from "../../components/ui/farmIcons";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { startPath } from "../../lib/preferences";
import { useStats } from "../../lib/queries";
import { ResendConfirmation } from "../account/VerifyBanner";
import "./VisitorWelcome.css";

const FEATURES: { icon: FarmIconName; title: string; text: string }[] = [
  {
    icon: "paintbrush",
    title: "Pimp je profiel",
    text: "Skins, gadgets, glitters en je eigen muziek.",
  },
  {
    icon: "heart",
    title: "Knuffel je vrienden",
    text: "WieWatWaars, knuffels en Messenger.",
  },
  {
    icon: "group",
    title: "Word lid van een Kudde",
    text: "Voor je school, club, band of hobby.",
  },
  {
    icon: "controller",
    title: "Speel spellen",
    text: "Tegen je vrienden of in je eentje.",
  },
];

/**
 * Home for visitors, like the old Hyves front door: what Kuddes is, how
 * many people are on it, "Word gratis lid" and a login box right there.
 */
export function VisitorWelcome({ waiting = false }: { waiting?: boolean }) {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useStats();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <section className="visitor" aria-labelledby="visitor-title">
      <div className="visitor-intro">
        <h1 id="visitor-title">
          Het gezelligste vriendennetwerk van Nederland
        </h1>
        <p className="visitor-count">
          Al <b>{stats ? stats.members.toLocaleString("nl-NL") : "…"}</b>{" "}
          {stats?.members === 1 ? "lid" : "leden"}
          {stats && stats.online > 0 && (
            <>, waarvan {stats.online.toLocaleString("nl-NL")} nu online</>
          )}
          . Gratis, zonder advertenties en zonder tracking.
        </p>
        <ul className="visitor-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <FarmIcon name={f.icon} size={32} />
              <span>
                <b>{f.title}</b>
                {f.text}
              </span>
            </li>
          ))}
        </ul>
        {!waiting && (
          <Link to="/aanmelden" className="btn btn-cta visitor-join">
            Word gratis lid »
          </Link>
        )}
      </div>

      {waiting && user ? (
        <div className="visitor-login visitor-waiting">
          <h2>
            <FarmIcon name={user.awaitingApproval ? "hourglass" : "email_open"} /> Welkom, {user.nickname}!
          </h2>
          {user.awaitingApproval ? (
            <p>
              Je aanmelding wacht op goedkeuring door de beheerder. Daarna zie
              je de profielen, foto’s en Kuddes van anderen en kun je posten.
            </p>
          ) : (
            <p>
              Bevestig nog even je e-mailadres met de link in de mail naar{" "}
              <b>{user.email}</b>. Daarna zie je de profielen, foto’s en Kuddes
              van anderen en kun je posten. <ResendConfirmation />
            </p>
          )}
          {user.awaitingApproval ? (
            <>
              <p className="muted">Maak je profiel intussen alvast klaar:</p>
              <Link to="/instellingen#foto" className="btn">
                <FarmIcon name="picture_add" /> Profielfoto
              </Link>
              <Link to="/instellingen#design" className="btn">
                <FarmIcon name="paintcan" /> Pimp je profiel
              </Link>
              <Link to={`/profiel/${user.username}`} className="visitor-forgot">
                Bekijk je profiel »
              </Link>
            </>
          ) : (
            <>
              <p className="muted">
                Niets gekregen? Kijk ook in je spam of ongewenste e-mail.
              </p>
              <Link to="/instellingen#e-mailadres" className="visitor-forgot">
                Verkeerd e-mailadres? »
              </Link>
            </>
          )}
        </div>
      ) : (
        <form
          className="visitor-login"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate(
              { username, password },
              { onSuccess: (me) => navigate(startPath(me), { replace: true }) },
            );
          }}
        >
          <h2>
            <FarmIcon name="key" /> Al lid? Log in
          </h2>
          <label>
            Gebruikersnaam of e-mailadres
            <input
              className="text-box"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Wachtwoord
            <input
              className="text-box"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {login.isError && (
            <p className="form-error">{errorMessage(login.error)}</p>
          )}
          <Button type="submit" disabled={login.isPending}>
            Inloggen
          </Button>
          <Link to="/wachtwoord-vergeten" className="visitor-forgot">
            Wachtwoord vergeten?
          </Link>
        </form>
      )}
    </section>
  );
}
