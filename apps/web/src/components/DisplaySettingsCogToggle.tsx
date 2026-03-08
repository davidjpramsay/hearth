import { ChangeEvent, useEffect, useState } from "react";
import {
  getDisplaySettingsCogVisible,
  setDisplaySettingsCogVisible,
  subscribeToDisplaySettingsCogVisibility,
} from "../preferences/display-settings-cog";

interface DisplaySettingsCogToggleProps {
  className?: string;
  label?: string;
}

export const DisplaySettingsCogToggle = ({
  className = "min-w-[220px]",
  label = "Display settings cog",
}: DisplaySettingsCogToggleProps) => {
  const [displaySettingsCogVisible, setDisplaySettingsCogVisibleState] = useState<boolean>(() =>
    getDisplaySettingsCogVisible(),
  );

  useEffect(
    () => subscribeToDisplaySettingsCogVisibility(setDisplaySettingsCogVisibleState),
    [],
  );

  const onVisibilityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVisible = setDisplaySettingsCogVisible(event.target.checked);
    setDisplaySettingsCogVisibleState(nextVisible);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <label className="flex h-10 cursor-pointer items-center justify-between rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-100 outline-none transition hover:border-cyan-500">
        <span>Show on this device</span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            displaySettingsCogVisible ? "bg-cyan-500/90" : "bg-slate-600"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
              displaySettingsCogVisible ? "translate-x-[1.25rem]" : "translate-x-0.5"
            }`}
          />
        </span>
        <input
          type="checkbox"
          className="sr-only"
          checked={displaySettingsCogVisible}
          onChange={onVisibilityChange}
          aria-label="Show display settings cog on this device"
        />
      </label>
    </div>
  );
};
