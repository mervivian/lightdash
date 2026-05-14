import { type SortField } from '@lightdash/common';

export type PivotSortIdentity = {
    fieldId: string;
    pivotValues?: SortField['pivotValues'];
};

// Narrow `unknown` warehouse values to `SortField['pivotValues']` element type.
export const normalizePivotValues = (
    pin: { reference: string; value: unknown }[],
): NonNullable<SortField['pivotValues']> =>
    pin.map((pv) => ({
        reference: pv.reference,
        value:
            pv.value === null ||
            typeof pv.value === 'number' ||
            typeof pv.value === 'string'
                ? (pv.value as string | number | null)
                : String(pv.value),
    }));

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

/** Same fieldId + same pin (both unpinned counts as equal). */
export const matchesIdentity = (
    candidate: SortField,
    target: PivotSortIdentity,
): boolean =>
    candidate.fieldId === target.fieldId &&
    pivotValuesEqual(candidate.pivotValues, target.pivotValues);

/** Stable string key for React lists / Draggable IDs. */
export const serializeIdentity = (identity: PivotSortIdentity): string => {
    if (!identity.pivotValues?.length) return identity.fieldId;
    const pinKey = identity.pivotValues
        .map((pv) => `${pv.reference}=${String(pv.value)}`)
        .join('|');
    return `${identity.fieldId}::${pinKey}`;
};
