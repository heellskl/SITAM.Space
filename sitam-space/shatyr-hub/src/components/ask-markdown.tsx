// Small, safe Markdown renderer for Ask SITAM answers (no HTML is ever injected — everything becomes React nodes).
// Supports: headings, paragraphs, bullet / numbered lists, **bold**, *italic*, `code`, ```code blocks``` with a Copy
// button, pipe tables, > quotes, --- rules, [text](link) links and [n] citation chips.

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = { text: string; onCite: (n: number) => void; known: Set<number>; onLink: (href: string) => void };

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={() => void copy()} aria-label="Copy code">{copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\[\d{1,2}\]|(?<![*\w])\*[^*\n]+\*(?!\*))/g;

function Inline({ text, onCite, known, onLink }: Props): ReactNode {
  return text.split(INLINE).filter((x) => x !== '').map((part, i) => {
    let m: RegExpExecArray | null;
    if ((m = /^\*\*(.+)\*\*$/.exec(part))) return <strong key={i}>{m[1]}</strong>;
    if ((m = /^`(.+)`$/.exec(part))) return <code key={i} className="md-inline">{m[1]}</code>;
    if ((m = /^\[(\d{1,2})\]$/.exec(part)) && known.has(Number(m[1]))) {
      const n = Number(m[1]);
      return <button key={i} type="button" className="ask-cite" onClick={() => onCite(n)} aria-label={`Open source ${n}`}>{n}</button>;
    }
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part))) {
      const href = m[2]!;
      if (href.startsWith('/')) return <button key={i} type="button" className="md-link" onClick={() => onLink(href)}>{m[1]}</button>;
      if (/^https?:\/\//i.test(href)) return <a key={i} className="md-link" href={href} target="_blank" rel="noopener noreferrer">{m[1]}</a>;
      return <span key={i}>{m[1]}</span>;
    }
    if ((m = /^\*([^*]+)\*$/.exec(part))) return <em key={i}>{m[1]}</em>;
    return <span key={i}>{part}</span>;
  });
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function Markdown(props: Props) {
  const lines = props.text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  const inl = (t: string) => <Inline {...props} text={t} />;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    // code block
    const fence = /^```(\w*)/.exec(t);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) body.push(lines[i++]!);
      i++;
      out.push(<CodeBlock key={out.length} code={body.join('\n')} lang={fence[1] ?? ''} />);
      continue;
    }
    // table
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(
        <div key={out.length} className="md-table-wrap">
          <table className="md-table">
            <thead><tr>{head.map((h, k) => <th key={k}>{inl(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{head.map((_, c) => <td key={c}>{inl(r[c] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // lists
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    const num = /^\d+[.)]\s+(.*)$/.exec(t);
    if (bullet || num) {
      const ordered = !!num;
      const items: string[] = [];
      while (i < lines.length) {
        const tt = lines[i]!.trim();
        const b = ordered ? /^\d+[.)]\s+(.*)$/.exec(tt) : /^[-*•]\s+(.*)$/.exec(tt);
        if (!b) break;
        items.push(b[1]!);
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      out.push(<Tag key={out.length} className="ask-list">{items.map((it, k) => <li key={k}>{inl(it)}</li>)}</Tag>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { out.push(<p key={out.length} className={`md-h md-h${h[1]!.length}`}>{inl(h[2]!)}</p>); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { out.push(<hr key={out.length} className="md-hr" />); i++; continue; }
    if (t.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) q.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      out.push(<blockquote key={out.length} className="md-quote">{inl(q.join(' '))}</blockquote>);
      continue;
    }
    if (!t) { i++; continue; }
    // paragraph: consecutive plain lines
    const para: string[] = [];
    while (i < lines.length) {
      const tt = lines[i]!.trim();
      if (!tt || /^```|^[-*•]\s|^\d+[.)]\s|^#{1,4}\s|^>/.test(tt) || (isTableRow(lines[i]!) && i + 1 < lines.length && isTableSep(lines[i + 1]!))) break;
      para.push(tt);
      i++;
    }
    out.push(<p key={out.length}>{inl(para.join(' '))}</p>);
  }
  return <>{out}</>;
}
