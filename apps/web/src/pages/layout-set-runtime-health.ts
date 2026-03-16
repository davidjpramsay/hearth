import {
  applyLayoutSetLogicEdgeState,
  isLocalWarningAutoLayoutName,
  layoutSetLogicGraphSchema,
  resolveDisplaySequenceFromLogicGraph,
  type AutoLayoutTarget,
  type LayoutSetLogicEdgeOverride,
  type LayoutSetLogicEdge,
  type LayoutSetLogicGraph,
  type LayoutSetLogicNode,
} from "@hearth/shared";

type RuntimeOrientationKey = "portrait" | "landscape" | "unknown";
type RuntimeHealthSeverity = "error" | "warning";

interface RuntimeOrientationCase {
  key: RuntimeOrientationKey;
  label: string;
  orientation: "portrait" | "landscape" | null;
}

interface RuntimeHealthIssue {
  severity: RuntimeHealthSeverity;
  message: string;
}

interface RuntimeHealthPath {
  key: RuntimeOrientationKey;
  label: string;
  sequence: AutoLayoutTarget[];
  summary: string;
}

export interface RuntimeHealthReport {
  status: "ok" | "warning" | "error";
  issues: RuntimeHealthIssue[];
  paths: RuntimeHealthPath[];
}

const ORIENTATION_CASES: RuntimeOrientationCase[] = [
  {
    key: "portrait",
    label: "Portrait photo",
    orientation: "portrait",
  },
  {
    key: "landscape",
    label: "Landscape photo",
    orientation: "landscape",
  },
  {
    key: "unknown",
    label: "Unknown orientation",
    orientation: null,
  },
];

const nodeTypeLabel = (type: LayoutSetLogicNode["type"]): string => {
  switch (type) {
    case "start":
      return "Start";
    case "select-photo":
      return "Photo action";
    case "if-portrait":
      return "If portrait";
    case "if-landscape":
      return "If landscape";
    case "else":
      return "Else";
    case "display":
      return "Display";
    case "return":
      return "Return";
    default:
      return type;
  }
};

const sequenceSummary = (sequence: AutoLayoutTarget[]): string => {
  if (sequence.length === 0) {
    return "No display steps (falls back to active/default layout).";
  }

  return sequence
    .map(
      (target) =>
        `${isLocalWarningAutoLayoutName(target.layoutName) ? "Local warnings (auto)" : target.layoutName} (${Math.max(3, Math.round(target.cycleSeconds ?? 20))}s)`,
    )
    .join(" -> ");
};

const getOutgoingByNode = (
  edges: LayoutSetLogicEdge[],
): Map<string, LayoutSetLogicEdge[]> => {
  const grouped = new Map<string, LayoutSetLogicEdge[]>();
  for (const edge of edges) {
    const current = grouped.get(edge.from);
    if (current) {
      current.push(edge);
      continue;
    }
    grouped.set(edge.from, [edge]);
  }
  return grouped;
};

