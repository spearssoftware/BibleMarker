/** "1 chapter a day" or "About 3.1 chapters a day". */
export function chaptersPerDayLabel(chapterCount: number, days: number): string {
  if (chapterCount === days) return '1 chapter a day';
  const perDay = Math.round((chapterCount / days) * 10) / 10;
  return `About ${perDay} ${perDay === 1 ? 'chapter' : 'chapters'} a day`;
}
