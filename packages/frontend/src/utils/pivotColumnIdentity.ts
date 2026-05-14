import { FieldType, type PivotData } from '@lightdash/common';

export type PivotPin = {
    reference: string;
    rawValue: unknown;
    formatted: string;
};

// Per data-column identity in a pivoted table. `metricFieldId` is the metric
// rendered in that column (undefined when `metricsAsRows: true` — no metric
// label row exists). `pivotValues` are the cumulative pivot pin values for
// the column (e.g. month=2024-11, region=US) in pivot-dimension order.
export type PivotColumnIdentity = {
    metricFieldId: string | undefined;
    pivotValues: PivotPin[];
};

// Index of the header row that carries metric labels (e.g. "Total order
// amount" on top of each value column). Returns -1 when there is no such row
// (i.e. metricsAsRows: true).
export const getMetricLabelHeaderRowIndex = (data: PivotData): number => {
    for (let i = data.headerValueTypes.length - 1; i >= 0; i -= 1) {
        if (data.headerValueTypes[i].type === FieldType.METRIC) return i;
    }
    return -1;
};

// Build per data-column identities by walking the header rows once. Each
// header-row cell maps 1:1 with a data column (merged cells carry the
// owner's payload with colSpan=0), so we index directly — a colSpan-cursor
// would double-count merged slots and shift values into the wrong group.
export const getPivotColumnIdentities = (
    data: PivotData,
): PivotColumnIdentity[] => {
    const dataColumnCount = data.dataColumnCount ?? 0;
    const metricLabelRowIndex = getMetricLabelHeaderRowIndex(data);
    const identities: PivotColumnIdentity[] = Array.from(
        { length: dataColumnCount },
        () => ({ metricFieldId: undefined, pivotValues: [] }),
    );

    for (let rowIdx = 0; rowIdx < data.headerValues.length; rowIdx += 1) {
        const headerRow = data.headerValues[rowIdx];
        const limit = Math.min(headerRow.length, dataColumnCount);
        for (let colIdx = 0; colIdx < limit; colIdx += 1) {
            const cell = headerRow[colIdx];
            if (cell.type === 'value') {
                const raw = cell.value?.raw;
                identities[colIdx].pivotValues.push({
                    reference: cell.fieldId,
                    rawValue: raw,
                    formatted:
                        cell.value?.formatted ??
                        (raw === undefined || raw === null ? '' : String(raw)),
                });
            } else if (
                cell.type === 'label' &&
                rowIdx === metricLabelRowIndex
            ) {
                identities[colIdx].metricFieldId = cell.fieldId;
            }
        }
    }
    return identities;
};
