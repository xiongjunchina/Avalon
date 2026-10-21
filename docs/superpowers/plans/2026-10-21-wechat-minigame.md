# WeChat Mini Game Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and upload a WeChat Mini Game client with parity to the current Avalon player UI and administrator UI.

**Architecture:** Keep PostgreSQL and the existing HTTP/WebSocket service authoritative. Add a Canvas-based `apps/minigame` client that shares contracts and pure rules with the web client, and add a separate trusted WeChat authentication path without weakening browser session checks. Gate upload on full feature, network, voice and real-device verification.

**Tech Stack:** TypeScript, Node.js 22.12+, Fastify, PostgreSQL, `esbuild`, WeChat Mini Game APIs, Canvas 2D, WeChat Developer Tools.

**Spec:** `docs/superpowers/specs/2026-10-21-wechat-minigame-design.md`

## Global Constraints

- Baseline is `origin/main` commit `7ccaaa1` or a newer fetched main with differences reviewed before coding.
- Preserve web cookie sessions and Origin/CSRF behavior; do not trust client-supplied OpenID.
- Keep all server secrets, WeChat AppSecret, voice credentials and admin key out of the code package.
- All formal game state comes from the server; practice alone uses the shared local `game-core`.
- Do not upload until true-device HTTPS/WSS, full feature coverage and cross-client voice are proven.
- Do not call an uploaded development version a reviewed or published Mini Game.

## Review Focus

- Reused/expired WeChat login code must fail without logging in as any other account (Task 1).
- Missing `Origin` from a valid mini-game request must not disable web CSRF rejection (Task 2).
- A lost command acknowledgement after vote submission must retry the same `commandId`, never make a second vote (Task 4).
- Backgrounding during private-role display must hide the role on resume until the user opens it again (Task 5).
- Admin operation with an invalid/expired admin key must fail without touching player data (Task 9).

---

## File map

- `apps/server/src/wechat-auth.ts`: WeChat `code2Session` exchange and response validation.
- `apps/server/src/app.ts`: trusted login, mini-game session and socket endpoints; web behavior retained.
- `apps/server/src/store.ts`: associate validated WeChat identity with existing accounts.
- `apps/minigame/src/platform/wechat.ts`: typed WeChat API boundary.
- `apps/minigame/src/net/api.ts`, `socket.ts`: HTTP/session and command transport.
- `apps/minigame/src/ui/*`: Canvas layout, touch controls, text input, safe area, and assets.
- `apps/minigame/src/screens/*`: entry, room, game, practice, friends, account, guide, and admin screens.
- `apps/minigame/src/voice/*`: platform voice adapter and provider integration.
- `apps/minigame/scripts/build.mjs`: mini-game bundle, assets, configuration and size check.
- `apps/minigame/test/*`, `apps/server/test/*`: boundary and feature tests.
- `docs/minigame.md`: configuration, local import, validation, upload and release instructions.

### Task 1: Trusted WeChat identity exchange

**Files:** Create `apps/server/src/wechat-auth.ts`; modify `apps/server/src/app.ts`, `apps/server/src/store.ts`; test `apps/server/test/wechat-auth.test.ts`.

**Interfaces:** `exchangeWechatCode(code: string, config: { appId: string; appSecret: string }, fetcher?: typeof fetch): Promise<{ openid: string; unionid?: string }>`; `POST /api/sessions/minigame` accepts `{ code, nickname? }`, returns `{ user, token }` only after exchange.

- [ ] Test valid exchange, invalid/reused code, upstream failure, and rejection of client-supplied `openid` in `wechat-auth.test.ts`.
- [ ] Run `node --import tsx --test apps/server/test/wechat-auth.test.ts`; expect new tests to fail.
- [ ] Implement exchange and login, then rerun that test; expect pass.
- [ ] Commit with `git add apps/server && git commit -m "feat(server): verify WeChat mini game login"`.

### Task 2: Isolated Mini Game session and socket authentication

**Files:** Modify `apps/server/src/app.ts`; create `apps/server/src/minigame-session.ts`; test `apps/server/test/minigame-session.test.ts`.

