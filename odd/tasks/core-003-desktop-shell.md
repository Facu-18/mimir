# CORE-003 — Tauri desktop shell

Objective: an installable Windows app that opens without a browser, starts the local API, keeps data across restarts and leaves no orphan processes.
Branch: `feat/core-003-desktop-shell` · Delivery: `single-pr`, the per-ticket pattern used so far · Test runners: Vitest (`apps/api`), Playwright (`apps/web`), `cargo test` (`apps/desktop/src-tauri`).

## Specs

- **S1** — CORE-003: "integrar build exportable y backend local, resolver empaquetado/runtime, ventana, rutas de datos e instalador Windows."
- **S2** — Acceptance: "app instalable abre sin navegador; API local disponible; persiste tras reinicio; cierre normal no deja procesos huérfanos; documenta necesidad de PostgreSQL."
- **S3** — Tests: "máquina limpia, instalación/reapertura, puerto ocupado, backend no disponible, reinicio del SO."
- **S4** — Plan §2: "NestJS corre como servicio local independiente, empaquetado o administrado según el sistema operativo. **No asumir** que Tauri distribuye automáticamente Node y PostgreSQL: crear y validar una estrategia reproducible de instalador, runtime y base local. La V1 puede requerir PostgreSQL instalado/configurado, y debe declarar ese requisito con claridad."
- **S5** — Plan §4: "API escuchando en loopback; CORS restringido y protección frente a llamadas locales no autorizadas (por ejemplo token de sesión app/backend)."
- **S6** — Plan §10: "**Portabilidad:** no acoplar dominio a Windows ni a Tauri."

Out of scope: screens calling the API (their own tickets); bundling PostgreSQL (declined by the user); code signing, auto-update and release QA (SYS-003).

Assumptions (decided here, not in the plan, except A1):
- A1 (user decision, see L2): PostgreSQL is an external prerequisite. The app connects to an existing server (Windows service or Docker) through a connection URL and shows a clear screen when it cannot.
- A2: The installer carries a pinned portable `node.exe` and a production copy of the API. The user installs no Node.
- A3: The API listens on port 0, and prints its real port once listening. The shell reads it from stdout, so an occupied port cannot affect the app, and there is no gap between picking a port and binding it.
- A4: On each launch the shell generates a random session token and passes it to the API by environment. With a token set, every API route requires it and CORS allows only the app's origin. With no token set (`pnpm api:dev`, tests) behavior stays as it is today.
- A5: The shell owns the API process through a Windows Job Object with kill-on-close, so the API dies with the shell even after a crash. Other systems use a plain kill on exit.
- A6: Migrations run with `prisma migrate deploy` before the API starts. A failure leaves the API stopped and the app on the database screen, with credentials removed from the message.
- A7: Data paths come from Tauri: the connection URL in the app config directory, assets and logs in the app data and log directories. The file is protected only by the user profile's permissions.
- A8: No shell plugin. The Rust side starts only its own bundled `node.exe` with fixed arguments and passes values through the environment, so the UI cannot run anything arbitrary.
- A9: The installer is NSIS, per user, with no administrator rights.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S4, S5 | inline | done | RED 14 of 18 → GREEN; API e2e 214/214, unit 39/39; manual run on port 0 printed the port, 401 without token, 503 without database · `559ac51` |
| T2 | S1, S4 | inline | done | `prepare-runtime` produced Node v24.19.0 (checksum verified) and the API copy with no `.env`; migrations from the copy created a throwaway database, then reported nothing pending; wrong password and closed port fail without showing the password · packaging commit |
| T3 | S1, S2, S3, S6 | inline | paused | Code and 14 supervisor tests written, never compiled: Smart App Control blocks the build (L4). Draft kept on local branch `wip/core-003-tauri-shell` |
| T4 | S2, S3 | inline | done | RED 17 of 19 → GREEN; browser 98/98; mutation that unmounts the app on a later failure fails its test · gate commit |
| T5 | S1, S2, S3 | inline | paused | NSIS installer, smoke test against the installed app, docs and ADR |

Route evidence: sequential units that depend on each other; no parallel writer reason; inline.
Risk: item 1 (migrations applied to the user's database), item 2 (session token, CORS, stored connection URL), item 4 (process lifecycle), item 5 (installer and dependencies). Independent verifier at the feature's end.

## Log

- L1 (2026-11-05, user): "listo master vamos con core-003"
- L2 (2026-11-05, user): on PostgreSQL, chose "Requisito externo": the app connects to an existing PostgreSQL through a connection URL, applies migrations and shows a clear screen when it cannot find it.
- L3 (2026-11-05, user): chose to let the agent install the toolchain. Rust 1.99.1 with `stable-x86_64-pc-windows-msvc` is installed through winget. The first attempt at the Visual Studio C++ workload failed with exit code 87 (`--wait` is not an option of `setup.exe modify`) and was relaunched without it.
- L4 (2026-11-05): The second attempt exited with 5007 because `--passive` needs elevation from the start; the third, elevated through UAC, installed MSVC 14.51 and SDK 10.0.26100. The first Rust build then failed with "An Application Control policy has blocked this file. (os error 4551)": Smart App Control is on (`VerifiedAndReputablePolicyState` = 1) and blocks every unsigned build script and proc-macro DLL. It would also block the unsigned installer on this machine. User decision: "Lo apago yo". T3 and T5 wait for it.
- L5 (2026-11-05): Findings on the way. `pnpm deploy` copies `apps/api/.env`, so the script copies a fixed list and refuses any `.env` file. Prisma's CLI and `dotenv` moved to API dependencies because migrations run in the installed app. The runtime copy is 392 MB in 12,654 files and takes about 6 minutes to prepare; installer size is measured in T5. The gate test first failed for a race in the test (it marked the page before the first status replaced the static render), not for a remount.
- L6 (2026-11-06, user): "no puedo apagarlo porque para volverlo a activar debo restablecer el equipo". Then: "bien sigamos lo retomamos en sys-003 que sigue ahora?" CORE-003 is paused with T1, T2 and T4 done; T3 and T5 resume in SYS-003, which also brings signing. The uncompiled Tauri draft lives on local branch `wip/core-003-tauri-shell`, so this branch holds only verified work. Resume options recorded: a Hyper-V Windows VM (also the clean machine the plan asks for) or a CI build.
