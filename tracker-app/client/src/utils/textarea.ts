import type { KeyboardEvent } from "react";

export function insertTabInTextarea(event: KeyboardEvent<HTMLTextAreaElement>, onValueChange: (value: string) => void) {
  if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  event.preventDefault();

  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${textarea.value.slice(0, start)}\t${textarea.value.slice(end)}`;

  onValueChange(nextValue);

  window.requestAnimationFrame(() => {
    textarea.selectionStart = start + 1;
    textarea.selectionEnd = start + 1;
  });
}