**Interfaces:** `Authorization: Bearer <token>` for mini-game HTTP requests; `POST /api/minigame/socket-ticket` returns a short-lived, single-use ticket; `GET /api/rooms/:id/socket?ticket=...` authenticates it. Web requests retain their cookie path.

- [ ] Test valid token, expired token, ticket replay/expiry, wrong room, and missing-Origin mini-game request; separately assert ordinary web POST with a wrong Origin remains `ORIGIN_REJECTED`.
- [ ] Run `node --import tsx --test apps/server/test/minigame-session.test.ts`; expect failure.
- [ ] Implement the dedicated auth branch and ticket validation without relaxing the general hook; rerun and expect pass.
- [ ] Commit the server change.

### Task 3: Importable Mini Game shell

**Files:** Create `apps/minigame/{game.js,game.json,project.config.json,package.json,scripts/build.mjs,src/main.ts,src/platform/wechat.ts,src/ui/canvas.ts}`; modify root `package.json`, `.gitignore`; test `apps/minigame/test/build.test.ts`.

**Interfaces:** `npm run build:minigame` writes an importable project to `dist/minigame`; `WechatPlatform` supplies canvas, storage, request, socket, login, keyboard, audio, lifecycle and share adapters. AppID is supplied locally without committing secrets.

- [ ] Test output includes `game.js`, `game.json`, project config, static assets and no AppSecret/admin key; reject an over-limit package.
- [ ] Run `node --import tsx --test apps/minigame/test/build.test.ts`; expect failure.
- [ ] Implement the smallest canvas shell and build; rerun test and `npm run build:minigame`; expect pass.
- [ ] Import `dist/minigame` in WeChat Developer Tools and capture first-render result; commit shell.

### Task 4: API client and reliable room connection

**Files:** Create `apps/minigame/src/net/{api.ts,socket.ts,session.ts}`; test `apps/minigame/test/{api,socket}.test.ts`.

**Interfaces:** `MiniGameApi.request<T>(path: string, body?: unknown, method?: string): Promise<T>`; `MiniGameRoomConnection` accepts a `RoomView` snapshot callback and `send(command: Command): boolean`; commands carry `commandId` and `expectedVersion` from `packages/contracts`.

- [ ] Test login/refresh, token storage, network timeout, same-command replay after ACK loss, stale snapshot discard, takeover and room closure.
- [ ] Run `node --import tsx --test apps/minigame/test/api.test.ts apps/minigame/test/socket.test.ts`; expect failure.
- [ ] Implement transport and reconnect; rerun and expect pass.
- [ ] Commit transport.

### Task 5: Canvas widgets, privacy and visual foundation

**Files:** Create `apps/minigame/src/ui/{layout,widgets,input,assets,sound,theme}.ts`; test `apps/minigame/test/ui.test.ts`.

**Interfaces:** `renderScreen(model: ScreenModel, canvas: CanvasLike): HitRegion[]`; touch dispatch uses returned hit regions; text input uses platform keyboard; `hideSensitiveView()` clears role/ballot overlays on `onHide`.

- [ ] Test safe-area placement, long-list scrolling, hit targets, keyboard input, hidden private-role state on resume and asset fallback.
- [ ] Run `node --import tsx --test apps/minigame/test/ui.test.ts`; expect failure.
- [ ] Implement reusable widgets and adapted art/audio catalog; rerun and expect pass.
- [ ] Verify small and large phone layouts in Developer Tools; commit UI foundation.

### Task 6: Entry, account and lobby parity

**Files:** Create `apps/minigame/src/screens/{entry,lobby,settings}.ts`; test `apps/minigame/test/lobby.test.ts`.

**Interfaces:** Screens consume `MiniGameApi`, `MiniGameRoomConnection` and `RoomView`; settings use exact `Settings`/`defaultSettings` from `packages/contracts` including `guardianPerksEnabled`.

- [ ] Test create/join by code or invite, profile display, switch/logout, all settings toggles, readiness, host admission/kick, leave and re-entry.
- [ ] Run `node --import tsx --test apps/minigame/test/lobby.test.ts`; expect failure.
- [ ] Implement the screens and server commands; rerun and expect pass.
- [ ] Test one web player and one mini-game player in the same waiting room; commit.

### Task 7: Complete multiplayer game screen

