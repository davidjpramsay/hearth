import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Background,
  ConnectionLineType,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  getLayoutSetAuthoringValidationIssues,
  getPhotoRouterTimeGateNodeValidationIssues,
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  LOCAL_WARNING_CONDITION_TYPE,
  PHOTO_COLLECTION_ACTION_PARAM_KEY,
  formatPhotoRouterTimeGateWindow,
  getPrimaryPhotoRouterBlock,
  setPrimaryPhotoRouterBlock,
  toPhotoRouterConnectionId,
  type LayoutSetAuthoring,
  type PhotoRouterBlock,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
  type PhotoRouterTimeGate,
  type PhotoRouterTimeGateNode,
} from "@hearth/shared";
import type { RuntimeHealthReport } from "../../pages/layout-set-runtime-health";
import {
  LOGIC_ACTION_TYPES,
  LOGIC_CONDITION_TYPES,
  getActionTypeById,
  getCanvasActionTypeById,
  getConditionTypeById,
  getDefaultActionParams,
  getDefaultCanvasActionTypeId,
  getDefaultConditionTypeForTrigger,
  parseActionParamsByType,
  parseConditionParamsByType,
} from "./logicNodeRegistry";
import {
  CanvasControlButton,
  edgeTypes,
  FitViewIcon,
  GRAPH_SELECT_INPUT_CLASS,
  GRAPH_TEXT_INPUT_CLASS,
  LockIcon,
  nodeTypes,
  ParamFieldEditor,
} from "./set-logic-editor/components";
import {
  buildFlowGraph,
  clampCycleSeconds,
  createActionNodeId,
  createStepId,
  createTimeGateWindowId,
  getActionNodeKind,
  getAvailableConditionTypes,
  getConditionBranchCopy,
  getConnectableSourceHandles,
  getDefaultRouterNodeTitle,
  getGraphNodeById,
  getGraphNodeSize,
  getNextLayoutInsertPosition,
  getNextRouterInsertPosition,
  getNextTimeGateWindow,
  getNormalizedConditionTypeForNodeKind,
  getTimeGateRouteMeta,
  isLayoutGraphNode,
  isPhotoOrientationNode,
  isTimeGateNode,
  omitNodePositions,
  resolveInsertPosition,
  roundPosition,
  wouldCreateGraphCycle,
} from "./set-logic-editor/graph";
import { graphEditorReducer } from "./set-logic-editor/reducer";
import {
  type ActionNodeKind,
  type ConditionalTrigger,
  EDGE_DASH_PATTERN,
  END_NODE_ID,
  GRAPH_NODE_DRAG_TYPE,
  type LayoutOption,
  type PhotoCollectionOption,
  START_NODE_ID,
} from "./set-logic-editor/shared";

interface SetLogicEditorProps {
  authoring: LayoutSetAuthoring;
  layoutOptions: LayoutOption[];
  photoCollectionOptions: PhotoCollectionOption[];
  runtimeHealth?: RuntimeHealthReport;
  onChange: (nextAuthoring: LayoutSetAuthoring) => void | Promise<void>;
}

