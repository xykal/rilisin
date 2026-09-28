import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };

const MENTION_SPLIT = /(^|[^\w@/.])@([a-zA-Z][a-zA-Z0-9_]{2,19})(?![\w])/g;

/**
 * Plugin remark kecil: "@username" di teks biasa → link ke profil. Tidak menyentuh kode (inline/blok)
 * maupun teks yang sudah berada di dalam link.
 */
function remarkMentions() {
  const walk = (node: MdNode) => {
    if (!node.children || node.type === "link" || node.type === "inlineCode" || node.type === "code") return;
    const next: MdNode[] = [];
    for (const child of node.children) {
      if (child.type !== "text" || !child.value?.includes("@")) {
        walk(child);
        next.push(child);
        continue;
      }
      const text = child.value;
      let last = 0;
      for (const m of text.matchAll(MENTION_SPLIT)) {
        const start = m.index! + m[1]!.length;
        if (start > last) next.push({ type: "text", value: text.slice(last, start) });
        const name = m[2]!;
        next.push({ type: "link", url: `/@${name.toLowerCase()}`, children: [{ type: "text", value: `@${name}` }] });
        last = start + name.length + 1;
      }
      if (last < text.length) next.push({ type: "text", value: text.slice(last) });
    }
    node.children = next;
  };
  return (tree: MdNode) => walk(tree);
}

const isInternal = (href: string | undefined) => !!href && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");

/**
 * Render Markdown buatan user dengan aman: HTML mentah TIDAK dirender (skipHtml), URL berbahaya
 * (javascript:, data:) dibuang oleh react-markdown, link eksternal diberi rel aman & nofollow.
 */
export function Markdown({ children, mentions = false, compact = false }: { children: string; mentions?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? "prose-rilis prose-compact" : "prose-rilis"}>
      <ReactMarkdown
        remarkPlugins={mentions ? [remarkGfm, remarkMentions] : [remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            isInternal(href) ? (
              <a href={href}>{children}</a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
                {children}
              </a>
            ),
          // gambar eksternal tidak ditampilkan (hindari tracking pixel & konten tak terkontrol)
          img: ({ alt }) => <span className="text-slate-400">[gambar: {alt}]</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
