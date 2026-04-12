import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
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
  getCanvasActionTypeById,
  getDefaultActionParams,
  getDefaultCanvasActionTypeId,
  getDefaultConditionTypeForTrigger,
  parseConditionParamsByType,
} from "./logicNodeRegistry";
import { SetLogicCanvas, SetLogicPalette } from "./set-logic-editor/canvas-shell";
import {
  buildFlowGraph,
  clampCycleSeconds,
  createActionNodeId,
  createStepId,
  createTimeGateWindowId,
  getActionNodeKind,
  getConnectableSourceHandles,
  getDefaultRouterNodeTitle,
  getGraphNodeById,
  getGraphNodeSize,
  getNextLayoutInsertPosition,
  getNextRouterInsertPosition,
  getNextTimeGateWindow,
  getNormalizedConditionTypeForNodeKind,
  isLayoutGraphNode,
  isPhotoOrientationNode,
  isTimeGateNode,
  omitNodePositions,
  resolveInsertPosition,
  roundPosition,
  wouldCreateGraphCycle,
} from "./set-logic-editor/graph";
import { SetLogicInspector } from "./set-logic-editor/inspector";
import { graphEditorReducer } from "./set-logic-editor/reducer";
import {
  type ActionNodeKind,
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

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <SetLogicPalette
          layoutOptions={layoutOptions}
          onAddLayoutNode={() => addLayoutNodeAtPosition()}
          onAddActionNode={(kind) => addActionNodeAtPosition(kind)}
          onAddTimeGateNode={() => addTimeGateNodeAtPosition()}
        />

        <SetLogicCanvas
          graph={graph}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          runtimeStatusMeta={runtimeStatusMeta}
          reactFlowInstance={reactFlowInstance}
          isCanvasInteractive={isCanvasInteractive}
          onZoomIn={() => {
            void reactFlowInstance?.zoomIn({ duration: 140 });
          }}
          onZoomOut={() => {
            void reactFlowInstance?.zoomOut({ duration: 140 });
          }}
          onFitView={() => {
            void reactFlowInstance?.fitView({
              duration: 160,
              padding: 0.18,
            });
          }}
          onToggleCanvasInteractive={() => {
            dispatch({
              type: "toggle-canvas-interactive",
            });
          }}
          reactFlowProps={{
            onInit: setReactFlowInstance,
            onNodesChange: handleNodesChange,
            onEdgesChange: handleEdgesChange,
            onConnect: handleConnect,
            onNodeDragStop: handleNodeDragStop,
            onNodesDelete: handleNodesDelete,
            onEdgesDelete: handleEdgesDelete,
            onNodeClick: (_event: unknown, node: Node) =>
              dispatch({
                type: "select-node",
                nodeId: node.id,
              }),
            onPaneClick: () =>
              dispatch({
                type: "select-node",
                nodeId: null,
              }),
            isValidConnection,
            panOnDrag: isCanvasInteractive,
            zoomOnScroll: isCanvasInteractive,
            zoomOnPinch: isCanvasInteractive,
            zoomOnDoubleClick: isCanvasInteractive,
          }}
        />

        <SetLogicInspector
          editorError={editorError}
          layoutOptions={layoutOptions}
          photoCollectionOptions={photoCollectionOptions}
          selectedLayoutNode={selectedLayoutNode}
          selectedActionNode={selectedActionNode}
          selectedActionKind={selectedActionKind}
          selectedActionUsesPhotoSource={selectedActionUsesPhotoSource}
          selectedCanvasAction={selectedCanvasAction}
          selectedTimeGateNode={selectedTimeGateNode}
          selectedTimeGateIssues={selectedTimeGateIssues}
          nextAvailableTimeGateWindow={nextAvailableTimeGateWindow}
          updateSelectedLayoutNode={updateSelectedLayoutNode}
          updateSelectedActionNode={updateSelectedActionNode}
          updateSelectedTimeGateNode={updateSelectedTimeGateNode}
          clampCycleSeconds={clampCycleSeconds}
        />
      </div>
    </section>
  );
};

export default SetLogicEditor;
