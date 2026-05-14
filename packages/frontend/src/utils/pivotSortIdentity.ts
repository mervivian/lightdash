import { type SortField } from '@lightdash/common';

export type PivotSortIdentity = {
    fieldId: string;
    pivotValues?: SortField['pivotValues'];
};

const pivotValuesEqual = (
    a: SortField['pivotValues'],
    b: SortField['pivotValues'],
): boolean => {
    const left = a ?? [];
    const right = b ?? [];
    if (left.length !== right.length) return false;
    const lookup = new Map(left.map((p) => [p.reference, p.value]));
    return right.every(
        (p) => lookup.has(p.reference) && lookup.get(p.reference) === p.value,
    );
};

// Two sort entries target the same "axis" when they share the same fieldId
// AND identify the same pivot pin (both unpinned, or matching pivotValues).
export const matchesIdentity = (
    candidate: SortField,
    target: PivotSortIdentity,
): boolean =>
    candidate.fieldId === target.fieldId &&
    pivotValuesEqual(candidate.pivotValues, target.pivotValues);

// Stable string key for React lists / Draggable IDs. Two entries with the
// same fieldId but different pivotValues produce different keys.
export const serializeIdentity = (identity: PivotSortIdentity): string => {
    if (!identity.pivotValues?.length) return identity.fieldId;
    const pinKey = identity.pivotValues
        .map((pv) => `${pv.reference}=${String(pv.value)}`)
        .join('|');
    return `${identity.fieldId}::${pinKey}`;
};