**Files:** Create `apps/minigame/src/screens/{game,role,round,result}.ts`; test `apps/minigame/test/game-screen.test.ts`.

**Interfaces:** Render all `GameView.phase` cases; send only contract `Command` actions; render `self` fields solely for the authenticated player.

- [ ] Test all phases, 5/12-seat layouts, role privacy, guardian clue, team draft, direction, abstain, mission vote, inspection, both assassinations, abort and rematch.
- [ ] Run `node --import tsx --test apps/minigame/test/game-screen.test.ts`; expect failure.
- [ ] Implement phase-specific views and action guards; rerun and expect pass.
- [ ] Run a full multi-client game with current web client and mini-game; commit.

### Task 8: Practice, guide, friends and account parity

**Files:** Create `apps/minigame/src/screens/{practice,guide,friends,chat,account,replay,presets}.ts`; test `apps/minigame/test/player-extras.test.ts`.

**Interfaces:** Practice uses `createGame`/`transition` from `@avalon/game-core`; other screens use existing `/api` routes and contract payloads.

- [ ] Test practice bot turns and no formal-history write, guide rules, friend request/accept/invite, room and direct chat, stats/history/favourites/replay, presets, profile edit and redemption.
- [ ] Run `node --import tsx --test apps/minigame/test/player-extras.test.ts`; expect failure.
- [ ] Implement screens and notifications; rerun and expect pass.
- [ ] Compare each screen to current web behavior and commit.

### Task 9: Administrator screen parity

**Files:** Create `apps/minigame/src/screens/admin/{auth,overview,users,rooms,games,codes,settings}.ts`; test `apps/minigame/test/admin.test.ts`.

**Interfaces:** `AdminApi` sends `x-admin-key` only after interactive entry, keeps it in process memory only, and clears it on unauthorized response/backgrounding. All writes use existing server admin routes.

- [ ] Test invalid key and expiry, destructive-action confirmation, overview, strategy, users, bans, VIP, room closure, game replay, codes and announcement.
- [ ] Run `node --import tsx --test apps/minigame/test/admin.test.ts`; expect failure.
- [ ] Implement administrator screens and session clearing; rerun and expect pass.
- [ ] Verify writes against disposable test data, then commit.

### Task 10: Voice compatibility and media

**Files:** Create `apps/minigame/src/voice/{adapter,provider}.ts`; modify server token endpoint only if selected SDK requires it; test `apps/minigame/test/voice.test.ts` and relevant server tests.

**Interfaces:** `VoiceAdapter.join(roomId: string, userId: string): Promise<void>`, `mute`, `deafen`, `leave`, and status subscription. Provider must interoperate with the web client's existing room voice or include an approved cross-client replacement.

- [ ] Verify current official SDK support, account/permission needs and cost for a real WeChat Mini Game; record the chosen provider and required domains in `docs/minigame.md`.
- [ ] Test token scoping, room join/leave, mute, deafen, speaker state, background cleanup and denied microphone permission; expect failure before implementation.
- [ ] Implement provider and run voice tests; expect pass.
- [ ] Verify web ↔ mini-game voice on real devices; commit only after result is recorded. Missing SDK/permission keeps upload blocked.

### Task 11: Full validation and upload

**Files:** Create `docs/minigame.md` and `apps/minigame/test/parity.test.ts`; update root `README.md` after verified behavior.

**Interfaces:** A feature checklist maps every web player/admin capability to mini-game screen, test and real-device result. Build output records source commit, app version and server compatibility.

- [ ] Write parity checklist and missing-feature test; run it and fix gaps until pass.
- [ ] Run `npm run typecheck`, relevant server/client tests, `npm run build`, `npm run build:minigame`; record outputs.
- [ ] Verify production server revision/API, HTTPS/WSS whitelist with bypass disabled, actual AppID login and two-platform phones; record a 5–12-player full-round acceptance path and administrator operations.
- [ ] Configure Developer Tools CLI service port and confirm correct login/AppID, then preview and upload a version using `cli.bat upload --project <dist/minigame> --version <version> --desc <description>`; save upload receipt.
- [ ] Document remaining WeChat review/publication steps and commit validation docs. If any gate fails, report the exact blocker and leave the version unuploaded.
