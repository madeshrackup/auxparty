import type { GameMode } from "@shared/types";

export function PartyFx() {
  return (
    <>
      <div className="party-fx" aria-hidden>
        <div className="fx-edge" />
        <svg className="fx-vinyl" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="100" fill="#12061f" />
          <circle cx="110" cy="110" r="92" fill="none" stroke="#ff4bc8" strokeWidth="6" opacity="0.85" />
          <circle cx="110" cy="110" r="80" fill="none" stroke="#3a1a58" strokeWidth="3" />
          <circle cx="110" cy="110" r="70" fill="none" stroke="#c44ef0" strokeWidth="2" />
          <circle cx="110" cy="110" r="58" fill="none" stroke="#2a1444" strokeWidth="2" />
          <circle cx="110" cy="110" r="46" fill="none" stroke="#ff4bc8" strokeWidth="2" opacity="0.7" />
          <circle cx="110" cy="110" r="28" fill="#ff4bc8" />
          <circle cx="110" cy="110" r="10" fill="#0b0618" />
        </svg>
        <span className="fx-note n1">♪</span>
        <span className="fx-note n2">♫</span>
        <span className="fx-note n3">♪</span>
        <span className="fx-note n4">♫</span>
        <span className="fx-note n5">♪</span>
      </div>
      <div className="party-fx-front" aria-hidden>
        <div className="fx-eq">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.07}s`, height: `${16 + ((i * 19) % 36)}px` }} />
          ))}
        </div>
      </div>
    </>
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
      <rect x="18" y="34" width="36" height="26" rx="8" fill="#5a117c" stroke="#fff" strokeWidth="3" />
      <path
        d="M26 34v-7a10 10 0 0 1 20 0v7"
        fill="none"
        stroke="#c6ff3d"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="36" cy="46" r="4" fill="#c6ff3d" />
      <path d="M36 50v5" stroke="#c6ff3d" strokeWidth="3" strokeLinecap="round" />
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

export function IconGear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.23.1.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L11 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07L13 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" fill="currentColor" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M15 5 8 12l7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 3.1c-.7.3-1.3.8-1.3 1.7V15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 3v5h5M8 13h8M8 17h6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconCookie() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="1.1" fill="currentColor" />
      <circle cx="14.5" cy="9.5" r="1.1" fill="currentColor" />
      <circle cx="11" cy="15" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconNote() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="18" r="3" fill="currentColor" />
      <circle cx="17" cy="16" r="3" fill="currentColor" />
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
