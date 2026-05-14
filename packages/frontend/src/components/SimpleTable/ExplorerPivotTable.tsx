import { FieldType, type SortField } from '@lightdash/common';
import { useCallback, useMemo, type ComponentProps, type FC } from 'react';
import {
    explorerActions,
    selectIsEditMode,
    selectMetrics,
    selectSorts,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import {
    matchesIdentity,
    normalizePivotValues,
} from '../../utils/pivotSortIdentity';
import { getSortDirectionOrder, SortDirection } from '../../utils/sortUtils';
import PivotTable, { type PivotSortClickTarget } from '../common/PivotTable';

type ExplorerPivotTableProps = Omit<
    ComponentProps<typeof PivotTable>,
    'sortBy' | 'onHeaderSortClick'
>;

type SortTarget = {
    kind: 'valueColumn' | 'indexDim' | 'groupBy';
    fieldId: string;
    pivotValues?: NonNullable<SortField['pivotValues']>;
};

const ExplorerPivotTable: FC<ExplorerPivotTableProps> = ({
    getFieldLabel,
    getField,
    data,
    ...rest
}) => {
    const dispatch = useExplorerDispatch();
    const sorts = useExplorerSelector(selectSorts);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const metrics = useExplorerSelector(selectMetrics);

    // Sort axes:
    //   valueColumn — metric or pinned: drives row order
    //   groupBy     — pivot dimension: drives column order (independent)
    //   indexDim    — row dimension / table calc: composes with other indexDims
    const metricSet = useMemo(() => new Set(metrics), [metrics]);
    const groupByRefs = useMemo(() => {
        const refs = new Set<string>();
        for (const t of data.headerValueTypes) {
            if (t.type === FieldType.DIMENSION) refs.add(t.fieldId);
        }
        return refs;
    }, [data.headerValueTypes]);

    const classifySort = useCallback(
        (s: SortField): 'valueColumn' | 'groupBy' | 'indexDim' => {
            if (metricSet.has(s.fieldId) || (s.pivotValues?.length ?? 0) > 0) {
                return 'valueColumn';
            }
            if (groupByRefs.has(s.fieldId)) return 'groupBy';
            return 'indexDim';
        },
        [groupByRefs, metricSet],
    );

    const targetFromClick = useCallback(
        (target: PivotSortClickTarget): SortTarget => {
            if (target.kind === 'pivotColumn') {
                return {
                    kind: 'valueColumn',
                    fieldId: target.metricReference,
                    pivotValues: normalizePivotValues(target.pivotValues),
                };
            }
            if (target.kind === 'indexDim') {
                return { kind: 'indexDim', fieldId: target.reference };
            }
            return { kind: 'groupBy', fieldId: target.reference };
        },
        [],
    );

    const handleHeaderSortClick = useCallback(
        (click: PivotSortClickTarget) => {
            const target = targetFromClick(click);
            const item = getField?.(target.fieldId);
            if (!item) return;
            const defaultDirection = getSortDirectionOrder(item)[0];
            const existing = sorts.find((s) => matchesIdentity(s, target));

            // Cycle on the same identity: add → flip → remove.
            if (existing) {
                const wasDefault =
                    (existing.descending
                        ? SortDirection.DESC
                        : SortDirection.ASC) === defaultDirection;
                if (wasDefault) {
                    dispatch(
                        explorerActions.setSortFields(
                            sorts.map((s) =>
                                matchesIdentity(s, target)
                                    ? { ...s, descending: !s.descending }
                                    : s,
                            ),
                        ),
                    );
                } else {
                    dispatch(
                        explorerActions.setSortFields(
                            sorts.filter((s) => !matchesIdentity(s, target)),
                        ),
                    );
                }
                return;
            }

            const next: SortField = {
                fieldId: target.fieldId,
                descending: defaultDirection === SortDirection.DESC,
                pivotValues: target.pivotValues?.length
                    ? target.pivotValues
                    : undefined,
            };

            const filtered = sorts.filter((s) => {
                const kind = classifySort(s);
                if (target.kind === 'valueColumn') {
                    // Compose with same-metric valueColumns; replace different-metric.
                    if (kind === 'valueColumn') {
                        return s.fieldId === target.fieldId;
                    }
                    return kind === 'groupBy';
                }
                if (target.kind === 'indexDim') {
                    return (
                        kind === 'groupBy' ||
                        (kind === 'indexDim' && !matchesIdentity(s, target))
                    );
                }
                return kind !== 'groupBy' || !matchesIdentity(s, target);
            });

            dispatch(explorerActions.setSortFields([...filtered, next]));
        },
        [classifySort, dispatch, getField, sorts, targetFromClick],
    );

    return (
        <PivotTable
            {...rest}
            data={data}
            getFieldLabel={getFieldLabel}
            getField={getField}
            sortBy={sorts}
            onHeaderSortClick={isEditMode ? handleHeaderSortClick : undefined}
        />
    );
};

export default ExplorerPivotTable;
