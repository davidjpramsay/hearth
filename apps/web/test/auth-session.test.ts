import assert from "node:assert/strict";
import test from "node:test";
import { handleUnauthorizedAdminResponse } from "../src/auth/session";

interface MockWindow {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  location: {
    pathname: string;
    replace: (value: string) => void;
  };
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

const restoreWindow = (): void => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
};

const installMockWindow = (input?: {
  pathname?: string;
  initialStorage?: Record<string, string>;
}) => {
  const storage = new Map<string, string>(Object.entries(input?.initialStorage ?? {}));
  let replacedTo: string | null = null;

  const mockWindow: MockWindow = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
    location: {
      pathname: input?.pathname ?? "/admin/layouts",
      replace: (value) => {
        replacedTo = value;
      },
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  return {
    storage,
    getReplacedTo: () => replacedTo,
  };
};

test("handleUnauthorizedAdminResponse ignores public requests", () => {
  installMockWindow({
    initialStorage: {
      "hearth-admin-token": "token-1",
    },
  });

  const handled = handleUnauthorizedAdminResponse(401, new Headers());

  assert.equal(handled, false);
  restoreWindow();
});

test("handleUnauthorizedAdminResponse clears the admin token and redirects", () => {
  const mock = installMockWindow({
    initialStorage: {
      "hearth-admin-token": "token-1",
    },
  });

  const handled = handleUnauthorizedAdminResponse(
    401,
    new Headers({
      Authorization: "Bearer token-1",
    }),
  );

  assert.equal(handled, true);
  assert.equal(mock.storage.has("hearth-admin-token"), false);
  assert.equal(mock.getReplacedTo(), "/admin/login");
  restoreWindow();
});

test("handleUnauthorizedAdminResponse avoids redirect loops on the login page", () => {
  const mock = installMockWindow({
    pathname: "/admin/login",
    initialStorage: {
      "hearth-admin-token": "token-1",
    },
  });

  const handled = handleUnauthorizedAdminResponse(
    401,
    new Headers({
      Authorization: "Bearer token-1",
    }),
  );

  assert.equal(handled, true);
  assert.equal(mock.storage.has("hearth-admin-token"), false);
  assert.equal(mock.getReplacedTo(), null);
  restoreWindow();
});
