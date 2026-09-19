import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthUser } from "@shared/types";
import { useAuth } from "../useAuth";

export function UserBadge({
  user,
  size = 42,
}: {
  user: AuthUser;
  size?: number;
}) {
  const letter = (user.username.trim()[0] || "?").toUpperCase();
  return (
    <span className="user-badge" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : letter}
    </span>
  );
}

export default function UserMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const user = auth.user;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  async function signOut() {
    setOpen(false);
    await auth.logout();
    navigate("/", { viewTransition: true });
  }

  return (
    <div className={`user-menu ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="user-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <UserBadge user={user} />
      </button>
      {open && (
        <div className="user-menu-drop" role="menu">
          <Link className="user-menu-item" role="menuitem" to="/account" viewTransition onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link className="user-menu-item" role="menuitem" to="/friends" viewTransition onClick={() => setOpen(false)}>
            Friends
          </Link>
          <Link className="user-menu-item" role="menuitem" to="/account/stats" viewTransition onClick={() => setOpen(false)}>
            Stats
          </Link>
          <button className="user-menu-item" type="button" role="menuitem" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
