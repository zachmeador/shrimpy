/**
 * Cells as lines of padded columns, two spaces apart, the header first. The last
 * column is not padded, so a long cell there does not push anything out.
 */
export function renderTable(header: string[], rows: string[][]): string[] {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();
  return [line(header), ...rows.map(line)];
}
