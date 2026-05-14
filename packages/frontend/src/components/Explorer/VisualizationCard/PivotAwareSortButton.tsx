import { FieldType, isField, type SortField } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import SortButton, { type PivotColumnSortOption } from '../../SortButton';

type Props = {
    sorts: SortField[];
    isEditMode: boolean;
};

// Wrapper around SortButton that, when the chart is a pivot table, enriches
// the Add Sort Select with one option per (metric, pivotValues) pair currently
// rendered in the pivot. Plain SortButton is preserved for non-pivoted charts
// and other consumers (e.g. ResultsCard) — they pass no pivotColumnSortOptions
// and get the original behavior unchanged.
const PivotAwareSortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const pivotColumnSortOptions = useMemo<
        PivotColumnSortOption[] | undefined
    >(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) return undefined;
        const data = visualizationConfig.chartConfig.pivotTableData?.data;
        if (!data) return undefined;

        const metricLabelRowIdx = data.headerValueTypes.findIndex(
            (t) => t.type === FieldType.METRIC,
        );
        // metricsAsRows: true keeps metrics on the row axis, so there's no
        // metric-label column header to pin against. Out of scope for now.
        if (metricLabelRowIdx < 0) return undefined;

        const labelRow = data.headerValues[metricLabelRowIdx];
        if (!labelRow) return undefined;

        const dataColumnCount = data.dataColumnCount ?? 0;
        if (dataColumnCount === 0) return undefined;

        // Cumulative pivot values per data column. Each header row's cells
        // map 1:1 with data columns (merged cells carry colSpan=0); read by
        // index — mirrors the fix in PivotTable so click-time and popover
        // identities resolve to the same column.
        const pivotsByCol: Array<
            Array<{ reference: string; rawValue: unknown; formatted: string }>
        > = Array.from({ length: dataColumnCount }, () => []);

        for (const headerRow of data.headerValues) {
            const limit = Math.min(headerRow.length, dataColumnCount);
            for (let col = 0; col < limit; col += 1) {
                const cell = headerRow[col];
                if (cell.type === 'value') {
                    const raw = cell.value?.raw;
                    pivotsByCol[col].push({
                        reference: cell.fieldId,
                        rawValue: raw,
                        formatted:
                            cell.value?.formatted ??
                            (raw === undefined || raw === null
                                ? ''
                                : String(raw)),
                    });
                }
            }
        }

        const options: PivotColumnSortOption[] = [];
        const labelLimit = Math.min(labelRow.length, dataColumnCount);
        for (let col = 0; col < labelLimit; col += 1) {
            const cell = labelRow[col];
            if (cell.type !== 'label') continue;
            const metricId = cell.fieldId;
            const item = itemsMap?.[metricId];
            if (!item) continue;

            const metricLabel = isField(item)
                ? item.label || item.name
                : item.name;

            const pins = pivotsByCol[col];
            const labelSegments = pins.map((p) => {
                const dimField = itemsMap?.[p.reference];
                const dimLabel =
                    dimField && isField(dimField)
                        ? dimField.label || dimField.name
                        : p.reference;
                return `${dimLabel}=${p.formatted}`;
            });
            const label = pins.length
                ? `${metricLabel} @ ${labelSegments.join(', ')}`
                : metricLabel;

            // Match the normalization used at click-time in ExplorerPivotTable
            // so identities compare equal against persisted sorts.
            const pivotValues = pins.map((p) => ({
                reference: p.reference,
                value:
                    p.rawValue === null ||
                    typeof p.rawValue === 'number' ||
                    typeof p.rawValue === 'string'
                        ? (p.rawValue as string | number | null)
                        : String(p.rawValue),
            }));

            options.push({
                fieldId: metricId,
                pivotValues,
                label,
                item,
            });
        }

        return options.length > 0 ? options : undefined;
    }, [visualizationConfig, itemsMap]);

    return (
        <SortButton
            sorts={sorts}
            isEditMode={isEditMode}
            pivotColumnSortOptions={pivotColumnSortOptions}
        />
    );
};

export default PivotAwareSortButton;
