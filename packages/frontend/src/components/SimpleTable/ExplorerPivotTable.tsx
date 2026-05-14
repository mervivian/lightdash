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

type PivotValuesPin = { reference: string; value: unknown }[];

const pivotValuesEqual = (
    a: SortField['pivotValues'],
    b: PivotValuesPin,
): boolean => {
    if (!a || a.length !== b.length) return false;
    const lookup = new Map(a.map((p) => [p.reference, p.value]));
    return b.every(
        (p) => lookup.has(p.reference) && lookup.get(p.reference) === p.value,
    );
};

// Predicate matching the sort entry that targets the same "axis" the user
// clicked on. An axis is identified by (fieldId, presence-and-shape of
// pivotValues). Two pivot-column clicks on the same metric but different
// pinned values target different axes.
const matchesAxis = (
    candidate: SortField,
    target: { fieldId: string; pivotValues?: PivotValuesPin },
): boolean => {
    if (candidate.fieldId !== target.fieldId) return false;
    const candidatePin = candidate.pivotValues ?? [];
    const targetPin = target.pivotValues ?? [];
    if (candidatePin.length === 0 && targetPin.length === 0) return true;
    return pivotValuesEqual(candidate.pivotValues, targetPin);
};

const normalizePivotValues = (pin: PivotValuesPin) =>
    pin.map((pv) => ({
        reference: pv.reference,
        value:
            pv.value === null ||
            typeof pv.value === 'number' ||
            typeof pv.value === 'string'
                ? (pv.value as string | number | null)
                : String(pv.value),
    }));

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

    // Classify each sort entry by axis. Determines what gets dropped when a
    // new sort is added.
    //   valueColumn: sort whose fieldId is a metric, OR has pivotValues set
    //                (the pivot "values" axis)
    //   groupBy:     sort whose fieldId matches a pivot column dimension
    //   indexDim:    everything else (row dimensions, table calcs)
    // valueColumn and indexDim both drive ROW order — they replace each
    // other on add. groupBy drives COLUMN order and is independent.
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

    // Replace the entry matching this axis, applying axis-mutual-exclusion
    // rules.
    //   Add valueColumn: drop every valueColumn sort + every index-dim sort
    //                    (row axis collapses to a single value-column sort).
    //   Add indexDim:    drop any valueColumn sort, keep other index-dim
    //                    sorts so they compose as primary/secondary row keys.
    //   Add groupBy:     drop only the groupBy entry with the same fieldId.
    // Multi-sort management for power users still happens in the SortButton
    // popover above the chart.
    const upsertSort = useCallback(
        (
            target: {
                kind: 'valueColumn' | 'indexDim' | 'groupBy';
                fieldId: string;
                pivotValues?: PivotValuesPin;
            },
            direction: SortDirection,
        ) => {
            const next: SortField = {
                fieldId: target.fieldId,
                descending: direction === SortDirection.DESC,
                pivotValues: target.pivotValues?.length
                    ? normalizePivotValues(target.pivotValues)
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
                        (kind === 'indexDim' && !matchesAxis(s, target))
                    );
                }
                // target.kind === 'groupBy'
                return kind !== 'groupBy' || !matchesAxis(s, target);
            });

            dispatch(explorerActions.setSortFields([...filtered, next]));
        },
        [classifySort, dispatch, sorts],
    );

    const removeSort = useCallback(
        (target: { fieldId: string; pivotValues?: PivotValuesPin }) => {
            dispatch(
                explorerActions.setSortFields(
                    sorts.filter((s) => !matchesAxis(s, target)),
                ),
            );
        },
        [dispatch, sorts],
    );

    const removeAllSorts = useCallback(() => {
        dispatch(explorerActions.setSortFields([]));
    }, [dispatch]);

    const targetIdentity = useCallback(
        (
            target: PivotSortMenuTarget,
        ): {
            kind: 'valueColumn' | 'indexDim' | 'groupBy';
            fieldId: string;
            pivotValues?: PivotValuesPin;
        } | null => {
            if (target.kind === 'pivotColumn') {
                return {
                    kind: 'valueColumn',
                    fieldId: target.metricReference,
                    pivotValues: target.pivotValues,
                };
            }
            if (target.kind === 'indexDim') {
                return { kind: 'indexDim', fieldId: target.reference };
            }
            // target.kind === 'groupByDim'
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
            const existing = sorts.find((s) => matchesAxis(s, identity));
            const currentDirection = existing
                ? existing.descending
                    ? SortDirection.DESC
                    : SortDirection.ASC
                : undefined;

            // Match the visual + behavior of ColumnHeaderSortMenuOptions in
            // the regular results table: direction order and labels come from
            // sortUtils so "Sort 1-9" / "Sort Old-New" / "Sort True-False"
            // render correctly per field type.
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
            // Sort UI is frozen in view mode — sort indicators still render
            // (so users can see what's active) but clicking a header doesn't
            // do anything. Matches the regular results table's view-mode
            // behavior. The SortButton popover above is also gated on
            // isEditMode so the lock is consistent across surfaces.
            renderSortMenu={isEditMode ? renderSortMenu : undefined}
        />
    );
};

export default ExplorerPivotTable;
