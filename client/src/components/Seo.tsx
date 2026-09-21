import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { seoForPath } from "../seo";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = seoForPath(pathname);
    document.title = page.title;
    upsertMeta("name", "description", page.description);
    upsertMeta("name", "robots", page.robots);
    upsertMeta("property", "og:type", pathname === "/" ? "website" : "article");
    upsertMeta("property", "og:site_name", "Aux Party");
    upsertMeta("property", "og:title", page.title);
    upsertMeta("property", "og:description", page.description);
    upsertMeta("property", "og:url", page.canonical);
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", page.title);
    upsertMeta("name", "twitter:description", page.description);
    upsertLink("canonical", page.canonical);

    const scriptId = "aux-jsonld";
    const existing = document.getElementById(scriptId);
    if (page.schema) {
      const script =
        existing instanceof HTMLScriptElement
          ? existing
          : Object.assign(document.createElement("script"), { id: scriptId, type: "application/ld+json" });
      script.textContent = JSON.stringify(page.schema);
      if (!existing) document.head.appendChild(script);
    } else {
      existing?.remove();
    }
  }, [pathname]);

  return null;
}
