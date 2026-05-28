'use client';

import ReactMarkdown from 'react-markdown';
import { MermaidDiagram } from './MermaidDiagram';

export function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="ai-md text-sm text-portal-text space-y-2">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-base font-semibold text-portal-text mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-portal-text mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium text-portal-text mt-1.5 mb-0.5">{children}</h3>,
          p: ({ children }) => <p className="mb-1.5 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 pl-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 pl-2">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-portal-accent hover:underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-portal-accent/40 pl-2 italic text-portal-muted my-1.5">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const lang = className?.match(/language-(\w+)/)?.[1];
            const codeText = String(children).replace(/\n$/, '');

            if (lang === 'mermaid') {
              return <MermaidDiagram code={codeText} />;
            }

            const isBlock = !!lang;
            if (isBlock) {
              return (
                <pre className="bg-portal-bg border border-portal-border rounded-md p-2.5 overflow-x-auto my-1.5">
                  <code className="text-xs text-portal-text font-mono">{codeText}</code>
                </pre>
              );
            }
            return (
              <code className="bg-portal-bg/60 border border-portal-border/60 px-1 py-0.5 rounded text-portal-accent text-[12px] font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-portal-border bg-portal-bg/50 px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-portal-border px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
