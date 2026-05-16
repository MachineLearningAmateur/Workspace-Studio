export interface ParsedCodeBlock {
  language: string;
  content: string;
  codeBlockIndex: number;
}

export function parseMarkdownCodeBlocks(markdown: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  const fencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let codeBlockIndex = 0;

  while ((match = fencePattern.exec(markdown)) !== null) {
    blocks.push({
      language: match[1].trim(),
      content: trimOneTrailingNewline(match[2]),
      codeBlockIndex
    });
    codeBlockIndex += 1;
  }

  return blocks;
}

function trimOneTrailingNewline(value: string) {
  return value.replace(/\n$/, "");
}
