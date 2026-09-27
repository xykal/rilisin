"use client";

import { createContext, Fragment, useContext, type ReactNode } from "react";

/**
 * Format teks chat ala WhatsApp — aman (semua jadi elemen React, tidak ada HTML mentah):
 *   ```blok kode```   `kode`   *tebal*   _miring_   ~coret~   link http(s)   @username
 */
export const ExternalLinkContext = createContext<((url: string) => void) | null>(null);

const FENCE_RE = /```(?:[a-zA-Z0-9_+-]{1,20}\n)?([\s\S]*?)```/g;
const TOKEN_RE =
  /(\bhttps?:\/\/[^\s<>"'`]{2,2000}|\bwww\.[^\s<>"'`]{2,2000}|(?:^|[\s(])@[a-zA-Z][a-zA-Z0-9_]{2,19}\b|(?:^|[\s(])\*[^\s*](?:[^*\n]{0,300}[^\s*])?\*(?=$|[\s.,!?:;)])|(?:^|[\s(])_[^\s_](?:[^_\n]{0,300}[^\s_])?_(?=$|[\s.,!?:;)])|(?:^|[\s(])~[^\s~](?:[^~\n]{0,300}[^\s~])?~(?=$|[\s.,!?:;)]))/g;
const TRAILING_PUNCT_RE = /[.,!?:;)\]}'"]+$/;

function ChatLink({ href, children }: { href: string; children: ReactNode }) {
  const guard = useContext(ExternalLinkContext);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="chat-link"
      onClick={(e) => {
        if (guard) {
          e.preventDefault();
          guard(href);
        }
      }}
    >
      {children}
    </a>
  );
}

function Emphasis({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    let tok = m[0];
    let start = m.index;
    // token mention/format bisa diawali spasi/kurung — biarkan prefiks itu tetap jadi teks biasa
    const lead = /^[\s(]/.test(tok) && !/^(https?:|www\.)/i.test(tok) ? tok[0]! : "";
    if (lead) {
      tok = tok.slice(1);
      start += 1;
    }
    if (start > last) out.push(text.slice(last, start));
    const key = i++;
    if (/^(https?:\/\/|www\.)/i.test(tok)) {
      const trail = tok.match(TRAILING_PUNCT_RE)?.[0] ?? "";
      const url = trail ? tok.slice(0, -trail.length) : tok;
      out.push(
        <ChatLink key={key} href={url.startsWith("www.") ? `https://${url}` : url}>
          {url}
        </ChatLink>,
      );
      if (trail) out.push(trail);
    } else if (tok.startsWith("@")) {
      out.push(
        <a key={key} href={`/@${tok.slice(1).toLowerCase()}`} className="chat-mention">
          {tok}
        </a>,
      );
    } else {
      const inner = tok.slice(1, -1);
      out.push(
        tok[0] === "*" ? (
          <strong key={key}>{inner}</strong>
        ) : tok[0] === "_" ? (
          <em key={key}>{inner}</em>
        ) : (
          <s key={key}>{inner}</s>
        ),
      );
    }
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function Inline({ text }: { text: string }) {
  const segs = text.split(/(`[^`\n]{1,400}`)/g);
  return (
    <>
      {segs.map((s, i) =>
        s.length > 2 && s.startsWith("`") && s.endsWith("`") ? (
          <code key={i} className="chat-code">
            {s.slice(1, -1)}
          </code>
        ) : (
          <Emphasis key={i} text={s} />
        ),
      )}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  const parts: { code: boolean; v: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE_RE)) {
    if (m.index > last) parts.push({ code: false, v: text.slice(last, m.index) });
    parts.push({ code: true, v: m[1]!.replace(/^\n+|\n+$/g, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ code: false, v: text.slice(last) });
  // Blok kode sudah berupa blok → buang satu baris baru tepat sebelum/sesudahnya (hindari baris kosong ganda)
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.code) continue;
    if (parts[i - 1]?.code) p.v = p.v.replace(/^\n/, "");
    if (parts[i + 1]?.code) p.v = p.v.replace(/\n$/, "");
  }
  return (
    <>
      {parts.map((p, i) =>
        p.code ? (
          <pre key={i} className="chat-pre">
            <code>{p.v}</code>
          </pre>
        ) : (
          <Fragment key={i}>
            <Inline text={p.v} />
          </Fragment>
        ),
      )}
    </>
  );
}
