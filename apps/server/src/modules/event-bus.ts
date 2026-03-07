type ModuleEventListener = (payload: unknown) => void;

export class ModuleEventBus {
  private listeners = new Map<string, Set<ModuleEventListener>>();

  publish(topic: string, payload: unknown): void {
    const listeners = this.listeners.get(topic);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const listener of listeners) {
      listener(payload);
    }
  }

  subscribe(topic: string, listener: ModuleEventListener): () => void {
    const listeners = this.listeners.get(topic) ?? new Set<ModuleEventListener>();
    listeners.add(listener);
    this.listeners.set(topic, listeners);

    return () => {
      const current = this.listeners.get(topic);
      if (!current) {
        return;
      }

      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(topic);
      }
    };
  }
}
