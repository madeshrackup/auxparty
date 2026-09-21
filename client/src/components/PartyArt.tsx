import type { GameMode } from "@shared/types";

export function PartyFx() {
  return (
    <div className="party-fx" aria-hidden>
      <svg className="fx-vinyl" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="100" fill="#1a1028" />
        <circle cx="110" cy="110" r="88" fill="none" stroke="#3a1a58" strokeWidth="3" />
        <circle cx="110" cy="110" r="70" fill="none" stroke="#2a1444" strokeWidth="2" />
        <circle cx="110" cy="110" r="52" fill="none" stroke="#3a1a58" strokeWidth="2" />
        <circle cx="110" cy="110" r="28" fill="#ff4db8" />
        <circle cx="110" cy="110" r="10" fill="#1a1028" />
      </svg>
      <div className="fx-eq">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.08}s`, height: `${12 + ((i * 17) % 28)}px` }} />
        ))}
      </div>
      <span className="fx-note n1">♪</span>
      <span className="fx-note n2">♫</span>
      <span className="fx-note n3">♪</span>
      <span className="fx-note n4">♫</span>
      <span className="fx-note n5">♪</span>
      <span className="fx-spark s1" />
      <span className="fx-spark s2" />
      <span className="fx-spark s3" />
      <span className="fx-spark s4" />
      <span className="fx-spark s5" />
      <span className="fx-conf c1" />
      <span className="fx-conf c2" />
      <span className="fx-conf c3" />
      <span className="fx-conf c4" />
    </div>
  );
}

export function VinylBadge() {
  return (
    <svg className="vinyl-badge" viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="38" r="28" fill="#1a1028" />
      <circle cx="36" cy="38" r="22" fill="none" stroke="#5a2a7a" strokeWidth="2" />
      <circle cx="36" cy="38" r="14" fill="none" stroke="#3a1a58" strokeWidth="2" />
      <circle cx="36" cy="38" r="7" fill="#c44ef0" />
      <circle cx="36" cy="38" r="3" fill="#1a1028" />
      <path d="M48 14l4 10 10 2-8 7 2 10-8-5-8 5 2-10-8-7 10-2z" fill="#c6ff3d" />
    </svg>
  );
}

export function PersonBadge() {
  return (
    <svg className="person-badge" viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="16" fill="#5a117c" />
      <circle cx="24" cy="18" r="7" fill="#fff" />
      <path d="M10 40c2-10 8-14 14-14s12 4 14 14" fill="#fff" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" className="mini-ico" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M5 7h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" className="mini-ico" aria-hidden>
      <circle cx="9" cy="8" r="3.2" fill="currentColor" />
      <circle cx="16" cy="9" r="2.6" fill="currentColor" />
      <path d="M2 20c1-5 4-7 7-7s6 2 7 7M13 20c.4-3 2-5 5-5 2 0 3.5 1 4 5" fill="currentColor" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="mini-ico" aria-hidden>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconEye() {
  return (
    <svg viewBox="0 0 24 24" className="secret-ico" aria-hidden>
      <path
        d="M2.5 12S6.2 5.5 12 5.5 21.5 12 21.5 12 17.8 18.5 12 18.5 2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

export function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" className="secret-ico" aria-hidden>
      <path
        d="M2.5 12S6.2 5.5 12 5.5 21.5 12 21.5 12 17.8 18.5 12 18.5 2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg className="friends-lock" viewBox="0 0 72 72" aria-hidden>
      <rect x="14" y="32" width="44" height="32" rx="10" fill="#5a117c" stroke="#fff" strokeWidth="4" />
      <path
        d="M24 32v-9a12 12 0 0 1 24 0v9"
        fill="none"
        stroke="#c6ff3d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="36" cy="46" r="5" fill="#c6ff3d" />
      <path d="M36 51v7" stroke="#c6ff3d" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 4h10v2h3v3c0 2.2-1.6 4-3.7 4.4A5.5 5.5 0 0 1 12.5 16H13v2h3v2H8v-2h3v-2h.5A5.5 5.5 0 0 1 7.7 13.4C5.6 13 4 11.2 4 9V6h3V4zm0 4H6v1c0 1 .6 1.8 1.5 2.1V8zm11 0h-1v3.1c.9-.3 1.5-1.1 1.5-2.1V8h-1.5z"
      />
    </svg>
  );
}

export function VibeIcon({ tone }: { tone: GameMode }) {
  if (tone === "classic") {
    return (
      <span className="vibe-ico flame">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M12 2s4 5 4 9a4 4 0 1 1-8 0c0-2 2-5 4-9zm0 20a7 7 0 0 0 7-7c0-3-2-6-4-8 0 3-1 5-3 5s-3-2-3-5c-2 2-4 5-4 8a7 7 0 0 0 7 7z" />
        </svg>
      </span>
    );
  }
  if (tone === "buzzer") {
    return (
      <span className="vibe-ico bolt">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M13 2 4 14h7l-2 8 11-14h-7l2-6z" />
        </svg>
      </span>
    );
  }
  if (tone === "impostor") {
    return (
      <span className="vibe-ico globe">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M3 12h18" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </span>
    );
  }
  return (
    <span className="vibe-ico star">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 2 14.9 8.6 22 9.2 16.8 14l1.6 7L12 17.3 5.6 21l1.6-7L2 9.2l7.1-.6z" />
      </svg>
    </span>
  );
}

export function SignalBars({ fill }: { fill: number }) {
  const on = Math.max(1, Math.min(4, Math.ceil(fill * 4)));
  return (
    <span className="signal" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= on ? "on" : ""} />
      ))}
    </span>
  );
}
