import {
  PHOTO_COLLECTION_ACTION_PARAM_KEY,
  formatPhotoRouterTimeGateWindow,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
  type PhotoRouterTimeGate,
  type PhotoRouterTimeGateNode,
} from "@hearth/shared";
import {
  getActionTypeById,
  getConditionTypeById,
  parseActionParamsByType,
  parseConditionParamsByType,
  type LogicCanvasActionTypeDefinition,
} from "../logicNodeRegistry";
import { GRAPH_SELECT_INPUT_CLASS, GRAPH_TEXT_INPUT_CLASS, ParamFieldEditor } from "./components";
import {
  getAvailableConditionTypes,
  getConditionBranchCopy,
  getNormalizedConditionTypeForNodeKind,
  getTimeGateRouteMeta,
} from "./graph";
import type {
  ActionNodeKind,
  ConditionalTrigger,
  LayoutOption,
  PhotoCollectionOption,
} from "./shared";

const ConditionalSettings = ({
  actionKind,
  trigger,
  branch,
  updateBranch,
}: {
  actionKind: ActionNodeKind;
  trigger: ConditionalTrigger;
  branch: PhotoRouterPhotoOrientationNode["portrait"];
  updateBranch: (
    updater: (
      current: PhotoRouterPhotoOrientationNode["portrait"],
    ) => PhotoRouterPhotoOrientationNode["portrait"],
  ) => void;
}) => {
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
                    ...parseConditionParamsByType(normalizedConditionType, current.conditionParams),
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

export const SetLogicInspector = ({
  editorError,
  layoutOptions,
  photoCollectionOptions,
  selectedLayoutNode,
  selectedActionNode,
  selectedActionKind,
  selectedActionUsesPhotoSource,
  selectedCanvasAction,
  selectedTimeGateNode,
  selectedTimeGateIssues,
  nextAvailableTimeGateWindow,
  updateSelectedLayoutNode,
  updateSelectedActionNode,
  updateSelectedTimeGateNode,
  clampCycleSeconds,
}: {
  editorError: string | null;
  layoutOptions: LayoutOption[];
  photoCollectionOptions: PhotoCollectionOption[];
  selectedLayoutNode: PhotoRouterLayoutNode | null;
  selectedActionNode: PhotoRouterPhotoOrientationNode | null;
  selectedActionKind: ActionNodeKind | null;
  selectedActionUsesPhotoSource: boolean;
  selectedCanvasAction: LogicCanvasActionTypeDefinition;
  selectedTimeGateNode: PhotoRouterTimeGateNode | null;
  selectedTimeGateIssues: Array<{
    nodeId: string;
    gateId?: string | null;
    message: string;
  }>;
  nextAvailableTimeGateWindow: PhotoRouterTimeGate | null;
  updateSelectedLayoutNode: (
    updater: (current: PhotoRouterLayoutNode) => PhotoRouterLayoutNode,
  ) => void;
  updateSelectedActionNode: (
    updater: (current: PhotoRouterPhotoOrientationNode) => PhotoRouterPhotoOrientationNode,
  ) => void;
  updateSelectedTimeGateNode: (
    updater: (current: PhotoRouterTimeGateNode) => PhotoRouterTimeGateNode,
  ) => void;
  clampCycleSeconds: (value: number) => number;
}) => (
  <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Inspector</p>
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
            <p className="mt-1 text-xs text-slate-500">Node {selectedLayoutNode.id.slice(0, 8)}</p>
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
                          [PHOTO_COLLECTION_ACTION_PARAM_KEY]: event.target.value.trim() || null,
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

        <ConditionalSettings
          actionKind={selectedActionKind ?? "photo"}
          trigger="portrait-photo"
          branch={selectedActionNode.portrait}
          updateBranch={(updater) =>
            updateSelectedActionNode((current) => ({
              ...current,
              portrait: updater(current.portrait),
            }))
          }
        />
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
            Uses the household timezone. Windows are start-inclusive and end-exclusive, and the Else
            route runs when no window matches.
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
                        Connect this output to the path for {formatPhotoRouterTimeGateWindow(gate)}.
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
            Else route: use this output when the current household time does not match any gate
            above.
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
);
