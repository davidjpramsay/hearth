import { useEffect, useMemo, useState } from "react";
import {
  koboReaderCurrentResponseSchema,
  koboReaderModuleConfigSchema,
  koboReaderUsersResponseSchema,
  type KoboReaderCurrentResponse,
  type KoboReaderModuleConfig,
  type KoboReaderUser,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { useModuleQuery } from "../data/useModuleQuery";
import { ModuleFrame } from "../ui/ModuleFrame";
import {
  ModulePresentationControls,
  scaleRoleRem,
} from "../ui/ModulePresentationControls";
import { useTileDensity } from "../ui/useTileDensity";

const POLL_INTERVAL_MS = 60_000;

const loadCurrentBook = async (userName: string): Promise<KoboReaderCurrentResponse> => {
  const response = await fetch(
    `/api/modules/kobo-reader/current?userName=${encodeURIComponent(userName)}`,
    {
      method: "GET",
    },
  );

  if (response.status === 503) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : "Kobo Reader is not configured for this environment.";
    return koboReaderCurrentResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      userName,
      book: null,
      warning: message,
    });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return koboReaderCurrentResponseSchema.parse(await response.json());
};

const loadUsers = async (): Promise<{ users: KoboReaderUser[]; warning: string | null }> => {
  const response = await fetch("/api/modules/kobo-reader/users", {
    method: "GET",
  });

  if (response.status === 503) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : "Kobo Reader is not configured for this environment.";
    return {
      users: [],
      warning: message,
    };
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  const parsed = koboReaderUsersResponseSchema.parse(await response.json());
  return {
    users: parsed.users,
    warning: parsed.warning,
  };
};

const formatMinutes = (minutes: number | null): string | null => {
  if (minutes === null || minutes < 0) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
};

const buildUserOptions = (
  currentValue: string,
  users: KoboReaderUser[],
): Array<{ value: string; label: string }> => {
  const map = new Map<string, string>();

  for (const user of users) {
    const trimmed = user.name.trim();
    if (trimmed.length > 0) {
      map.set(trimmed, trimmed);
    }
  }

  const trimmedCurrentValue = currentValue.trim();
  if (trimmedCurrentValue.length > 0 && !map.has(trimmedCurrentValue)) {
    map.set(trimmedCurrentValue, `${trimmedCurrentValue} (current)`);
  }

  return [...map.entries()].map(([value, label]) => ({ value, label }));
};

