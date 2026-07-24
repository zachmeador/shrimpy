export function clipOneLine(text: string, maxChars: number): string {
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= maxChars
    ? oneLine
    : `${oneLine.slice(0, maxChars - 3)}...`;
}
