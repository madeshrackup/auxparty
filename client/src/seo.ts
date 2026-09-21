import { PRIVACY_EMAIL, SITE_HOST } from "./legalContent";

export const SITE_ORIGIN = `https://${SITE_HOST}`;

export const HOME_TITLE = "Aux Party — the music quiz for friends";
export const HOME_DESCRIPTION =
  "Play Aux Party, a free multiplayer music quiz. Guess songs in Classic, Buzzer Beater, Who Added This?, and Pass the Aux. Create a room or join with a 4-letter code.";

type SeoPage = {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  schema?: Record<string, unknown>;
};

const INDEX = "index,follow";
const NOINDEX = "noindex,nofollow";

function url(path: string) {
  return `${SITE_ORIGIN}${path}`;
}

const websiteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Aux Party",
      url: url("/"),
      description: HOME_DESCRIPTION,
      inLanguage: "en-GB",
    },
    {
      "@type": "WebApplication",
      name: "Aux Party",
      url: url("/"),
      applicationCategory: "GameApplication",
      genre: "Music quiz",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      description: HOME_DESCRIPTION,
    },
    {
      "@type": "Organization",
      name: "Aux Party",
      url: url("/"),
      email: PRIVACY_EMAIL,
    },
  ],
};

function webPage(name: string, path: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url: url(path),
    description,
    isPartOf: { "@type": "WebSite", name: "Aux Party", url: url("/") },
  };
}

export function seoForPath(pathname: string): SeoPage {
  if (pathname === "/") {
    return {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonical: url("/"),
      robots: INDEX,
      schema: websiteSchema,
    };
  }
  if (pathname === "/privacy") {
    return {
      title: "Privacy Policy | Aux Party",
      description:
        "How Aux Party collects and uses account, guest, and game data. We do not sell data or run ad trackers.",
      canonical: url("/privacy"),
      robots: INDEX,
      schema: webPage("Privacy Policy", "/privacy", "How Aux Party handles player data."),
    };
  }
  if (pathname === "/terms") {
    return {
      title: "Terms of Service | Aux Party",
      description: "Rules for playing Aux Party, creating an account, and using song previews from Apple's catalogue.",
      canonical: url("/terms"),
      robots: INDEX,
      schema: webPage("Terms of Service", "/terms", "Terms for playing Aux Party."),
    };
  }
  if (pathname === "/cookies") {
    return {
      title: "Cookie Policy | Aux Party",
      description:
        "Aux Party uses essential cookies for login and game settings, plus guest nickname storage. No advertising or analytics cookies.",
      canonical: url("/cookies"),
      robots: INDEX,
      schema: webPage("Cookie Policy", "/cookies", "Cookies and device storage used by Aux Party."),
    };
  }
  if (pathname === "/settings") {
    return {
      title: "Game settings | Aux Party",
      description: "Set in-game volume, default lobby, and rounds for Aux Party on this browser.",
      canonical: url("/settings"),
      robots: NOINDEX,
    };
  }
  if (pathname === "/credits") {
    return {
      title: "Credits | Aux Party",
      description: "Credits for Aux Party, including owner and lead developer Madesh, and the catalogues that power song previews.",
      canonical: url("/credits"),
      robots: INDEX,
      schema: webPage("Credits", "/credits", "Credits for Aux Party."),
    };
  }
  if (pathname === "/how-to-play") {
    return {
      title: "How to play | Aux Party",
      description: "Share a code, join a party, play music quizzes, and score points with friends in Aux Party.",
      canonical: url("/how-to-play"),
      robots: INDEX,
      schema: webPage("How to play", "/how-to-play", "How to play Aux Party."),
    };
  }
  if (pathname === "/achievements") {
    return {
      title: "Aux Party Badges | Aux Party",
      description: "Trophies you can unlock in Aux Party, from hosting a room to winning on the podium.",
      canonical: url("/achievements"),
      robots: INDEX,
      schema: webPage("Aux Party Badges", "/achievements", "Trophies and badges in Aux Party."),
    };
  }
  if (pathname.startsWith("/room/")) {
    return {
      title: "Party room | Aux Party",
      description: HOME_DESCRIPTION,
      canonical: url("/"),
      robots: NOINDEX,
    };
  }
  return {
    title: "Aux Party",
    description: HOME_DESCRIPTION,
    canonical: url("/"),
    robots: NOINDEX,
  };
}
