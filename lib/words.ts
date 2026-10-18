/** Word count the way an applicant sees it in a word-limited answer box. */
export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Cut text to at most `max` words, ending on the last full sentence that fits when there is one. */
export function trimToWords(text: string, max: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  const cut = words.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.endsWith(".") ? cut.length - 1 : -1);
  return end > cut.length / 2 ? cut.slice(0, end + 1) : `${cut.replace(/[,;:]$/, "")}.`;
}
