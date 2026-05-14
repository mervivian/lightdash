import { FieldType, type SortField } from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
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
import {
    getSortDirectionOrder,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import PivotTable, { type PivotSortMenuTarget } from '../common/PivotTable';

type ExplorerPivotTableProps = Omit<
    ComponentProps<typeof PivotTable>,
    'sortBy' | 'renderSortMenu'
>;

// Pivot values normalized at the boundary in `targetIdentity`.
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
    //   valueColumn — metric or pinned: drives row order (replaces indexDim)
    //   groupBy     — pivot dimension: drives column order (independent)
    //   indexDim    — row dimension / table calc: composes with other indexDims
    const metricSet = useMemo(() => new Set(metrics), [metrics]);
    const groupByRefs = useMemo(() => {
        const refs = new Set<string>();
        for (const t of data.headerValueTypes) {
            if (t.type === FieldType.DIMENSION) {
                refs.add(t.fieldId);
            }
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

    // Add valueColumn → drop all row-axis sorts (valueColumn + indexDim).
    // Add indexDim    → drop valueColumn, keep other indexDims (composable).
    // Add groupBy     → drop only the same-fieldId groupBy.
    // Power users compose multi-key sorts via the SortButton popover.
    const upsertSort = useCallback(
        (target: SortTarget, direction: SortDirection) => {
            const next: SortField = {
                fieldId: target.fieldId,
                descending: direction === SortDirection.DESC,
                pivotValues: target.pivotValues?.length
                    ? target.pivotValues
                    : undefined,
            };

            const filtered = sorts.filter((s) => {
                const kind = classifySort(s);
                if (target.kind === 'valueColumn') {
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
        [classifySort, dispatch, sorts],
    );

    const removeSort = useCallback(
        (target: SortTarget) => {
            dispatch(
                explorerActions.setSortFields(
                    sorts.filter((s) => !matchesIdentity(s, target)),
                ),
            );
        },
        [dispatch, sorts],
    );

    const removeAllSorts = useCallback(() => {
        dispatch(explorerActions.setSortFields([]));
    }, [dispatch]);

    const targetIdentity = useCallback(
        (target: PivotSortMenuTarget): SortTarget | null => {
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

    const renderSortMenu = useCallback(
        (target: PivotSortMenuTarget) => {
            const identity = targetIdentity(target);
            if (!identity) {
                return (
                    <Menu.Label>Add a metric to sort by this column</Menu.Label>
                );
            }
            const item = getField?.(identity.fieldId);
            if (!item) {
                return <Menu.Label>Sort target is not in the chart</Menu.Label>;
            }
            const existing = sorts.find((s) => matchesIdentity(s, identity));
            const currentDirection = existing
                ? existing.descending
                    ? SortDirection.DESC
                    : SortDirection.ASC
                : undefined;

            return (
                <>
                    <Menu.Label>Sorting</Menu.Label>
                    {getSortDirectionOrder(item).map((sortDirection) => {
                        const isActive = currentDirection === sortDirection;
                        return (
                            <Menu.Item
                                key={sortDirection}
                                icon={
                                    isActive ? (
                                        <MantineIcon icon={IconCheck} />
                                    ) : undefined
                                }
                                disabled={isActive}
                                onClick={() =>
                                    upsertSort(identity, sortDirection)
                                }
                            >
                                Sort{' '}
                                <Text span fz="inherit" lh="inherit" fw={700}>
                                    {getSortLabel(item, sortDirection)}
                                </Text>
                            </Menu.Item>
                        );
                    })}
                    {(existing || sorts.length > 0) && <Menu.Divider />}
                    {existing && (
                        <Menu.Item
                            color="red"
                            onClick={() => removeSort(identity)}
                        >
                            Remove sort
                        </Menu.Item>
                    )}
                    {sorts.length > 1 && (
                        <Menu.Item color="red" onClick={removeAllSorts}>
                            Clear all sorts
                        </Menu.Item>
                    )}
                </>
            );
        },
        [
            getField,
            removeAllSorts,
            removeSort,
            sorts,
            targetIdentity,
            upsertSort,
        ],
    );

    return (
        <PivotTable
            {...rest}
            data={data}
            getFieldLabel={getFieldLabel}
            getField={getField}
            sortBy={sorts}
            // View mode: indicators render, clicks are no-ops.
            renderSortMenu={isEditMode ? renderSortMenu : undefined}
        />
    );
};

export default ExplorerPivotTable;
