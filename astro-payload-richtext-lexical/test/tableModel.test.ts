import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTableModel, isHeaderCell, isHeaderRow } from '../src/nodes/tableModel.ts'
import type { RenderCell } from '../src/nodes/tableModel.ts'
import type { TableCellNode, TableNode, TableRowNode } from '../src/types.ts'

/** Builds a tablecell node with a paragraph/text child for readable assertions. */
function cell(text: string, headerState = 0, extra: Partial<TableCellNode> = {}): TableCellNode {
  return {
    type: 'tablecell',
    version: 1,
    headerState,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', version: 1, text }],
      },
    ],
    ...extra,
  }
}

function row(...cells: TableCellNode[]): TableRowNode {
  return { type: 'tablerow', version: 1, children: cells }
}

function table(...rows: TableRowNode[]): TableNode {
  return { type: 'table', version: 1, children: rows }
}

/** Flattens a row's cells to `tag:text` strings for compact assertions. */
function tags(cells: RenderCell[]): string[] {
  return cells.map((c) => {
    const text = c.children[0]?.children?.[0]?.text
    return `${c.tag}:${typeof text === 'string' ? text : ''}`
  })
}

test('isHeaderCell: non-zero headerState is a header', () => {
  assert.equal(isHeaderCell(cell('a', 0)), false)
  assert.equal(isHeaderCell(cell('a', 1)), true) // ROW
  assert.equal(isHeaderCell(cell('a', 2)), true) // COLUMN
  assert.equal(isHeaderCell(cell('a', 3)), true) // BOTH
})

test('isHeaderCell: missing headerState defaults to non-header', () => {
  assert.equal(isHeaderCell({ type: 'tablecell', version: 1 }), false)
})

test('isHeaderRow: all cells must be headers, and the row must be non-empty', () => {
  assert.equal(isHeaderRow(row(cell('a', 1), cell('b', 1))), true)
  assert.equal(isHeaderRow(row(cell('a', 1), cell('b', 0))), false)
  assert.equal(isHeaderRow(row()), false)
})

test('standard table: first row all-header goes to thead as th, body cells are td', () => {
  const model = buildTableModel(
    table(
      row(cell('Feature', 1), cell('Status', 1)),
      row(cell('Bold', 0), cell('Done', 0)),
      row(cell('Italic', 0), cell('Done', 0)),
    ),
  )

  assert.equal(model.headRows.length, 1)
  assert.deepEqual(tags(model.headRows[0].cells), ['th:Feature', 'th:Status'])
  assert.equal(model.bodyRows.length, 2)
  assert.deepEqual(tags(model.bodyRows[0].cells), ['td:Bold', 'td:Done'])
  assert.deepEqual(tags(model.bodyRows[1].cells), ['td:Italic', 'td:Done'])
})

test('regression: table with no header row renders every cell as td (was forced th before)', () => {
  const model = buildTableModel(
    table(row(cell('a', 0), cell('b', 0)), row(cell('c', 0), cell('d', 0))),
  )

  assert.equal(model.headRows.length, 0)
  assert.equal(model.bodyRows.length, 2)
  assert.deepEqual(tags(model.bodyRows[0].cells), ['td:a', 'td:b'])
  assert.deepEqual(tags(model.bodyRows[1].cells), ['td:c', 'td:d'])
})

test('row headers: a header cell outside a full header row still renders as th in the body', () => {
  // First column is a header (ROW state), but the first row is NOT all headers,
  // so there is no <thead> and the header cells live inside <tbody>.
  const model = buildTableModel(
    table(row(cell('Mon', 1), cell('9:00', 0)), row(cell('Tue', 1), cell('10:00', 0))),
  )

  assert.equal(model.headRows.length, 0)
  assert.equal(model.bodyRows.length, 2)
  assert.deepEqual(tags(model.bodyRows[0].cells), ['th:Mon', 'td:9:00'])
  assert.deepEqual(tags(model.bodyRows[1].cells), ['th:Tue', 'td:10:00'])
})

test('header row plus header column: thead for the top row, th left-column in the body', () => {
  const model = buildTableModel(
    table(
      row(cell('', 3), cell('Q1', 1), cell('Q2', 1)),
      row(cell('Sales', 2), cell('10', 0), cell('20', 0)),
    ),
  )

  assert.deepEqual(tags(model.headRows[0].cells), ['th:', 'th:Q1', 'th:Q2'])
  assert.deepEqual(tags(model.bodyRows[0].cells), ['th:Sales', 'td:10', 'td:20'])
})

test('multiple leading header rows are all grouped into thead', () => {
  const model = buildTableModel(
    table(
      row(cell('Group A', 1), cell('Group B', 1)),
      row(cell('Sub 1', 1), cell('Sub 2', 1)),
      row(cell('x', 0), cell('y', 0)),
    ),
  )

  assert.equal(model.headRows.length, 2)
  assert.equal(model.bodyRows.length, 1)
  assert.deepEqual(tags(model.bodyRows[0].cells), ['td:x', 'td:y'])
})

test('colSpan and rowSpan are only set when greater than 1', () => {
  const model = buildTableModel(
    table(
      row(
        cell('a', 0, { colSpan: 2, rowSpan: 3 }),
        cell('b', 0, { colSpan: 1, rowSpan: 1 }),
        cell('c', 0),
      ),
    ),
  )

  const [spanned, ones, none] = model.bodyRows[0].cells
  assert.equal(spanned.colSpan, 2)
  assert.equal(spanned.rowSpan, 3)
  assert.equal(ones.colSpan, undefined)
  assert.equal(ones.rowSpan, undefined)
  assert.equal(none.colSpan, undefined)
  assert.equal(none.rowSpan, undefined)
})

test('empty table produces no rows', () => {
  const model = buildTableModel(table())
  assert.deepEqual(model.headRows, [])
  assert.deepEqual(model.bodyRows, [])
})

test('table with undefined children is handled gracefully', () => {
  const model = buildTableModel({ type: 'table', version: 1 })
  assert.deepEqual(model.headRows, [])
  assert.deepEqual(model.bodyRows, [])
})

test('cell with missing children renders an empty cell', () => {
  const model = buildTableModel(table(row({ type: 'tablecell', version: 1, headerState: 0 })))
  assert.deepEqual(model.bodyRows[0].cells[0].children, [])
})
