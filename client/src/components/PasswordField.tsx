import { useState, type InputHTMLAttributes } from "react";
import { IconEye, IconEyeOff } from "./PartyArt";
import { passwordIssues, passwordStrength, type PasswordStrength } from "@shared/credentials";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordField({ className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret-field">
      <input
        {...props}
        className={className || "nick-input"}
        type={visible ? "text" : "password"}
        aria-label={
          props["aria-label"] || (typeof props.placeholder === "string" ? props.placeholder : "Password")
        }
      />
      <button
        className="secret-toggle"
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((on) => !on)}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

const STRENGTH_COPY: Record<PasswordStrength, string> = {
  weak: "Weak",
  acceptable: "Acceptable",
  strong: "Strong",
};

export function PasswordMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = passwordStrength(password);
  const issues = passwordIssues(password);
  return (
    <div className={`pw-meter is-${strength}`}>
      <div className="pw-meter-bars" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <p className="pw-meter-label">{STRENGTH_COPY[strength]}</p>
      {issues.map((issue) => (
        <p key={issue} className="field-note bad">
          {issue}
        </p>
      ))}
    </div>
  );
}
