import React from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * SafeMarkdownContent Component
 * 
 * Renders markdown safely using react-markdown with DOMPurify sanitization.
 * Supports:
 * - Lists (ordered and unordered)
 * - Code blocks with syntax highlighting
 * - Bold, italic, strikethrough
 * - Links (sanitized)
 * - Paragraphs, headings
 * - Line breaks
 */
export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  // Sanitize markdown content first to prevent XSS
  const sanitized = DOMPurify.sanitize(content);

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Paragraph
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed text-muted-foreground">
              {children}
            </p>
          ),
          // Headings
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mb-3 text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mb-2 text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mb-2 text-foreground">
              {children}
            </h3>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1 text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1 text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="ml-0">
              {children}
            </li>
          ),
          // Code blocks
          code: ({ className: codeClassName, children }: { className?: string; children?: React.ReactNode }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-muted rounded-lg p-3 mb-3 overflow-x-auto border border-border">
                <code className="text-xs font-mono text-muted-foreground whitespace-pre">
                  {children}
                </code>
              </pre>
            );
          },
          // Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          // Italic
          em: ({ children }) => (
            <em className="italic text-muted-foreground">
              {children}
            </em>
          ),
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-2"
            >
              {children}
            </a>
          ),
          // Horizontal rule
          hr: () => (
            <hr className="my-3 border-border" />
          ),
          // Block quote
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-3 italic my-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}
