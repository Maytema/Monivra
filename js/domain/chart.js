/* What the category donut draws: the narrow slices are gathered into one, so every slice can be tapped */

// The id of the gathered slice.
export const OTHER_SLICE = "other";
// A slice under this share of the circle is too narrow for a finger.
const NARROW_SHARE = 0.04;
// The biggest categories always keep a slice of their own.
const KEPT_APART = 6;

// `groups` are the category totals, the biggest first. A category with nothing in the period has no
// slice. Two or more narrow ones become one slice ("Other") that lists them in `members`; a single
// narrow one stays as it is.
export function donutSlices(all) {
  const groups = all.filter((g) => g.total > 0);
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  const narrow = groups.filter((g, i) => i >= KEPT_APART && g.total / total < NARROW_SHARE);
  if (narrow.length < 2) return groups;
  const other = {
    id: OTHER_SLICE,
    name: "Other",
    color: "#9b9bab",
    total: narrow.reduce((sum, g) => sum + g.total, 0),
    members: narrow,
  };
  return [...groups.filter((g) => !narrow.includes(g)), other];
}
