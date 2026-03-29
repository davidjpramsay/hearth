export interface LayoutUpdatedEvent {
  type: "layout-updated";
  layoutId: number;
  activeLayoutId: number | null;
  version: number;
  changedAt: string;
}

export interface ChoresUpdatedEvent {
  type: "chores-updated";
  changedAt: string;
  reason:
    | "member-created"
    | "member-updated"
    | "member-deleted"
    | "chore-created"
    | "chore-updated"
    | "chore-deleted"
    | "completion-updated"
    | "payout-config-updated";
  memberId?: number;
  choreId?: number;
  date?: string;
}

export interface DisplayDeviceUpdatedEvent {
  type: "display-device-updated";
  deviceId: string;
  changedAt: string;
  reason: "device-updated";
}

export interface SiteTimeUpdatedEvent {
  type: "site-time-updated";
  changedAt: string;
  siteTimezone: string;
}

export type AppEvent =
  | LayoutUpdatedEvent
  | ChoresUpdatedEvent
  | DisplayDeviceUpdatedEvent
  | SiteTimeUpdatedEvent;

type Listener = (event: AppEvent) => void;

export class LayoutEventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: AppEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Keep publishing to other listeners even if one stream fails.
      }
    }
  }
}