export const SetLogicEditor = ({
  authoring,
  layoutOptions,
  photoCollectionOptions,
  runtimeHealth,
  onChange,
}: SetLogicEditorProps) => {
  const block = useMemo(() => getPrimaryPhotoRouterBlock(authoring), [authoring]);
  const latestAuthoringRef = useRef(authoring);
  const latestBlockRef = useRef(block);
  const selectedNodeIdRef = useRef<string | null>(null);
  const [state, dispatch] = useReducer(graphEditorReducer, {
    block,
    selectedNodeId: null,
    editorError: null,
    isCanvasInteractive: true,
    draftNodePositions: {},
  });
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(
    null,
  );
  const hasPerformedInitialFitRef = useRef(false);
  const draftBlock = state.block;
  const selectedNodeId = state.selectedNodeId;
  const editorError = state.editorError;
  const isCanvasInteractive = state.isCanvasInteractive;
  const effectiveBlock = useMemo(
    () => ({
      ...draftBlock,
      nodePositions: {
        ...draftBlock.nodePositions,
        ...state.draftNodePositions,
      },
    }),
    [draftBlock, state.draftNodePositions],
  );

  useEffect(() => {
    latestAuthoringRef.current = authoring;
    latestBlockRef.current = block;
    dispatch({
      type: "sync-from-props",
      block,
    });
  }, [authoring, block]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    latestBlockRef.current = draftBlock;
  }, [draftBlock, selectedNodeId]);

  const updateBlock = useCallback(
    (updater: (current: PhotoRouterBlock) => PhotoRouterBlock) => {
      const currentAuthoring = latestAuthoringRef.current;
      const currentBlock = latestBlockRef.current;
      try {
        const nextBlock = updater(currentBlock);
        const nextAuthoring = setPrimaryPhotoRouterBlock({
          authoring: currentAuthoring,
          block: nextBlock,
        });
        const validationIssue = getLayoutSetAuthoringValidationIssues(nextAuthoring)[0] ?? null;
        if (validationIssue) {
          dispatch({
            type: "set-editor-error",
            message: validationIssue.message,
          });
          return;
        }

        latestAuthoringRef.current = nextAuthoring;
        const normalizedNextBlock = getPrimaryPhotoRouterBlock(nextAuthoring);
        latestBlockRef.current = normalizedNextBlock;
        dispatch({
          type: "set-block",
          block: normalizedNextBlock,
        });
        dispatch({
          type: "set-editor-error",
          message: null,
        });
        void Promise.resolve(onChange(nextAuthoring)).catch((error) => {
          latestAuthoringRef.current = currentAuthoring;
          latestBlockRef.current = currentBlock;
          dispatch({
            type: "set-block",
            block: currentBlock,
          });
          dispatch({
            type: "set-editor-error",
            message: error instanceof Error ? error.message : "Unable to apply this graph edit.",
          });
        });
      } catch (error) {
        dispatch({
          type: "set-editor-error",
          message: error instanceof Error ? error.message : "Unable to apply this graph edit.",
        });
      }
    },
    [onChange],
  );

  const addLayoutNodeAtPosition = useCallback(
    (position?: { x: number; y: number }) => {
      const fallbackLayoutName =
        layoutOptions[0]?.name ??
        draftBlock.nodes.find((node): node is PhotoRouterLayoutNode => isLayoutGraphNode(node))
          ?.layoutName ??
        "";

      if (!fallbackLayoutName) {
        return;
      }

      const nextLayoutNode: PhotoRouterLayoutNode = {
        id: createStepId(),
        nodeType: "layout",
        layoutName: fallbackLayoutName,
        cycleSeconds: 20,
        actionType: LOGIC_ACTION_TYPES[0]?.id ?? "layout.display",
        actionParams: getDefaultActionParams(LOGIC_ACTION_TYPES[0]?.id),
      };

      const nextPosition = resolveInsertPosition({
        block: draftBlock,
        desiredPosition: position ?? getNextLayoutInsertPosition(draftBlock),
        nodeSize: getGraphNodeSize(nextLayoutNode),
      });

      dispatch({
        type: "select-node",
        nodeId: nextLayoutNode.id,
      });
      updateBlock((current) => ({
        ...current,
        nodes: [...current.nodes, nextLayoutNode],
        nodePositions: {
          ...current.nodePositions,
          [nextLayoutNode.id]: {
            x: roundPosition(nextPosition.x),
            y: roundPosition(nextPosition.y),
          },
        },
      }));
    },
    [draftBlock, layoutOptions, updateBlock],
  );

  const addActionNodeAtPosition = useCallback(
    (kind: ActionNodeKind, position?: { x: number; y: number }) => {
      const existingActionCount = draftBlock.nodes.filter(
        (node) => isPhotoOrientationNode(node) && getActionNodeKind(node.photoActionType) === kind,
      ).length;
      const nextConditionType =
        kind === "warning"
          ? LOCAL_WARNING_CONDITION_TYPE
          : getDefaultConditionTypeForTrigger("portrait-photo");
      const nextActionNode: PhotoRouterPhotoOrientationNode = {
        id: createActionNodeId(),
        nodeType: "photo-orientation",
        title: getDefaultRouterNodeTitle(kind, existingActionCount),
        photoActionType:
          kind === "warning" ? LOCAL_WARNING_CANVAS_ACTION_TYPE : getDefaultCanvasActionTypeId(),
        photoActionCollectionId: null,
        portrait: {
          enabled: true,
          conditionType: nextConditionType,
          conditionParams: parseConditionParamsByType(nextConditionType, {}),
        },
        landscape: {
          enabled: false,
          conditionType: "photo.orientation.landscape",
          conditionParams: {},
        },
      };

      const nextPosition = resolveInsertPosition({
        block: draftBlock,
        desiredPosition: position ?? getNextRouterInsertPosition(draftBlock),
        nodeSize: getGraphNodeSize(nextActionNode),
      });

      dispatch({
        type: "select-node",
        nodeId: nextActionNode.id,
      });
      updateBlock((current) => ({
        ...current,
        nodes: [...current.nodes, nextActionNode],
        nodePositions: {
          ...current.nodePositions,
          [nextActionNode.id]: {
            x: roundPosition(nextPosition.x),
            y: roundPosition(nextPosition.y),
          },
        },
      }));
    },
    [draftBlock, updateBlock],
  );

  const addTimeGateNodeAtPosition = useCallback(
    (position?: { x: number; y: number }) => {
      const existingTimeGateCount = draftBlock.nodes.filter((node) => isTimeGateNode(node)).length;
      const initialGate =
        getNextTimeGateWindow(
          draftBlock.nodes
            .filter((node): node is PhotoRouterTimeGateNode => isTimeGateNode(node))
            .flatMap((node) => node.gates),
        ) ??
        ({
          id: createTimeGateWindowId(),
          startTime: "09:00",
          endTime: "10:00",
        } satisfies PhotoRouterTimeGate);
      const nextTimeGateNode: PhotoRouterTimeGateNode = {
        id: createActionNodeId(),
        nodeType: "time-gate",
        title: getDefaultRouterNodeTitle("time", existingTimeGateCount),
        gates: [initialGate],
      };

      const nextPosition = resolveInsertPosition({
        block: draftBlock,
        desiredPosition: position ?? getNextRouterInsertPosition(draftBlock),
        nodeSize: getGraphNodeSize(nextTimeGateNode),
      });

      dispatch({
        type: "select-node",
        nodeId: nextTimeGateNode.id,
      });
      updateBlock((current) => ({
        ...current,
        nodes: [...current.nodes, nextTimeGateNode],
        nodePositions: {
          ...current.nodePositions,
          [nextTimeGateNode.id]: {
            x: roundPosition(nextPosition.x),
            y: roundPosition(nextPosition.y),
          },
        },
      }));
    },
    [draftBlock, updateBlock],
  );

  const handleNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      const deletedNodeIds = new Set(
        deletedNodes
          .map((node) => node.id)
          .filter((nodeId) => nodeId !== START_NODE_ID && nodeId !== END_NODE_ID),
      );
      if (deletedNodeIds.size === 0) {
        return;
      }

      dispatch({
        type: "select-node",
        nodeId: null,
      });
      updateBlock((current) => {
        const remainingNodes = current.nodes.filter((node) => !deletedNodeIds.has(node.id));
        const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));

        return {
          ...current,
          nodes: remainingNodes,
          layoutNodes: current.layoutNodes.filter((step) => remainingNodeIds.has(step.id)),
          connections: current.connections.filter(
            (connection) =>
              !deletedNodeIds.has(connection.source) && !deletedNodeIds.has(connection.target),
          ),
          nodePositions: omitNodePositions(current.nodePositions, deletedNodeIds),
          fallback: {
            ...current.fallback,
            steps: current.fallback.steps.filter((step) => remainingNodeIds.has(step.id)),
          },
          portrait: {
            ...current.portrait,
            steps: current.portrait.steps.filter((step) => remainingNodeIds.has(step.id)),
          },
          landscape: {
            ...current.landscape,
            steps: current.landscape.steps.filter((step) => remainingNodeIds.has(step.id)),
          },
        };
      });
    },
    [updateBlock],
  );

  const removeNodeById = useCallback(
    (nodeId: string) => {
      if (nodeId === START_NODE_ID || nodeId === END_NODE_ID) {
        return;
      }

      handleNodesDelete([
        {
          id: nodeId,
          position: draftBlock.nodePositions[nodeId] ?? {
            x: 0,
            y: 0,
          },
          data: {},
        } as Node,
      ]);
    },
    [draftBlock.nodePositions, handleNodesDelete],
  );

  const graph = useMemo(
    () =>
      buildFlowGraph({
        block: effectiveBlock,
        selectedNodeId,
        photoCollectionOptions,
        onRemoveNode: removeNodeById,
        onSelectNode: (nodeId) =>
          dispatch({
            type: "select-node",
            nodeId,
          }),
        isCanvasInteractive,
      }),
    [effectiveBlock, isCanvasInteractive, photoCollectionOptions, removeNodeById, selectedNodeId],
  );

  useEffect(() => {
    if (!reactFlowInstance || hasPerformedInitialFitRef.current) {
      return;
    }

    hasPerformedInitialFitRef.current = true;
    requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        padding: 0.2,
        duration: 180,
      });
    });
  }, [reactFlowInstance]);

  const isValidConnection = (candidate: Edge | Connection): boolean => {
    const currentBlock = latestBlockRef.current;
    const source = candidate.source?.trim();
    const target = candidate.target?.trim();
    if (!source || !target || source === target) {
      return false;
    }
    if (source === END_NODE_ID || target === START_NODE_ID) {
      return false;
    }
    if (target !== END_NODE_ID && !currentBlock.nodes.some((node) => node.id === target)) {
      return false;
    }

    if (source === START_NODE_ID) {
      return target !== END_NODE_ID;
    }

    const sourceNode = getGraphNodeById(currentBlock, source);
    if (!sourceNode) {
      return false;
    }

    if (isLayoutGraphNode(sourceNode)) {
      return !wouldCreateGraphCycle(currentBlock, source, target);
    }

    return (
      getConnectableSourceHandles(sourceNode).includes(candidate.sourceHandle?.trim() ?? "") &&
      !wouldCreateGraphCycle(currentBlock, source, target)
    );
  };

  const handleConnect = (connection: Connection) => {
    if (!isValidConnection(connection)) {
      return;
    }

    updateBlock((current) => {
      const source = connection.source!.trim();
      const target = connection.target!.trim();
      const sourceNode = getGraphNodeById(current, source);
      const sourceHandle =
        source === START_NODE_ID
          ? null
          : sourceNode && isLayoutGraphNode(sourceNode)
            ? "next"
            : (connection.sourceHandle?.trim() ?? null);
      if (source !== START_NODE_ID && !sourceHandle) {
        return current;
      }

      return {
        ...current,
        connections: [
          ...current.connections.filter(
            (entry) =>
              !(entry.source === source && (entry.sourceHandle?.trim() || null) === sourceHandle),
          ),
          {
            id: toPhotoRouterConnectionId({
              source,
              sourceHandle,
              target,
            }),
            source,
            sourceHandle,
            target,
          },
        ],
      };
    });
  };

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!isCanvasInteractive) {
      return;
    }
    const positionUpdates = Object.fromEntries(
      changes
        .filter(
          (
            change,
          ): change is NodeChange & { type: "position"; position: { x: number; y: number } } =>
            change.type === "position" &&
            change.position !== undefined &&
            change.id !== START_NODE_ID &&
            change.id !== END_NODE_ID,
        )
        .map((change) => [change.id, change.position]),
    );

    if (Object.keys(positionUpdates).length === 0) {
      return;
    }
    dispatch({
      type: "merge-draft-node-positions",
      positions: positionUpdates,
    });
  };

  const handleEdgesChange = (_changes: EdgeChange[]) => {};

  const handleNodeDragStop = (_event: unknown, node: Node) => {
    if (!isCanvasInteractive) {
      return;
    }
    dispatch({
      type: "clear-draft-node-positions",
      nodeIds: [node.id],
    });
    updateBlock((current) => ({
      ...current,
      nodePositions: {
        ...current.nodePositions,
        [node.id]: {
          x: roundPosition(node.position.x),
          y: roundPosition(node.position.y),
        },
      },
    }));
  };

  const handleEdgesDelete = (deletedEdges: Edge[]) => {
    const deletedEdgeIds = new Set(deletedEdges.map((edge) => edge.id));
    if (deletedEdgeIds.size === 0) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      connections: current.connections.filter((connection) => !deletedEdgeIds.has(connection.id)),
    }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance || !isCanvasInteractive) {
      return;
    }

    const blockType = event.dataTransfer.getData(GRAPH_NODE_DRAG_TYPE);
    if (
      blockType !== "layout-node" &&
      blockType !== "photo-node" &&
      blockType !== "warning-node" &&
      blockType !== "time-node"
    ) {
      return;
    }

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (blockType === "photo-node") {
      addActionNodeAtPosition("photo", position);
      return;
    }

    if (blockType === "warning-node") {
      addActionNodeAtPosition("warning", position);
      return;
    }

    if (blockType === "time-node") {
      addTimeGateNodeAtPosition(position);
      return;
    }

    if (layoutOptions.length === 0) {
      return;
    }

    addLayoutNodeAtPosition(position);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = isCanvasInteractive ? "copy" : "none";
  };

  const selectedLayoutNode = selectedNodeId
    ? (draftBlock.nodes.find(
        (node): node is PhotoRouterLayoutNode =>
          node.id === selectedNodeId && isLayoutGraphNode(node),
      ) ?? null)
    : null;
  const selectedActionNode = selectedNodeId
    ? (draftBlock.nodes.find(
        (node): node is PhotoRouterPhotoOrientationNode =>
          node.id === selectedNodeId && isPhotoOrientationNode(node),
      ) ?? null)
    : null;
  const selectedTimeGateNode = selectedNodeId
    ? (draftBlock.nodes.find(
        (node): node is PhotoRouterTimeGateNode =>
          node.id === selectedNodeId && isTimeGateNode(node),
      ) ?? null)
    : null;
  const selectedActionKind = selectedActionNode
    ? getActionNodeKind(selectedActionNode.photoActionType)
    : null;
  const selectedCanvasAction = getCanvasActionTypeById(
    selectedActionNode?.photoActionType || getDefaultCanvasActionTypeId(),
  );
  const selectedActionUsesPhotoSource = selectedActionKind === "photo";
  const selectedTimeGateIssues = selectedTimeGateNode
    ? getPhotoRouterTimeGateNodeValidationIssues(selectedTimeGateNode)
    : [];
  const nextAvailableTimeGateWindow = selectedTimeGateNode
    ? getNextTimeGateWindow(selectedTimeGateNode.gates)
    : null;
  const runtimeStatusMeta = useMemo(() => {
    if (!runtimeHealth) {
      return null;
    }

    const summaryLines =
      runtimeHealth.issues.length === 0
        ? ["No issues found. Runtime path resolves for current set logic."]
        : runtimeHealth.issues.map((issue) => issue.message);
    const pathLines = runtimeHealth.paths.map((path) => `${path.label}: ${path.summary}`);

    return {
      icon: runtimeHealth.status === "ok" ? "✓" : "!",
      className:
        runtimeHealth.status === "ok"
          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
          : "border-amber-400/60 bg-amber-500/15 text-amber-100",
      title: [
        runtimeHealth.status === "ok" ? "Runtime healthy" : "Runtime warnings found",
        "Checks use the same logic the display runtime executes.",
        ...summaryLines,
        ...pathLines,
      ].join("\n"),
    };
  }, [runtimeHealth]);

  const updateSelectedLayoutNode = (
    updater: (current: PhotoRouterLayoutNode) => PhotoRouterLayoutNode,
  ) => {
    const targetNodeId = selectedNodeIdRef.current;
    if (!targetNodeId) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === targetNodeId && isLayoutGraphNode(node) ? updater(node) : node,
      ),
    }));
  };

  const updateSelectedActionNode = (
    updater: (current: PhotoRouterPhotoOrientationNode) => PhotoRouterPhotoOrientationNode,
  ) => {
    const targetNodeId = selectedNodeIdRef.current;
    if (!targetNodeId) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === targetNodeId && isPhotoOrientationNode(node) ? updater(node) : node,
      ),
    }));
  };

  const updateSelectedTimeGateNode = (
    updater: (current: PhotoRouterTimeGateNode) => PhotoRouterTimeGateNode,
  ) => {
    const targetNodeId = selectedNodeIdRef.current;
    if (!targetNodeId) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === targetNodeId && isTimeGateNode(node) ? updater(node) : node,
      ),
    }));
  };

  useEffect(() => {
    let hasChanges = false;

    for (const node of draftBlock.nodes) {
      if (!isPhotoOrientationNode(node)) {
        continue;
      }
      const nextConditionType = getNormalizedConditionTypeForNodeKind(
        getActionNodeKind(node.photoActionType),
        "portrait-photo",
        node.portrait.conditionType,
      );
      if ((node.portrait.conditionType?.trim() ?? "") !== (nextConditionType ?? "")) {
        hasChanges = true;
        break;
      }
    }

    if (!hasChanges) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (!isPhotoOrientationNode(node)) {
          return node;
        }
        const nextConditionType = getNormalizedConditionTypeForNodeKind(
          getActionNodeKind(node.photoActionType),
          "portrait-photo",
          node.portrait.conditionType,
        );
        if ((node.portrait.conditionType?.trim() ?? "") === (nextConditionType ?? "")) {
          return node;
        }
        return {
          ...node,
          portrait: {
            ...node.portrait,
            conditionType: nextConditionType,
            conditionParams: parseConditionParamsByType(
              nextConditionType,
              node.portrait.conditionParams,
            ),
          },
        };
      }),
    }));
  }, [draftBlock.nodes, updateBlock]);

  const renderConditionalSettings = (
    actionKind: ActionNodeKind,
    trigger: ConditionalTrigger,
    branch: PhotoRouterPhotoOrientationNode["portrait"],
    updateBranch: (
      updater: (
        current: PhotoRouterPhotoOrientationNode["portrait"],
      ) => PhotoRouterPhotoOrientationNode["portrait"],
    ) => void,
  ) => {
    const availableConditionTypes = getAvailableConditionTypes(actionKind, trigger);
    const normalizedConditionType = getNormalizedConditionTypeForNodeKind(
      actionKind,
      trigger,
      branch.conditionType,
    );
    const conditionDefinition = getConditionTypeById(normalizedConditionType);
    const conditionParams = parseConditionParamsByType(
      normalizedConditionType,
      branch.conditionParams,
    );
    const conditionBranchCopy = getConditionBranchCopy(normalizedConditionType);
    const autoWarningLayout = actionKind === "warning";

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">{conditionBranchCopy.title}</p>
          <p className="mt-1 text-xs text-slate-400">
            {autoWarningLayout
              ? "When active, this node shows the automatic warning layout. Connect No Warning to continue the normal flow."
              : "Connect this output to the first layout node when the condition matches."}
          </p>
        </div>

        {actionKind === "warning" ? (
          <div className="mt-4">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Condition
            </span>
            <div className="flex h-10 items-center rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100">
              {conditionDefinition?.label ?? "Local warning is active"}
            </div>
          </div>
        ) : (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Condition
            </span>
            <select
              className={GRAPH_SELECT_INPUT_CLASS}
              value={normalizedConditionType ?? ""}
              onChange={(event) =>
                updateBranch((current) => ({
                  ...current,
                  enabled: true,
                  conditionType: event.target.value,
                  conditionParams: parseConditionParamsByType(event.target.value, {}),
                }))
              }
            >
              {availableConditionTypes.map((condition) => (
                <option key={condition.id} value={condition.id}>
                  {condition.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="mt-2 text-xs text-slate-400">
          {conditionDefinition?.description ??
            "Select which condition must match before this route runs."}
        </p>

        {conditionDefinition?.paramFields?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {conditionDefinition.paramFields.map((field) => (
              <ParamFieldEditor
                key={field.key}
                field={field}
                params={conditionParams}
                onPatch={(patch) =>
                  updateBranch((current) => ({
                    ...current,
                    conditionType: normalizedConditionType,
                    conditionParams: parseConditionParamsByType(normalizedConditionType, {
                      ...parseConditionParamsByType(
                        normalizedConditionType,
                        current.conditionParams,
                      ),
                      ...patch,
                    }),
                  }))
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Palette
            </p>
            <p className="mt-1 text-xs text-slate-500">Drag a node to canvas.</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Layout Nodes
            </p>
            <button
              type="button"
              draggable={layoutOptions.length > 0}
              disabled={layoutOptions.length === 0}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-3 py-3 text-left text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "layout-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addLayoutNodeAtPosition()}
            >
              <span className="block text-sm font-semibold">Layout Node</span>
            </button>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Routing Nodes
            </p>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-3 text-left text-emerald-100 transition hover:bg-emerald-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "photo-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addActionNodeAtPosition("photo")}
            >
              <span className="block text-sm font-semibold">Photo Orientation Node</span>
            </button>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-left text-amber-100 transition hover:bg-amber-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "warning-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addActionNodeAtPosition("warning")}
            >
              <span className="block text-sm font-semibold">Warning Node</span>
            </button>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-sky-500/50 bg-sky-500/10 px-3 py-3 text-left text-sky-100 transition hover:bg-sky-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "time-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addTimeGateNodeAtPosition()}
            >
              <span className="block text-sm font-semibold">Time Gate Node</span>
            </button>
          </div>
        </aside>

        <div
          className="h-[760px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            proOptions={{ hideAttribution: true }}
            onInit={setReactFlowInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onNodeClick={(_event, node) =>
              dispatch({
                type: "select-node",
                nodeId: node.id,
              })
            }
            onPaneClick={() =>
              dispatch({
                type: "select-node",
                nodeId: null,
              })
            }
            minZoom={0.35}
            maxZoom={1.5}
            deleteKeyCode={["Backspace", "Delete"]}
            isValidConnection={isValidConnection}
            panOnDrag={isCanvasInteractive}
            zoomOnScroll={isCanvasInteractive}
            zoomOnPinch={isCanvasInteractive}
            zoomOnDoubleClick={isCanvasInteractive}
            connectionRadius={64}
            connectionLineType={ConnectionLineType.SimpleBezier}
            connectionLineStyle={{
              stroke: "#cbd5e1",
              strokeOpacity: 0.55,
              strokeWidth: 2.2,
              strokeDasharray: EDGE_DASH_PATTERN,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
            className="bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_rgba(2,6,23,0.95)_55%)]"
            nodesConnectable={isCanvasInteractive}
            nodesDraggable={isCanvasInteractive}
            elementsSelectable={isCanvasInteractive}
          >
            <Background color="#1e293b" gap={24} size={1.2} />
            {runtimeStatusMeta ? (
              <Panel position="top-right">
                <div
                  title={runtimeStatusMeta.title}
                  aria-label={runtimeStatusMeta.title}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-base font-bold shadow-[0_10px_30px_rgba(2,6,23,0.35)] ${runtimeStatusMeta.className}`}
                >
                  {runtimeStatusMeta.icon}
                </div>
              </Panel>
            ) : null}
            <Panel position="bottom-right">
              <div className="divide-y divide-cyan-500/25 overflow-hidden rounded-[22px] border border-cyan-500/40 bg-slate-950/92 shadow-[0_0_0_1px_rgba(14,116,144,0.25),0_8px_18px_rgba(2,6,23,0.55)]">
                <CanvasControlButton
                  title="Zoom in"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomIn({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">+</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Zoom out"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomOut({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">−</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Fit canvas"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.fitView({
                      duration: 160,
                      padding: 0.18,
                    });
                  }}
                >
                  <FitViewIcon />
                </CanvasControlButton>
                <CanvasControlButton
                  title={isCanvasInteractive ? "Lock canvas" : "Unlock canvas"}
                  active={!isCanvasInteractive}
                  onClick={() => {
                    dispatch({
                      type: "toggle-canvas-interactive",
                    });
                  }}
                >
                  <LockIcon locked={!isCanvasInteractive} />
                </CanvasControlButton>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Inspector
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedLayoutNode
                ? "Edit the selected layout node."
                : selectedActionNode
                  ? `Edit the selected ${selectedActionKind === "warning" ? "warning" : "photo orientation"} node settings.`
                  : selectedTimeGateNode
                    ? "Edit the selected time gate node settings."
                    : "Select a photo orientation, warning, time gate, or layout node to edit it."}
            </p>
          </div>

          {editorError ? (
            <p className="rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {editorError}
            </p>
          ) : null}

          {selectedLayoutNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <div>
                  <p className="text-base font-semibold text-slate-100">Layout Node</p>
                  <p className="mt-1 text-sm text-slate-300">{selectedLayoutNode.layoutName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Node {selectedLayoutNode.id.slice(0, 8)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Layout
                    </span>
                    <select
                      className={GRAPH_SELECT_INPUT_CLASS}
                      value={selectedLayoutNode.layoutName}
                      onChange={(event) =>
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          layoutName: event.target.value,
                        }))
                      }
                    >
                      {layoutOptions.map((layout) => (
                        <option key={layout.id} value={layout.name}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Show (sec)
                    </span>
                    <input
                      type="number"
                      min={3}
                      max={3600}
                      step={1}
                      value={selectedLayoutNode.cycleSeconds}
                      className={GRAPH_TEXT_INPUT_CLASS}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          cycleSeconds: clampCycleSeconds(parsed),
                        }));
                      }}
                    />
                  </label>
                </div>
              </div>

              {(() => {
                const actionType = getActionTypeById(selectedLayoutNode.actionType);
                const actionParams = parseActionParamsByType(
                  selectedLayoutNode.actionType,
                  selectedLayoutNode.actionParams,
                );
                const photoCollectionId =
                  typeof actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY] === "string"
                    ? actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY].trim()
                    : "";

                return (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                    <p className="text-sm font-semibold text-slate-100">Action settings</p>
                    <p className="mt-1 text-xs text-slate-400">{actionType.description}</p>

                    <div className="mt-4 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Photo source override
                        </span>
                        <select
                          className={GRAPH_SELECT_INPUT_CLASS}
                          value={photoCollectionId}
                          onChange={(event) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                [PHOTO_COLLECTION_ACTION_PARAM_KEY]:
                                  event.target.value.trim() || null,
                              },
                            }))
                          }
                        >
                          <option value="">/photos</option>
                          {photoCollectionOptions.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              Collection: {collection.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {actionType.paramFields?.map((field) => (
                        <ParamFieldEditor
                          key={field.key}
                          field={field}
                          params={actionParams}
                          onPatch={(patch) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                ...patch,
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : selectedActionNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-base font-semibold text-slate-100">
                  {selectedActionKind === "warning"
                    ? "Warning node settings"
                    : "Photo orientation node settings"}
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Node name
                    </span>
                    <input
                      type="text"
                      value={selectedActionNode.title}
                      className={GRAPH_TEXT_INPUT_CLASS}
                      onChange={(event) =>
                        updateSelectedActionNode((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  {selectedActionUsesPhotoSource ? (
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Photo source
                      </span>
                      <select
                        className={GRAPH_SELECT_INPUT_CLASS}
                        value={selectedActionNode.photoActionCollectionId ?? ""}
                        onChange={(event) =>
                          updateSelectedActionNode((current) => ({
                            ...current,
                            photoActionCollectionId: event.target.value.trim() || null,
                          }))
                        }
                      >
                        <option value="">/photos</option>
                        {photoCollectionOptions.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            Collection: {collection.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                      This node does not need a photo source. When a warning is active it shows the
                      automatic warning layout, and the No Warning output continues the graph.
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-400">{selectedCanvasAction.description}</p>
              </div>

              {renderConditionalSettings(
                selectedActionKind ?? "photo",
                "portrait-photo",
                selectedActionNode.portrait,
                (updater) =>
                  updateSelectedActionNode((current) => ({
                    ...current,
                    portrait: updater(current.portrait),
                  })),
              )}
            </>
          ) : selectedTimeGateNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-base font-semibold text-slate-100">Time gate node settings</p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Node name
                    </span>
                    <input
                      type="text"
                      value={selectedTimeGateNode.title}
                      className={GRAPH_TEXT_INPUT_CLASS}
                      onChange={(event) =>
                        updateSelectedTimeGateNode((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Uses the household timezone. Windows are start-inclusive and end-exclusive, and
                  the Else route runs when no window matches.
                </p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Time windows</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Add non-overlapping windows in the order you want them checked.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!nextAvailableTimeGateWindow}
                    className="rounded border border-sky-500/60 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                    onClick={() => {
                      if (!nextAvailableTimeGateWindow) {
                        return;
                      }
                      updateSelectedTimeGateNode((current) => ({
                        ...current,
                        gates: [...current.gates, nextAvailableTimeGateWindow],
                      }));
                    }}
                  >
                    Add window
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedTimeGateNode.gates.map((gate, gateIndex) => {
                    const gateMeta = getTimeGateRouteMeta(gateIndex);
                    return (
                      <div
                        key={gate.id}
                        className={`rounded-xl border p-3 ${gateMeta.borderClassName} ${gateMeta.bgClassName}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Gate {gateIndex + 1}</p>
                            <p className="mt-1 text-xs opacity-80">
                              Connect this output to the path for{" "}
                              {formatPhotoRouterTimeGateWindow(gate)}.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={selectedTimeGateNode.gates.length <= 1}
                            className="rounded border border-rose-400/70 px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                            onClick={() =>
                              updateSelectedTimeGateNode((current) => ({
                                ...current,
                                gates: current.gates.filter((entry) => entry.id !== gate.id),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Start
                            </span>
                            <input
                              type="time"
                              value={gate.startTime}
                              className={GRAPH_TEXT_INPUT_CLASS}
                              onChange={(event) =>
                                updateSelectedTimeGateNode((current) => ({
                                  ...current,
                                  gates: current.gates.map((entry) =>
                                    entry.id === gate.id
                                      ? {
                                          ...entry,
                                          startTime: event.target.value || entry.startTime,
                                        }
                                      : entry,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              End
                            </span>
                            <input
                              type="time"
                              value={gate.endTime}
                              className={GRAPH_TEXT_INPUT_CLASS}
                              onChange={(event) =>
                                updateSelectedTimeGateNode((current) => ({
                                  ...current,
                                  gates: current.gates.map((entry) =>
                                    entry.id === gate.id
                                      ? { ...entry, endTime: event.target.value || entry.endTime }
                                      : entry,
                                  ),
                                }))
                              }
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Else route: use this output when the current household time does not match any
                  gate above.
                </div>

                {selectedTimeGateIssues.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {selectedTimeGateIssues.map((issue) => (
                      <p
                        key={`${issue.nodeId}:${issue.gateId ?? "node"}:${issue.message}`}
                        className="rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                      >
                        {issue.message}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
};

export default SetLogicEditor;
