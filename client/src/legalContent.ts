export type LegalDoc = "privacy" | "terms" | "cookies";

type Section = { heading: string; body: string[] };

export const LEGAL_UPDATED = "21 September 2026";
export const PRIVACY_EMAIL = "privacy@auxparty.co.uk";
export const SITE_HOST = "auxparty.co.uk";

export const LEGAL: Record<LegalDoc, { title: string; intro: string; sections: Section[] }> = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "Aux Party is a music quiz you can play as a guest or with an account. We only keep what we need to run the party, keep you signed in, and show your scores.",
    sections: [
      {
        heading: "Who we are",
        body: [
          `Aux Party is operated from ${SITE_HOST}. For privacy questions, email ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        heading: "What we collect",
        body: [
          "Guest play: a random guest id, the nickname you type, and the character you pick. Those stay in your browser (local storage). We do not create an account unless you sign up.",
          "Account: username, email, a hashed password, optional about-me text, optional profile photo, friends, friend messages, trophies, and game stats.",
          "During a match the live server keeps the room code, your display name, character, guesses, and scores for that session. That live room state is not a lasting profile.",
          "Song search goes through our server to Apple's iTunes Search API so we can show previews. We do not build a listening history from those searches.",
        ],
      },
      {
        heading: "What we do not collect",
        body: [
          "We do not ask for your birthday, phone number, address, or payment details.",
          "We do not run advertising cookies or sell your data.",
          "Age is a yes/no confirmation that you are 13 or older. We do not store a date of birth.",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "To create and sign in to your account, verify email, reset passwords, run multiplayer rooms, keep score, and show friends and trophies.",
          "The session cookie keeps you logged in. Guest storage remembers your nickname on this device.",
        ],
      },
      {
        heading: "Children",
        body: [
          "Aux Party accounts are for people aged 13 or older. If you are under 13, play as a guest with a parent or guardian, and do not create an account.",
          "If you believe a child under 13 created an account, email us and we will delete it.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Account data stays until you delete the account from Profile, or we remove it after a valid deletion request.",
          "Guest data stays on this device until you clear it (Cookie policy) or wipe the browser site data.",
          "Live rooms disappear when the party ends or the server restarts.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "Signed-in players can update profile text and photo, change password, and delete the account from Profile. Deletion removes the account, sessions, friends data, trophies, stats, and profile photo we stored.",
          "You can email a deletion request to " +
            PRIVACY_EMAIL +
            " from the address on the account.",
          "Guests can clear nickname and character data on this device from the cookie banner or Cookie policy page.",
        ],
      },
      {
        heading: "Sharing",
        body: [
          "We use hosting, database (Supabase), and email (Resend) providers to run Aux Party. They only process data to provide those services.",
          "Other players in your room see your nickname, character or photo, score, and whatever you submit in that game.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: "These terms cover playing Aux Party on this site. If you do not agree, do not create an account or join a room.",
    sections: [
      {
        heading: "The game",
        body: [
          "Aux Party is a free music quiz. Song clips and artwork come from Apple's iTunes preview catalogue. We do not sell downloads or host full tracks.",
          "Rooms are live sessions. We do not promise that a party, score, or trophy will be stored forever.",
        ],
      },
      {
        heading: "Eligibility",
        body: [
          "You must be 13 or older to create an account. Guests under 13 should only play with a parent or guardian and must not enter an email address.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "Keep your password to yourself. You are responsible for the username, photo, and messages you post.",
          "Do not impersonate others, harass players, or use the service to break the law. We may suspend or delete accounts that break these terms.",
        ],
      },
      {
        heading: "Fair play",
        body: [
          "Do not cheat, spam rooms, scrape the service, or attack the game server. We can end a room or block access if needed to keep the party running.",
        ],
      },
      {
        heading: "Content",
        body: [
          "You keep rights to the nickname, about-me text, and photo you upload. You give us permission to show them in rooms, friends lists, and on your profile so the game works.",
          "Preview clips remain subject to Apple's terms. We can change or drop a catalogue source if we have to.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Aux Party is provided as-is. Live games can drop, clips can fail to play, and scores can reset if a room dies. We are not liable for lost trophies, lost parties, or downtime beyond what the law requires.",
        ],
      },
      {
        heading: "Changes",
        body: [
          `We may update these terms. The date at the top of this page will change when we do. Questions: ${PRIVACY_EMAIL}.`,
        ],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    intro:
      "Aux Party uses a small set of essential cookies and device storage so you can stay in a room and keep a nickname. We do not use advertising or analytics cookies.",
    sections: [
      {
        heading: "Essential cookies",
        body: [
          "aux_sid: set when you log in. It is httpOnly, SameSite=Lax, Secure on HTTPS, lasts about 30 days, and tells the server who you are. Clearing it signs you out.",
          "aux_csrf: a non-httpOnly security token used with mutating API requests. Same flags as the session cookie except JavaScript must read it to send the matching header.",
        ],
      },
      {
        heading: "Essential device storage",
        body: [
          "Guest id, nickname, and character stay in local storage so you can rejoin as the same guest on this browser. Cookie-consent acknowledgement also lives here so we do not nag you every refresh.",
        ],
      },
      {
        heading: "What we do not set",
        body: [
          "No marketing pixels, no third-party ad cookies, no optional tracking cookies. Song search is a request to our server, not a cookie.",
        ],
      },
      {
        heading: "Your controls",
        body: [
          "Use your browser settings to delete cookies and site data.",
          "Signed-in players: Sign out clears the session cookie. Delete account from Profile removes the account on our side.",
          "Guests: use Clear guest data on this device below, or in the cookie banner after you open Cookie policy.",
        ],
      },
    ],
  },
};
