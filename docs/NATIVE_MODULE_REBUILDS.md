# Native Module Rebuilds in Electron + pnpm

## The Problem

This project runs native C++ addon modules (`.node` files) inside Electron. These modules are compiled against a specific Node.js ABI version (`NODE_MODULE_VERSION`) and will crash if loaded by a runtime with a different version.

- **Node.js 24** (system) uses `NODE_MODULE_VERSION 137`
- **Electron 33** uses `NODE_MODULE_VERSION 130`

When `pnpm install` builds native modules, it targets the system Node.js. Electron needs them rebuilt against its own headers.

## Native Modules in This Project

| Package                    | Version | Source                                                  | Rebuild Tool                             |
| -------------------------- | ------- | ------------------------------------------------------- | ---------------------------------------- |
| `better-sqlite3`           | 11.x    | Direct dependency                                       | `electron-builder install-app-deps`      |
| `usb`                      | 2.x     | Direct dependency                                       | `electron-builder install-app-deps`      |
| `@serialport/bindings-cpp` | modern  | Via `serialport@13`                                     | `electron-builder install-app-deps`      |
| `@serialport/bindings`     | 9.2.8   | Via `encrypted-smiley-secure-protocol` → `serialport@9` | `scripts/rebuild-serialport-bindings.js` |

## Why `@serialport/bindings@9.2.8` Needs Special Handling

`electron-builder install-app-deps` scans the direct dependency tree for native modules. The old `@serialport/bindings@9.2.8` is a **transitive dependency** of the `encrypted-smiley-secure-protocol` (eSSP) library, buried in pnpm's `.pnpm` store. `electron-builder` doesn't find it.

`electron-rebuild` also fails because pnpm's hoisted store layout doesn't have a `package.json` where it expects one.

The fix is `scripts/rebuild-serialport-bindings.js`, which locates the module in the pnpm store and runs `node-gyp rebuild` directly with Electron's headers.

## How Rebuilds Are Triggered

| Context                              | What Runs            | Targets                                                                               |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------- |
| `pnpm run dev` / `pnpm run dev:mock` | `predev` script      | `electron-builder install-app-deps` + `rebuild-serialport-bindings.js` → Electron     |
| `pnpm run test`                      | `pretest` script     | `pnpm rebuild better-sqlite3 @serialport/bindings-cpp @serialport/bindings` → Node.js |
| `pnpm install`                       | `postinstall` script | `electron-builder install-app-deps` → Electron                                        |

Note: `pretest` rebuilds for Node.js (Vitest runs under Node, not Electron). `predev` rebuilds for Electron. Running tests after dev (or vice versa) may require a rebuild.

## Adding New Native Modules

If you add a new native module as a direct dependency, `electron-builder install-app-deps` will handle it automatically. If it's a transitive dependency hidden in the pnpm store, you may need to add it to `rebuild-serialport-bindings.js` or create a similar script.
