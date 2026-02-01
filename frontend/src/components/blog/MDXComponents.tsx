import { ReactNode } from 'react';

interface ComponentProps {
  children?: ReactNode;
  href?: string;
  src?: string;
  alt?: string;
}

export const mdxComponents = {
  h1: ({ children }: ComponentProps) => (
    <h1 className="text-3xl font-bold text-white mt-8 mb-4">{children}</h1>
  ),
  h2: ({ children }: ComponentProps) => (
    <h2 className="text-2xl font-semibold text-white mt-8 mb-3">{children}</h2>
  ),
  h3: ({ children }: ComponentProps) => (
    <h3 className="text-xl font-semibold text-white mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }: ComponentProps) => (
    <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
  ),
  a: ({ href, children }: ComponentProps) => (
    <a
      href={href}
      className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  ul: ({ children }: ComponentProps) => (
    <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }: ComponentProps) => (
    <ol className="list-decimal list-inside text-slate-300 mb-4 space-y-1">{children}</ol>
  ),
  li: ({ children }: ComponentProps) => <li className="text-slate-300">{children}</li>,
  blockquote: ({ children }: ComponentProps) => (
    <blockquote className="border-l-4 border-amber-500 pl-4 italic text-slate-400 my-4">
      {children}
    </blockquote>
  ),
  code: ({ children }: ComponentProps) => (
    <code className="bg-slate-700 text-amber-300 px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  ),
  pre: ({ children }: ComponentProps) => (
    <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto mb-4">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-slate-700 my-8" />,
  table: ({ children }: ComponentProps) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: ComponentProps) => (
    <th className="border border-slate-700 bg-slate-800 px-4 py-2 text-left text-white font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: ComponentProps) => (
    <td className="border border-slate-700 px-4 py-2 text-slate-300">{children}</td>
  ),
};
