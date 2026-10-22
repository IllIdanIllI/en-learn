import { useEffect, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { findSection } from './ruleSection';

const heading = 'mt-6 font-serif text-[1.0625rem] font-semibold leading-snug first:mt-0';

/** Rule headings sit one level below the panel or page title; tables use the shadcn Table with 1px cell borders. */
const components: Components = {
  h1: ({ children }) => <h3 className={heading}>{children}</h3>,
  h2: ({ children }) => <h3 className={heading}>{children}</h3>,
  h3: ({ children }) => <h4 className={heading}>{children}</h4>,
  p: ({ children }) => <p className="reading mt-2">{children}</p>,
  ul: ({ children }) => <ul className="reading mt-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="reading mt-2 list-decimal pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{children}</a>
  ),
  // The app makes no network calls of its own: a rule cannot pull in remote images.
  img: () => null,
  code: ({ children }) => <code className="answer rounded-sm bg-input px-1">{children}</code>,
  table: ({ children }) => <div className="mt-3"><Table className="border border-border">{children}</Table></div>,
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableHead className="border border-border">{children}</TableHead>,
  td: ({ children }) => <TableCell className="border border-border">{children}</TableCell>,
};

/**
 * A rule body (Markdown with GFM tables) in Reading style. With `section`, the matching heading is scrolled into view
 * once rendered. Shared by the rule panel, the rule draft preview and the Rules page.
 */
export function RuleBody({ body, section, className }: { body: string; section?: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!section) return;
    const headings = [...(root.current?.querySelectorAll('h3') ?? [])];
    headings[findSection(headings.map((h) => h.textContent ?? ''), section)]?.scrollIntoView({ block: 'start' });
  }, [body, section]);
  return (
    <div ref={root} className={cn('min-w-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{body}</ReactMarkdown>
    </div>
  );
}