const ReadingStat = ({
  label,
  value,
  supportingScale,
}: {
  label: string;
  value: string;
  supportingScale: number;
}) => (
  <div className="module-panel-card flex h-full min-w-0 flex-col justify-center rounded-[26px] px-5 py-3 text-[color:var(--color-text-primary)]">
    <span
      className="module-panel-label block truncate"
      style={{ fontSize: scaleRoleRem(0.65, supportingScale) }}
    >
      {label}
    </span>
    <span
      className="mt-1 block truncate font-medium"
      style={{ fontSize: scaleRoleRem(0.9, supportingScale) }}
    >
      {value}
    </span>
  </div>
);

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: KoboReaderModuleConfig;
  onChange: (next: KoboReaderModuleConfig) => void;
}) => {
  const [users, setUsers] = useState<KoboReaderUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersWarning, setUsersWarning] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        setLoadingUsers(true);
        setUsersError(null);
        const result = await loadUsers();
        if (disposed) {
          return;
        }
        setUsers(result.users);
        setUsersWarning(result.warning);
      } catch (error) {
        if (disposed) {
          return;
        }
        setUsers([]);
        setUsersWarning(null);
        setUsersError(error instanceof Error ? error.message : "Failed to load Kobo users.");
      } finally {
        if (!disposed) {
          setLoadingUsers(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  const userOptions = useMemo(
    () => buildUserOptions(settings.userName, users),
    [settings.userName, users],
  );

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
      <h3 className="text-base font-semibold">Kobo Reader settings</h3>
      <label className="block space-y-2">
        <span>Kobo user</span>
        <select
          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
          value={settings.userName}
          disabled={loadingUsers || userOptions.length === 0}
          onChange={(event) =>
            onChange({
              ...settings,
              userName: event.target.value,
            })
          }
        >
          {userOptions.length === 0 ? (
            <option value={settings.userName}>
              {loadingUsers ? "Loading users..." : "No Kobo users found"}
            </option>
          ) : null}
          {userOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {usersWarning ? <p className="text-xs text-amber-300">{usersWarning}</p> : null}
      {usersError ? <p className="text-xs text-amber-300">{usersError}</p> : null}
      <label className="flex items-center justify-between gap-4">
        <span>Show spent reading</span>
        <input
          type="checkbox"
          checked={settings.showSpentReading}
          onChange={(event) =>
            onChange({
              ...settings,
              showSpentReading: event.target.checked,
            })
          }
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>Show remaining reading</span>
        <input
          type="checkbox"
          checked={settings.showRemainingReading}
          onChange={(event) =>
            onChange({
              ...settings,
              showRemainingReading: event.target.checked,
            })
          }
        />
      </label>
      <ModulePresentationControls
        value={settings.presentation}
        onChange={(presentation) =>
          onChange({
            ...settings,
            presentation,
          })
        }
      />
    </div>
  );
};

export const moduleDefinition = defineModule({
  manifest: {
    id: "kobo-reader",
    name: "Kobo Reader",
    version: "1.0.0",
    description: "Shows the most recently read Kobo book from Calibre-Web sync data.",
    icon: "book-open",
    defaultSize: { w: 5, h: 3 },
    categories: ["books", "reading"],
    permissions: ["network", "filesystem"],
    dataSources: [{ id: "kobo-reader-rest", kind: "rest", pollMs: POLL_INTERVAL_MS }],
  },
  settingsSchema: koboReaderModuleConfigSchema,
  dataSchema: koboReaderCurrentResponseSchema,
  runtime: {
    Component: ({ settings }) => {
      const { ref, metrics } = useTileDensity<HTMLDivElement>();
      const bookState = useModuleQuery({
        key: `kobo-reader:${settings.userName}`,
        queryFn: async () => loadCurrentBook(settings.userName),
        intervalMs: POLL_INTERVAL_MS,
        staleMs: POLL_INTERVAL_MS - 1_000,
      });
      const compact = metrics.width < 360;
      const hasBook = Boolean(bookState.data?.book);
      const progressPercent = Math.max(0, Math.min(100, bookState.data?.progressPercent ?? 0));
      const spentLabel = formatMinutes(bookState.data?.spentReadingMinutes ?? null);
      const remainingLabel = formatMinutes(bookState.data?.remainingReadingMinutes ?? null);
      const readingStats = [
        settings.showSpentReading && spentLabel
          ? { key: "spent", label: "Spent", value: spentLabel }
          : null,
        settings.showRemainingReading && remainingLabel
          ? { key: "remaining", label: "Remaining", value: remainingLabel }
          : null,
      ].filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));

      return (
        <ModuleFrame
          title=""
          hideHeader
          loading={bookState.loading}
          error={bookState.error}
          empty={!hasBook && !bookState.loading && !bookState.error}
          emptyMessage={bookState.data?.warning ?? "No Kobo reading activity found."}
        >
          {bookState.data?.book ? (
            <div
              ref={ref}
              className="module-panel-shell relative z-10 flex h-full flex-col justify-between gap-4 rounded-[24px] p-4 text-[color:var(--color-text-primary)]"
            >
              <div
                className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-[minmax(9.5rem,11rem)_minmax(0,1fr)]"}`}
              >
                <div className="module-panel-card self-start overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.22)]">
                  {bookState.data.book.coverImageUrl ? (
                    <img
                      src={bookState.data.book.coverImageUrl}
                      alt={`${bookState.data.book.title} cover`}
                      className="block h-auto w-full"
                    />
                  ) : (
                    <div
                      className="flex aspect-[2/3] min-h-28 items-center justify-center px-4 text-center"
                      style={{
                        background:
                          "radial-gradient(circle at top, rgb(var(--color-text-accent-rgb) / 0.22), transparent 55%), linear-gradient(180deg, rgb(var(--tone-slate-800-rgb)), rgb(var(--tone-slate-950-rgb)))",
                      }}
                    >
                      <span
                        className="font-semibold text-[color:var(--color-text-primary)]"
                        style={{
                          fontSize: scaleRoleRem(
                            compact ? 0.95 : 1.05,
                            settings.presentation.primaryScale,
                          ),
                        }}
                      >
                        {bookState.data.book.title}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <p
                      className="module-panel-label"
                      style={{
                        fontSize: scaleRoleRem(0.68, settings.presentation.supportingScale),
                      }}
                    >
                      Most recently read
                    </p>
                    <h3
                      className="line-clamp-3 font-semibold text-balance"
                      style={{
                        fontSize: scaleRoleRem(
                          compact ? 1.05 : 1.2,
                          settings.presentation.headingScale,
                        ),
                      }}
                    >
                      {bookState.data.book.title}
                    </h3>
                    <p
                      className="text-[color:var(--color-text-secondary)]"
                      style={{
                        fontSize: scaleRoleRem(
                          compact ? 0.9 : 1,
                          settings.presentation.primaryScale,
                        ),
                      }}
                    >
                      {bookState.data.book.authorLabel}
                    </p>
                  </div>

                  {readingStats.length > 0 ? (
                    <div
                      className="grid gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(1, readingStats.length)}, minmax(0, 1fr))`,
                      }}
                    >
                      {readingStats.map((stat) => (
                        <ReadingStat
                          key={stat.key}
                          label={stat.label}
                          value={stat.value}
                          supportingScale={settings.presentation.supportingScale}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="text-[color:var(--color-text-secondary)]"
                    style={{
                      fontSize: scaleRoleRem(0.8, settings.presentation.supportingScale),
                    }}
                  >
                    Reading progress
                  </span>
                  <span
                    className="font-semibold text-[color:var(--color-text-accent)]"
                    style={{
                      fontSize: scaleRoleRem(0.92, settings.presentation.primaryScale),
                    }}
                  >
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                <div className="module-panel-progress h-2.5">
                  <div
                    className="module-panel-progress__bar"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </ModuleFrame>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
