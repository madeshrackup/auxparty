export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

const USERNAME_CHAR_RE = /^[a-zA-Z0-9_]+$/;

/** Short or ambiguous terms: match whole tokens only to avoid false positives. */
const BLOCK_TOKEN = [
  "ass",
  "asshole",
  "bastard",
  "beaner",
  "bitch",
  "chink",
  "cock",
  "coon",
  "cum",
  "cunt",
  "dick",
  "dyke",
  "fag",
  "gook",
  "homo",
  "jap",
  "kike",
  "nigga",
  "nigger",
  "paki",
  "piss",
  "pussy",
  "rape",
  "rapist",
  "retard",
  "sex",
  "shit",
  "slut",
  "spic",
  "tard",
  "tit",
  "tranny",
  "wop",
  "whore",
];

/** Distinctive slurs/profanity safe to match as a substring of the compact name. */
const BLOCK_SUBSTRING = [
  "asshole",
  "beaner",
  "bullshit",
  "dickhead",
  "faggot",
  "fuck",
  "motherfuck",
  "nigga",
  "nigger",
  "raghead",
  "retarded",
  "shithead",
  "towelhead",
  "tranny",
  "wetback",
];

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/!/g, "i");
}

function compactName(value: string) {
  return fold(value).replace(/[^a-z]/g, "");
}

function collapseRepeats(value: string) {
  return value.replace(/(.)\1+/g, "$1");
}

function tokens(value: string) {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function usernameHasBlockedLanguage(username: string) {
  const compact = compactName(username);
  const collapsed = collapseRepeats(compact);
  const parts = tokens(username);
  const collapsedParts = parts.map(collapseRepeats);

  for (const term of BLOCK_TOKEN) {
    if (
      parts.includes(term) ||
      collapsedParts.includes(term) ||
      compact === term ||
      collapsed === term
    ) {
      return true;
    }
  }

  for (const term of BLOCK_SUBSTRING) {
    const collapsedTerm = collapseRepeats(term);
    if (compact.includes(term)) return true;
    if (collapsedTerm.length >= 4 && collapsed.includes(collapsedTerm)) return true;
  }

  return false;
}

export function usernameIssues(username: string): string[] {
  const name = username.trim();
  const issues: string[] = [];
  if (!name) return issues;
  if (name.length < USERNAME_MIN) {
    issues.push(`Usernames need at least ${USERNAME_MIN} characters.`);
  }
  if (name.length > USERNAME_MAX) {
    issues.push(`Usernames can be at most ${USERNAME_MAX} characters.`);
  }
  if (!USERNAME_CHAR_RE.test(name)) {
    issues.push("Use only letters, numbers, and underscores.");
  }
  if (usernameHasBlockedLanguage(name)) {
    issues.push("That username contains language we don't allow.");
  }
  return issues;
}

export function usernameLooksValid(username: string) {
  return usernameIssues(username).length === 0 && username.trim().length >= USERNAME_MIN;
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN) {
    issues.push(`Password needs at least ${PASSWORD_MIN} characters.`);
  }
  if (password.length > PASSWORD_MAX) {
    issues.push(`Password can be at most ${PASSWORD_MAX} characters.`);
  }
  if (!/\d/.test(password)) {
    issues.push("Password needs at least 1 number.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("Password needs at least 1 symbol.");
  }
  return issues;
}

export function passwordMeetsPolicy(password: string) {
  return passwordIssues(password).length === 0;
}

export type PasswordStrength = "weak" | "acceptable" | "strong";

export function passwordStrength(password: string): PasswordStrength {
  if (!passwordMeetsPolicy(password)) return "weak";
  const digits = (password.match(/\d/g) || []).length;
  const symbols = (password.match(/[^A-Za-z0-9]/g) || []).length;
  const mixedCase = /[A-Z]/.test(password) && /[a-z]/.test(password);
  let extra = 0;
  if (password.length >= 12) extra += 1;
  if (password.length >= 16) extra += 1;
  if (digits >= 2) extra += 1;
  if (symbols >= 2) extra += 1;
  if (mixedCase) extra += 1;
  return extra >= 3 || password.length >= 14 ? "strong" : "acceptable";
}
