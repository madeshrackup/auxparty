import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clearGuestData } from "../identity";

const KEY = "aux_cookie_consent";

export function hasCookieConsent() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function rememberConsent() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

export default function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!hasCookieConsent());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("cookie-banner-open", open);
    return () => document.documentElement.classList.remove("cookie-banner-open");
  }, [open]);

  if (!open) return null;

  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <p>
        Aux Party uses an essential login cookie and stores your guest nickname on this device. No ad
        trackers.{" "}
        <Link to="/cookies" viewTransition>
          Cookie policy
        </Link>
      </p>
      <div className="cookie-banner-actions">
        <button
          type="button"
          className="start-btn"
          onClick={() => {
            rememberConsent();
            setOpen(false);
          }}
        >
          Got it
        </button>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            clearGuestData();
            rememberConsent();
            setOpen(false);
            window.location.reload();
          }}
        >
          Clear guest data
        </button>
      </div>
    </div>
  );
}
