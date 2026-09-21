import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import PasswordField from "../components/PasswordField";
import { UserBadge } from "../components/UserMenu";
import { useAuth } from "../useAuth";
import { PRIVACY_EMAIL } from "../legalContent";

export default function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [aboutMe, setAboutMe] = useState(auth.user?.aboutMe || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    if (auth.ready && !auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user, navigate]);

  useEffect(() => {
    setAboutMe(auth.user?.aboutMe || "");
  }, [auth.user?.aboutMe]);

  if (!auth.user) return null;

  async function saveAbout() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await auth.saveProfile(aboutMe);
      setSaved("About me saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const dataUrl = await readFile(file);
      await auth.saveAvatar(dataUrl, file.type || "image/jpeg");
      setSaved("Profile picture updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (deleteConfirm.trim() !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await auth.deleteAccount(deletePassword);
      navigate("/", { replace: true, viewTransition: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell showMenu>
      <section className="g-card account-card">
        <h1 className="lime-title">Profile</h1>
        <div className="profile-photo">
          <UserBadge user={auth.user} size={96} />
          <label className="start-btn alt photo-btn">
            Change picture
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
          </label>
        </div>
        <label className="field-label" htmlFor="about-me">
          About me
        </label>
        <textarea
          id="about-me"
          className="nick-input about-input"
          maxLength={280}
          rows={4}
          value={aboutMe}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder="A little about you"
        />
        <p className="play-copy">{aboutMe.length}/280</p>
        <button className="start-btn" disabled={busy} type="button" onClick={() => void saveAbout()}>
          Save about me
        </button>
        <Link to="/account/password" className="text-link" viewTransition>
          Change password
        </Link>
        <div className="danger-zone">
          <p className="kicker">Delete account</p>
          <p className="play-copy">
            This wipes your username, email, photo, friends, trophies, and stats. You can also email{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
          </p>
          <PasswordField
            placeholder="Current password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            aria-label="Password to delete account"
          />
          <input
            className="nick-input"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder='Type DELETE'
            aria-label="Type DELETE to confirm account deletion"
          />
          <button
            className="start-btn alt danger-btn"
            type="button"
            disabled={busy || !deletePassword || deleteConfirm.trim() !== "DELETE"}
            onClick={() => void removeAccount()}
          >
            Delete my account
          </button>
        </div>
        <p className="error">{error}</p>
        {saved && <p className="ok-note">{saved}</p>}
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
      </section>
    </AccountShell>
  );
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("Keep photos under 2MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}
