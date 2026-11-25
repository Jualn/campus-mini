/**
 * Keep an independently written title, but do not render a stored title and the
 * body twice when the title is only the body's opening summary.
 */
export function resolveContentTitle(
  title: string | null | undefined,
  content: string | null | undefined,
): string {
  const candidate = (title ?? '').trim();
  if (!candidate || candidate === '无标题') return '';
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
  const normalizedContent = normalize(content ?? '');
  const summaryStem = candidate.replace(/(?:\.\.\.|…)$/, '').trim();
  const normalizedTitle = normalize(summaryStem);
  return normalizedContent === normalizedTitle || normalizedContent.startsWith(normalizedTitle)
    ? ''
    : candidate;
}
