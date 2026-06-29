import type { LexicalNode, TableCellNode, TableNode, TableRowNode } from '../types.js'

/**
 * A table cell normalized for rendering. The `tag` is derived from the
 * Lexical `headerState` bitmask: any non-zero state makes the cell a header.
 *
 * This mirrors Payload's own HTML converter, which renders
 * `headerState > 0 ? 'th' : 'td'` per cell and emits `colspan`/`rowspan`
 * only when greater than 1.
 * @see https://github.com/payloadcms/payload/blob/main/packages/richtext-lexical/src/features/converters/lexicalToHtml/shared/converters/table.ts
 */
export type RenderCell = {
  tag: 'th' | 'td'
  colSpan?: number
  rowSpan?: number
  children: LexicalNode[]
}

export type RenderRow = {
  cells: RenderCell[]
}

export type TableModel = {
  /** Leading rows in which every cell is a header. Rendered inside `<thead>`. */
  headRows: RenderRow[]
  /** Remaining rows. Rendered inside `<tbody>`. */
  bodyRows: RenderRow[]
}

/** A cell is a header when its `headerState` bitmask is non-zero. */
export function isHeaderCell(cell: TableCellNode): boolean {
  return (cell.headerState ?? 0) > 0
}

/** A row is a header row when it has cells and every cell is a header. */
export function isHeaderRow(row: TableRowNode): boolean {
  const cells = row.children ?? []
  return cells.length > 0 && cells.every(isHeaderCell)
}

function toRenderCell(cell: TableCellNode): RenderCell {
  const renderCell: RenderCell = {
    tag: isHeaderCell(cell) ? 'th' : 'td',
    children: cell.children ?? [],
  }

  if (cell.colSpan && cell.colSpan > 1) {
    renderCell.colSpan = cell.colSpan
  }
  if (cell.rowSpan && cell.rowSpan > 1) {
    renderCell.rowSpan = cell.rowSpan
  }

  return renderCell
}

function toRenderRow(row: TableRowNode): RenderRow {
  return { cells: (row.children ?? []).map(toRenderCell) }
}

/**
 * Normalizes a Lexical `table` node into head/body rows with per-cell
 * `th`/`td` tags derived from each cell's `headerState`.
 *
 * Header detection is per-cell (not by row index): the original
 * implementation always rendered the first row as `<th>` and every other row
 * as `<td>`, which produced wrong output for tables without a header row, with
 * row headers, or with a non-header first row.
 *
 * Leading rows whose cells are all headers are grouped into `<thead>`; all
 * remaining rows go into `<tbody>`. A header cell that appears outside a full
 * header row (e.g. a left-column row header) still renders as `<th>` within
 * the body.
 */
export function buildTableModel(node: TableNode): TableModel {
  const rows = node.children ?? []

  let headCount = 0
  while (headCount < rows.length && isHeaderRow(rows[headCount])) {
    headCount++
  }

  return {
    headRows: rows.slice(0, headCount).map(toRenderRow),
    bodyRows: rows.slice(headCount).map(toRenderRow),
  }
}
