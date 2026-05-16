import { Children, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    "*": [...((defaultSchema.attributes?.["*"] as Array<string | [string, ...string[]]>) ?? []), "className", "style"],
    a: [...((defaultSchema.attributes?.a as Array<string | [string, ...string[]]>) ?? []), "href", "title", "target", "rel"],
    img: [...((defaultSchema.attributes?.img as Array<string | [string, ...string[]]>) ?? []), "src", "alt", "title", "width", "height", "style"],
    input: [["type", "checkbox"], "checked", "disabled"]
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "img", "input", "section", "article", "span", "div"]
} as const;

interface MarkdownContentProps {
  content: string;
  onVisualizeCodeBlock?: (input: { language: string; code: string; codeBlockIndex: number }) => void;
}

export function MarkdownContent({ content, onVisualizeCodeBlock }: MarkdownContentProps) {
  let codeBlockIndex = 0;
  const normalizedContent = normalizeMarkdownContent(content);

  return (
    <div className="markdown-content">
      <ReactMarkdown
        rehypePlugins={[[rehypeRaw], [rehypeSanitize, markdownSchema]]}
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            return (
              <a href={href} rel="noreferrer" target="_blank" {...props}>
                {children}
              </a>
            );
          },
          pre({ children }) {
            const child = Children.only(children);

            if (!isValidElement(child)) {
              return <pre className="markdown-code-block">{children}</pre>;
            }

            const codeProps = child.props as { className?: string; children?: React.ReactNode };
            const languageMatch = /language-([\w-]+)/.exec(codeProps.className ?? "");
            const language = languageMatch?.[1] ?? "";
            const code = Children.toArray(codeProps.children).join("").replace(/\n$/, "");
            const currentCodeBlockIndex = codeBlockIndex;
            codeBlockIndex += 1;

            return (
              <pre className="markdown-code-block">
                <span className="markdown-code-header">
                  {language ? <span className="markdown-code-language">{language}</span> : <span />}
                  {onVisualizeCodeBlock && isVisualizableLanguage(language) ? (
                    <button
                      className="ghost-button markdown-code-action"
                      type="button"
                      onClick={() =>
                        onVisualizeCodeBlock({
                          language,
                          code,
                          codeBlockIndex: currentCodeBlockIndex
                        })
                      }
                    >
                      Visualize
                    </button>
                  ) : null}
                </span>
                <code>{code}</code>
              </pre>
            );
          },
          code({ className, children, ...props }) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img({ src, alt, ...props }) {
            return <img alt={alt ?? ""} className="markdown-image" loading="lazy" src={src ?? ""} {...props} />;
          }
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

function isVisualizableLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  return normalized === "python" || normalized === "py";
}

function normalizeMarkdownContent(content: string) {
  const segments = content.replace(/\r\n/g, "\n").split(/(```[\s\S]*?```)/g);

  return segments
    .map((segment) => {
      if (segment.startsWith("```")) {
        return segment;
      }

      return segment
        .split("\n")
        .map((line) => normalizeIndentedLine(line))
        .join("\n");
    })
    .join("");
}

function normalizeIndentedLine(line: string) {
  if (!line.startsWith("    ")) {
    return line;
  }

  const trimmed = line.trimStart();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("- ") ||
    trimmed.startsWith("* ") ||
    trimmed.startsWith("+ ") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("|") ||
    /^\d+[.)]\s/.test(trimmed)
  ) {
    return line;
  }

  return line.slice(4);
}
