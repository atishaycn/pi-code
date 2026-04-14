export interface ScrollSkipRow {
  id: string;
  top: number;
  bottom: number;
  kind: "work" | "message" | "proposed-plan";
}

export interface ScrollSkipTargetInput {
  rows: ReadonlyArray<ScrollSkipRow>;
  scrollTop: number;
  direction: "up" | "down";
}

function findTopVisibleRowIndex(rows: ReadonlyArray<ScrollSkipRow>, scrollTop: number): number {
  return rows.findIndex((row) => row.bottom > scrollTop + 1);
}

export function findWorkRowSkipScrollTop(input: ScrollSkipTargetInput): number | null {
  const currentIndex = findTopVisibleRowIndex(input.rows, input.scrollTop);
  if (currentIndex < 0) {
    return null;
  }

  if (input.direction === "down") {
    const currentRow = input.rows[currentIndex];
    if (!currentRow) return null;

    let workStartIndex = -1;
    if (currentRow.kind === "work") {
      workStartIndex = currentIndex;
    } else {
      const nextRow = input.rows[currentIndex + 1];
      if (nextRow?.kind === "work") {
        workStartIndex = currentIndex + 1;
      }
    }

    if (workStartIndex < 0) return null;

    let cursor = workStartIndex;
    while (input.rows[cursor]?.kind === "work") {
      cursor += 1;
    }
    const targetRow = input.rows[cursor];
    return targetRow ? targetRow.top : null;
  }

  const currentRow = input.rows[currentIndex];
  if (!currentRow) return null;

  let workEndIndex = -1;
  if (currentRow.kind === "work") {
    workEndIndex = currentIndex;
  } else {
    const previousRow = input.rows[currentIndex - 1];
    if (previousRow?.kind === "work") {
      workEndIndex = currentIndex - 1;
    }
  }

  if (workEndIndex < 0) return null;

  let cursor = workEndIndex;
  while (input.rows[cursor - 1]?.kind === "work") {
    cursor -= 1;
  }

  const targetRow = input.rows[cursor - 1];
  return targetRow ? targetRow.top : 0;
}
