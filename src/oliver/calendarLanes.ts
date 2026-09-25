// calendarLanes — side-by-side placement for overlapping blocks on a day.
//
// Two jobs at 10:15 used to be drawn on top of each other, so the one
// underneath could not be clicked (Brandon, W-OB-05: "I can't click the … job
// to open"). Overlapping blocks now share the column: each gets a lane and the
// number of lanes in its overlap group, and is drawn at width 1/lanes.
// Pure — used by the Schedule day view and the Job Board week view.

export interface Laned<T> {
  item: T;
  /** 0-based lane within its overlap group. */
  lane: number;
  /** Lanes in its overlap group (>= 1). */
  lanes: number;
}

export function layoutLanes<T>(items: T[], range: (t: T) => { start: number; end: number }): Laned<T>[] {
  const sorted = items
    .map((item) => {
      const r = range(item);
      // A block with no end (or a bad one) still takes some room.
      const end = Number.isFinite(r.end) && r.end > r.start ? r.end : r.start + 30 * 60000;
      return { item, start: r.start, end };
    })
    .filter((x) => Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Laned<T>[] = [];
  let group: { idx: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const g of group) out[g.idx].lanes = lanes;
    group = [];
    laneEnds = [];
  };

  for (const x of sorted) {
    if (x.start >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= x.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(x.end);
    } else {
      laneEnds[lane] = x.end;
    }
    out.push({ item: x.item, lane, lanes: 1 });
    group.push({ idx: out.length - 1, lane });
    groupEnd = Math.max(groupEnd, x.end);
  }
  closeGroup();
  return out;
}
