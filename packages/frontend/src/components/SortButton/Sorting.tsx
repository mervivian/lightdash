import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    isField,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconGripVertical,
    IconMinus,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { forwardRef, useCallback, useState } from 'react';
import { type PivotColumnSortOption, type Props } from '.';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import { useColumns } from '../../hooks/useColumns';
import {
    matchesIdentity,
    serializeIdentity,
    type PivotSortIdentity,
} from '../../utils/pivotSortIdentity';
import MantineIcon from '../common/MantineIcon';
import { DraggablePortalHandler } from '../VisualizationConfigs/TreemapConfig/DraggablePortalHandler';
import SortItem from './SortItem';

// Encoding helpers for the Select option `value` — Select values are strings,
// so we serialize identity tuples and parse them back on change.
type IdentityWithItem = PivotSortIdentity & {
    item: Field | TableCalculation | CustomDimension;
    label: string;
};

const encodeOptionValue = (id: PivotSortIdentity): string => JSON.stringify(id);
const decodeOptionValue = (raw: string): PivotSortIdentity => {
    try {
        const parsed = JSON.parse(raw) as PivotSortIdentity;
        return parsed;
    } catch {
        return { fieldId: raw };
    }
};

const Sorting = forwardRef<HTMLDivElement, Props>(
    ({ sorts, isEditMode, pivotColumnSortOptions }) => {
        const columns = useColumns();
        const [isAddingSort, setIsAddingSort] = useState(false);
        // Cascading state for the pivot-aware Add Sort flow.
        //   pendingFieldId: column the user picked in step 1 (a metric with
        //     pivot pins available). Once set, the inline pin picker shows.
        //     Null when the chart isn't pivoted, or the user picked a column
        //     that can't be pinned — in those cases step 1 auto-adds.
        //   pendingPinKey: encoded identity of the pivot pin chosen in step 2.
        //     Empty string means "no pin" — sort applies to the metric across
        //     all pivot columns.
        const [pendingFieldId, setPendingFieldId] = useState<string | null>(
            null,
        );
        const [pendingPinKey, setPendingPinKey] = useState<string>('');
        const dispatch = useExplorerDispatch();

        const addSortField = useCallback(
            (
                identity: PivotSortIdentity,
                options?: { descending: boolean },
            ) => {
                const existingSort = sorts.find((s) =>
                    matchesIdentity(s, identity),
                );
                const newSort: SortField = {
                    fieldId: identity.fieldId,
                    descending: options?.descending ?? false,
                    ...(identity.pivotValues?.length && {
                        pivotValues: identity.pivotValues,
                    }),
                    // Preserve nullsFirst if it exists
                    ...(existingSort?.nullsFirst !== undefined && {
                        nullsFirst: existingSort.nullsFirst,
                    }),
                };

                if (existingSort) {
                    // Replace in place to preserve order
                    const newSorts = sorts.map((s) =>
                        matchesIdentity(s, identity) ? newSort : s,
                    );
                    dispatch(explorerActions.setSortFields(newSorts));
                } else {
                    // Add new sort at the end
                    dispatch(
                        explorerActions.setSortFields([...sorts, newSort]),
                    );
                }
            },
            [dispatch, sorts],
        );

        const removeSortField = useCallback(
            (identity: PivotSortIdentity) => {
                const newSorts = sorts.filter(
                    (s) => !matchesIdentity(s, identity),
                );
                dispatch(explorerActions.setSortFields(newSorts));
            },
            [dispatch, sorts],
        );

        const removeAllSortFields = useCallback(() => {
            dispatch(explorerActions.setSortFields([]));
        }, [dispatch]);

        const moveSortFields = useCallback(
            (sourceIndex: number, destinationIndex: number) => {
                const newSorts = [...sorts];
                const [removed] = newSorts.splice(sourceIndex, 1);
                newSorts.splice(destinationIndex, 0, removed);
                dispatch(explorerActions.setSortFields(newSorts));
            },
            [dispatch, sorts],
        );

        const setSortFieldNullsFirst = useCallback(
            (identity: PivotSortIdentity, nullsFirst: boolean | undefined) => {
                const newSorts = sorts.map((s) =>
                    matchesIdentity(s, identity) ? { ...s, nullsFirst } : s,
                );
                dispatch(explorerActions.setSortFields(newSorts));
            },
            [dispatch, sorts],
        );

        const onDragEnd = (result: DropResult) => {
            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;
            moveSortFields(result.source.index, result.destination.index);
        };

        // Regular (unpinned) options come from the metric query columns.
        const regularOptions: IdentityWithItem[] = columns
            .map((c) => {
                const item = c.meta?.item;
                if (!item || !c.id) return null;
                const label =
                    (isField(item) ? item.label || item.name : item.name) ||
                    c.id;
                return {
                    fieldId: c.id,
                    item,
                    label,
                };
            })
            .filter((c): c is IdentityWithItem => c !== null);

        // Pivot pins are grouped by metric so the picker can offer them as a
        // cascading step: pick the metric in step 1, then optionally pick a
        // pin from that metric's available columns in step 2. Flattening into
        // a single Select doesn't scale past a handful of pivot columns.
        const pinsByMetric = new Map<string, PivotColumnSortOption[]>();
        for (const opt of pivotColumnSortOptions ?? []) {
            const bucket = pinsByMetric.get(opt.fieldId);
            if (bucket) bucket.push(opt);
            else pinsByMetric.set(opt.fieldId, [opt]);
        }

        // Step 1 (column picker): regular columns, dropping any whose
        // *unpinned* identity already has a sort entry. Metrics that have
        // pivot pins available stay listed even if an unpinned sort exists,
        // so the user can add a pinned variant of an already-sorted metric.
        const step1Options = regularOptions
            .filter((opt) => {
                if (pinsByMetric.has(opt.fieldId)) return true;
                return !sorts.some((s) =>
                    matchesIdentity(s, { fieldId: opt.fieldId }),
                );
            })
            .map((opt) => ({ value: opt.fieldId, label: opt.label }));

        // Step 2 (pin picker): only shown when pendingFieldId is a metric
        // with pins available. Excludes pins already used for this metric.
        const pendingPins = pendingFieldId
            ? (pinsByMetric.get(pendingFieldId) ?? [])
            : [];
        const step2Options = pendingPins
            .filter(
                (p) =>
                    !sorts.some((s) =>
                        matchesIdentity(s, {
                            fieldId: p.fieldId,
                            pivotValues: p.pivotValues,
                        }),
                    ),
            )
            .map((p) => ({
                value: encodeOptionValue({
                    fieldId: p.fieldId,
                    pivotValues: p.pivotValues,
                }),
                label: p.label,
            }));

        // Whether the unpinned identity for the pending metric is still
        // available — used to decide if the "no pin" path is meaningful in
        // step 2. (When an unpinned sort already exists, picking "no pin"
        // would be a no-op replace.)
        const pendingUnpinnedTaken = pendingFieldId
            ? sorts.some((s) => matchesIdentity(s, { fieldId: pendingFieldId }))
            : false;

        const resetAddState = () => {
            setIsAddingSort(false);
            setPendingFieldId(null);
            setPendingPinKey('');
        };

        const handleStep1Change = (value: string | null) => {
            if (!value) return;
            // If this column is a metric with pivot pins, stage it and let
            // the user pick a pin in step 2. Otherwise add immediately —
            // preserves the snappy one-click flow for non-pivot cases.
            if (pinsByMetric.has(value)) {
                setPendingFieldId(value);
                setPendingPinKey('');
                return;
            }
            addSortField({ fieldId: value });
            resetAddState();
        };

        const handleConfirmAdd = () => {
            if (!pendingFieldId) return;
            const identity = pendingPinKey
                ? decodeOptionValue(pendingPinKey)
                : { fieldId: pendingFieldId };
            addSortField(identity);
            resetAddState();
        };

        const hasAddableSomething =
            step1Options.length > 0 || pinsByMetric.size > 0;

        return (
            <>
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="results-table-sort-fields">
                        {(provided) => (
                            <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                            >
                                {sorts.map((sort, index) => {
                                    const identity: PivotSortIdentity = {
                                        fieldId: sort.fieldId,
                                        pivotValues: sort.pivotValues,
                                    };
                                    const key = serializeIdentity(identity);
                                    return (
                                        <Draggable
                                            key={key}
                                            isDragDisabled={!isEditMode}
                                            draggableId={key}
                                            index={index}
                                        >
                                            {(
                                                {
                                                    draggableProps,
                                                    dragHandleProps,
                                                    innerRef,
                                                },
                                                snapshot,
                                            ) => (
                                                <DraggablePortalHandler
                                                    snapshot={snapshot}
                                                >
                                                    <SortItem
                                                        isEditMode={isEditMode}
                                                        ref={innerRef}
                                                        isFirstItem={
                                                            index === 0
                                                        }
                                                        isOnlyItem={
                                                            sorts.length === 1
                                                        }
                                                        isDragging={
                                                            snapshot.isDragging
                                                        }
                                                        draggableProps={
                                                            draggableProps
                                                        }
                                                        dragHandleProps={
                                                            dragHandleProps
                                                        }
                                                        sort={sort}
                                                        column={columns.find(
                                                            (c) =>
                                                                c.id ===
                                                                sort.fieldId,
                                                        )}
                                                        onAddSortField={(
                                                            opts,
                                                        ) => {
                                                            addSortField(
                                                                identity,
                                                                opts,
                                                            );
                                                        }}
                                                        onRemoveSortField={() => {
                                                            removeSortField(
                                                                identity,
                                                            );
                                                        }}
                                                        onSetSortFieldNullsFirst={(
                                                            payload,
                                                        ) => {
                                                            setSortFieldNullsFirst(
                                                                identity,
                                                                payload,
                                                            );
                                                        }}
                                                    />
                                                </DraggablePortalHandler>
                                            )}
                                        </Draggable>
                                    );
                                })}

                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>

                {/*
                Add sort UI. Two layouts:
                  - Single Select (status quo): non-pivot charts or columns
                    that can't be pinned. Picking auto-adds.
                  - Cascading (column → pin): pivot charts when the picked
                    column is a metric with pins. User explicitly confirms.
            */}
                {isEditMode && hasAddableSomething && (
                    <>
                        {!isAddingSort ? (
                            <Group gap="xs">
                                <Button
                                    variant="light"
                                    color="gray"
                                    size="compact-xs"
                                    onClick={() => setIsAddingSort(true)}
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                >
                                    Add sort
                                </Button>
                                {sorts.length > 0 && (
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        size="compact-xs"
                                        onClick={removeAllSortFields}
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                    >
                                        Clear all
                                    </Button>
                                )}
                            </Group>
                        ) : (
                            <Stack gap="xs" pl="xs" pr="xxs" py="two">
                                <Group wrap="nowrap" gap="sm">
                                    {sorts.length > 0 && (
                                        <MantineIcon
                                            color="ldGray.5"
                                            opacity={0.9}
                                            icon={IconGripVertical}
                                            style={{ cursor: 'grab' }}
                                        />
                                    )}
                                    <Text fz="xs">then by</Text>
                                    <Select
                                        placeholder="Column"
                                        size="xs"
                                        searchable
                                        data={step1Options}
                                        value={pendingFieldId}
                                        onChange={handleStep1Change}
                                        flex={1}
                                        // Render the dropdown inline so its
                                        // clicks count as inside the parent
                                        // SortButton Popover — otherwise
                                        // Mantine's outside-click handler
                                        // closes the popover the moment the
                                        // user picks an option, killing the
                                        // cascading flow.
                                        comboboxProps={{ withinPortal: false }}
                                    />
                                    <Tooltip label="Cancel">
                                        <ActionIcon
                                            size="xs"
                                            variant="subtle"
                                            color="ldGray.6"
                                            onClick={resetAddState}
                                        >
                                            <MantineIcon icon={IconMinus} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                                {pendingFieldId &&
                                    pinsByMetric.has(pendingFieldId) && (
                                        <Group wrap="nowrap" gap="sm" pl="xl">
                                            <Text fz="xs">pin to</Text>
                                            <Select
                                                placeholder={
                                                    step2Options.length > 0
                                                        ? 'Pivot column (optional)'
                                                        : 'No pins available'
                                                }
                                                size="xs"
                                                searchable
                                                clearable
                                                data={step2Options}
                                                value={pendingPinKey || null}
                                                onChange={(v) =>
                                                    setPendingPinKey(v ?? '')
                                                }
                                                disabled={
                                                    step2Options.length === 0
                                                }
                                                flex={1}
                                                comboboxProps={{
                                                    withinPortal: false,
                                                }}
                                            />
                                            <Button
                                                size="compact-xs"
                                                onClick={handleConfirmAdd}
                                                disabled={
                                                    !pendingPinKey &&
                                                    pendingUnpinnedTaken
                                                }
                                            >
                                                Add
                                            </Button>
                                        </Group>
                                    )}
                            </Stack>
                        )}
                    </>
                )}
            </>
        );
    },
);

export default Sorting;
