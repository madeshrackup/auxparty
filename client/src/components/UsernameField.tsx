import { useEffect, useState } from "react";
import { checkUsername } from "../api";
import { USERNAME_MAX, usernameIssues, usernameLooksValid } from "@shared/credentials";

export type UsernameLiveStatus = "idle" | "checking" | "free" | "taken";

export default function UsernameField({
  value,
  onChange,
  liveCheck,
  onLiveStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  liveCheck: boolean;
  onLiveStatus?: (status: UsernameLiveStatus) => void;
}) {
  const issues = liveCheck ? usernameIssues(value) : [];
  const [status, setStatus] = useState<UsernameLiveStatus>("idle");
  const issueKey = issues.join("\n");

  useEffect(() => {
    onLiveStatus?.(status);
  }, [status, onLiveStatus]);

  useEffect(() => {
    if (!liveCheck) {
      setStatus("idle");
      return;
    }
    const name = value.trim();
    if (!name || issues.length > 0 || !usernameLooksValid(value)) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    const timer = window.setTimeout(() => {
      void checkUsername(name)
        .then((res) => {
          if (!cancelled) setStatus(res.available ? "free" : "taken");
        })
        .catch(() => {
          if (!cancelled) setStatus("idle");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, liveCheck, issueKey]);

  const mark =
    !liveCheck || !value.trim()
      ? null
      : issues.length || status === "taken"
        ? "bad"
        : status === "free"
          ? "ok"
          : null;

  return (
    <div className="username-field">
      <div className="secret-field">
        <input
          className={`nick-input ${mark ? "has-mark" : ""}`}
          placeholder="Username"
          autoComplete="username"
          aria-label="Username"
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {mark && (
          <span className={`field-mark ${mark}`} aria-hidden>
            {mark === "ok" ? "✓" : "✕"}
          </span>
        )}
      </div>
      {liveCheck &&
        issues.map((issue) => (
          <p key={issue} className="field-note bad">
            {issue}
          </p>
        ))}
      {liveCheck && !issues.length && status === "free" && (
        <p className="field-note ok">That username is available.</p>
      )}
      {liveCheck && !issues.length && status === "taken" && (
        <p className="field-note bad">That username is taken.</p>
      )}
    </div>
  );
}
