import { isField, type SortField } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    getMetricLabelHeaderRowIndex,
    getPivotColumnIdentities,
} from '../../../utils/pivotColumnIdentity';
import { normalizePivotValues } from '../../../utils/pivotSortIdentity';
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
        // metricsAsRows: true keeps metrics on the row axis, so there's no
        // metric-label column header to pin against. Out of scope for now.
        if (getMetricLabelHeaderRowIndex(data) < 0) return undefined;

        const identities = getPivotColumnIdentities(data);
        const options: PivotColumnSortOption[] = [];
        for (const identity of identities) {
            if (!identity.metricFieldId) continue;
            const item = itemsMap?.[identity.metricFieldId];
            if (!item) continue;

            const metricLabel = isField(item)
                ? item.label || item.name
                : item.name;
            const labelSegments = identity.pivotValues.map((p) => {
                const dim = itemsMap?.[p.reference];
                const dimLabel =
                    dim && isField(dim) ? dim.label || dim.name : p.reference;
                return `${dimLabel}=${p.formatted}`;
            });
            const label = identity.pivotValues.length
                ? `${metricLabel} @ ${labelSegments.join(', ')}`
                : metricLabel;

            options.push({
                fieldId: identity.metricFieldId,
                pivotValues: normalizePivotValues(
                    identity.pivotValues.map((p) => ({
                        reference: p.reference,
                        value: p.rawValue,
                    })),
                ),
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
