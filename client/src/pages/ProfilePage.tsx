import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import { UserBadge } from "../components/UserMenu";
import { useAuth } from "../useAuth";

export default function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [aboutMe, setAboutMe] = useState(auth.user?.aboutMe || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

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

  return (
    <AccountShell showMenu>
      <section className="g-card account-card">
        <p className="lime-title">Profile</p>
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
        <p className="error">{error}</p>
        {saved && <p className="ok-note">{saved}</p>}
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
