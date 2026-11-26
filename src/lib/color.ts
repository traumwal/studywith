const PALETTE = ['#e07a5f', '#3d8bd9', '#58a55c', '#e0a43a', '#9a6bd1', '#d1607f', '#3aa6a0', '#8a8f3c', '#c26d3a', '#6c7bd9'];

/** 分野名から決まった色を返す（同じ名前ならいつも同じ色） */
export function categoryColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length];
}
