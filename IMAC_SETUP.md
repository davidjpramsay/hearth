# Hearth on the iMac

This iMac runs Hearth directly on macOS Catalina.

Do not try to do a full local build on the iMac. Build on a newer Mac, then copy the built files over.
Also do not run `pnpm install` on the iMac. Catalina plus this repo's workspace/patch setup is brittle there.

## What Lives Where

- Repo: `/Users/tash/Hearth`
- App data: `/Users/tash/.hearth`
- Photos: `/Users/Shared/Hearth Photos`
- Photo symlink used by Hearth: `/Users/tash/.hearth/photos`
- Start script: `/Users/tash/bin/hearth-start.sh`
- Launch agent: `/Users/tash/Library/LaunchAgents/com.hearth.server.plist`
- Logs:
  - `/Users/tash/Library/Logs/Hearth/server.out.log`
  - `/Users/tash/Library/Logs/Hearth/server.err.log`
- Patches needed for dependency install/build parity:
  - `/Users/tash/Hearth/patches`

## Update From Another Mac

Use this flow when a newer Mac built a fresh Hearth release.

1. Build the repo on the newer Mac.

```bash
pnpm build
```

2. Copy the built output plus the workspace files and dependency links the iMac needs.

From the newer Mac, run this from the Hearth repo root:

```bash
rsync -a --delete --checksum \
  apps/server/dist/ \
  apps/web/dist/ \
  packages/shared/dist/ \
  packages/core/dist/ \
  packages/module-sdk/dist/ \
  apps/server/package.json \
  packages/shared/package.json \
  packages/core/package.json \
  packages/module-sdk/package.json \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  patches/ \
  node_modules/ \
  apps/server/node_modules/ \
  packages/shared/node_modules/ \
  packages/core/node_modules/ \
  packages/module-sdk/node_modules/ \
  tash@192.168.1.81:~/Hearth/
```

3. Restart Hearth on the iMac.

```bash
ssh tash@192.168.1.81 'launchctl kickstart -k gui/$(id -u)/com.hearth.server'
```

4. Check that it came back up.

```bash
ssh tash@192.168.1.81 'curl -fsS http://127.0.0.1:3000/api/modules/server-status'
```

## What Not To Copy

Do not overwrite these on the iMac:

- `/Users/tash/.hearth`
- `/Users/tash/Hearth/.env`
- `/Users/tash/Hearth/IMAC_SETUP.md`

Those files hold the local environment, database, backups, and this note.

## If It Looks Stale

If the site loads but looks old:

1. Restart the launch agent again.
2. Hard refresh the browser: `Cmd + Shift + R`
3. Compare the build hashes from `/api/modules/server-status`.

## If Photos Stop Working

Check that these still exist:

- `/Users/Shared/Hearth Photos`
- `/Users/tash/.hearth/photos`

## If Hearth Will Not Start

Check:

- `/Users/tash/Library/Logs/Hearth/server.out.log`
- `/Users/tash/Library/Logs/Hearth/server.err.log`
- `launchctl print gui/$(id -u)/com.hearth.server`

If the error mentions missing packages like `bcryptjs`, `zod`, or `@hearth/shared`, it means the workspace link tree on the iMac is stale. Re-run the rsync above from a known-good Mac; do not try to repair it with `pnpm install` on the iMac.
