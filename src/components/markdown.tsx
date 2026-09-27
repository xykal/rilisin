import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render Markdown dari seller dengan aman: HTML mentah TIDAK dirender
 * (react-markdown default-nya meng-escape HTML), link eksternal diberi rel aman.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-rilis">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
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