const getReachableNodeIds = (input: {
  entryNodeId: string;
  nodeIds: Set<string>;
  outgoingByNode: Map<string, LayoutSetLogicEdge[]>;
}): Set<string> => {
  const reachable = new Set<string>();
  const queue = [input.entryNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || reachable.has(nodeId) || !input.nodeIds.has(nodeId)) {
      continue;
    }

    reachable.add(nodeId);

    const outgoing = input.outgoingByNode.get(nodeId) ?? [];
    for (const edge of outgoing) {
      if (!reachable.has(edge.to) && input.nodeIds.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  return reachable;
};

export const analyzeSetRuntimeHealth = (input: {
  graph: LayoutSetLogicGraph;
  knownLayoutNames: Set<string>;
  edgeOverrides?: Record<string, LayoutSetLogicEdgeOverride> | null;
  disconnectedEdgeIds?: string[] | null;
}): RuntimeHealthReport => {
  const issues: RuntimeHealthIssue[] = [];
  const seenIssueMessages = new Set<string>();
  const addIssue = (severity: RuntimeHealthSeverity, message: string) => {
    const key = `${severity}:${message}`;
    if (seenIssueMessages.has(key)) {
      return;
    }
    seenIssueMessages.add(key);
    issues.push({ severity, message });
  };

  let graph: LayoutSetLogicGraph;
  try {
    graph = layoutSetLogicGraphSchema.parse(input.graph);
  } catch {
    return {
      status: "error",
      issues: [{ severity: "error", message: "Set logic graph is invalid JSON/schema." }],
      paths: ORIENTATION_CASES.map((caseItem) => ({
        key: caseItem.key,
        label: caseItem.label,
        sequence: [],
        summary: sequenceSummary([]),
      })),
    };
  }

  const effectiveGraph = applyLayoutSetLogicEdgeState({
    graph,
    edgeOverrides: input.edgeOverrides,
    disconnectedEdgeIds: input.disconnectedEdgeIds,
  });

  const nodeIds = new Set<string>();
  for (const node of effectiveGraph.nodes) {
    if (nodeIds.has(node.id)) {
      addIssue("error", `Duplicate node id "${node.id}" detected.`);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of effectiveGraph.edges) {
    if (edgeIds.has(edge.id)) {
      addIssue("error", `Duplicate edge id "${edge.id}" detected.`);
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from)) {
      addIssue("error", `Edge "${edge.id}" starts from missing node "${edge.from}".`);
    }
    if (!nodeIds.has(edge.to)) {
      addIssue("error", `Edge "${edge.id}" points to missing node "${edge.to}".`);
    }
  }

  if (!nodeIds.has(effectiveGraph.entryNodeId)) {
    addIssue(
      "error",
      `Entry node "${effectiveGraph.entryNodeId}" does not exist in this set graph.`,
    );
  }

  const outgoingByNode = getOutgoingByNode(effectiveGraph.edges);
  for (const node of effectiveGraph.nodes) {
    const outgoing = outgoingByNode.get(node.id) ?? [];
    if (node.type === "return") {
      continue;
    }

    if (outgoing.length === 0) {
      addIssue("warning", `${nodeTypeLabel(node.type)} node "${node.id}" has no outgoing path.`);
    }

    if (node.type === "if-portrait" || node.type === "if-landscape") {
      const hasYes = outgoing.some((edge) => edge.when === "yes");
      const hasNo = outgoing.some((edge) => edge.when === "no");

      if (!hasYes && !hasNo) {
        addIssue(
          "warning",
          `${nodeTypeLabel(node.type)} node "${node.id}" is missing Yes/No branches.`,
        );
      } else if (!hasYes || !hasNo) {
        addIssue(
          "warning",
          `${nodeTypeLabel(node.type)} node "${node.id}" is missing a ${
            hasYes ? "No" : "Yes"
          } branch.`,
        );
      }
    }

    if (node.type === "display") {
      const layoutName = node.layoutName?.trim() ?? "";
      if (!layoutName) {
        addIssue("warning", `Display node "${node.id}" has no layout selected.`);
      } else if (
        !isLocalWarningAutoLayoutName(layoutName) &&
        !input.knownLayoutNames.has(layoutName)
      ) {
        addIssue("warning", `Display node "${node.id}" uses unknown layout "${layoutName}".`);
      }
    }
  }

  const reachableNodeIds = getReachableNodeIds({
    entryNodeId: effectiveGraph.entryNodeId,
    nodeIds,
    outgoingByNode,
  });
  for (const node of effectiveGraph.nodes) {
    if (!reachableNodeIds.has(node.id)) {
      addIssue("warning", `${nodeTypeLabel(node.type)} node "${node.id}" is unreachable.`);
    }
  }

  const paths = ORIENTATION_CASES.map((caseItem) => {
    const sequence = resolveDisplaySequenceFromLogicGraph({
      graph: effectiveGraph,
      orientation: caseItem.orientation,
    });
    return {
      key: caseItem.key,
      label: caseItem.label,
      sequence,
      summary: sequenceSummary(sequence),
    } satisfies RuntimeHealthPath;
  });

  const portraitPath = paths.find((entry) => entry.key === "portrait");
  const landscapePath = paths.find((entry) => entry.key === "landscape");
  if ((portraitPath?.sequence.length ?? 0) === 0 && (landscapePath?.sequence.length ?? 0) === 0) {
    addIssue(
      "warning",
      "No display layouts resolve for portrait/landscape. Runtime will use fallback layout.",
    );
  } else {
    if ((portraitPath?.sequence.length ?? 0) === 0) {
      addIssue(
        "warning",
        "Portrait simulation resolves no display steps. It will fall back at runtime.",
      );
    }
    if ((landscapePath?.sequence.length ?? 0) === 0) {
      addIssue(
        "warning",
        "Landscape simulation resolves no display steps. It will fall back at runtime.",
      );
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");

  return {
    status: hasError ? "error" : hasWarning ? "warning" : "ok",
    issues: issues.sort((left, right) =>
      left.severity === right.severity
        ? left.message.localeCompare(right.message)
        : left.severity === "error"
          ? -1
          : 1,
    ),
    paths,
  };
};
