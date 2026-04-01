# PromptOps Manager OSS

```
 ____                            _    ___
|  _ \ _ __ ___  _ __ ___  _ __ | |_ / _ \ _ __  ___
| |_) | '__/ _ \| '_ ` _ \| '_ \| __| | | | '_ \/ __|
|  __/| | | (_) | | | | | | |_) | |_| |_| | |_) \__ \
|_|   |_|  \___/|_| |_| |_| .__/ \__|\___/| .__/|___/
                           |_|             |_|
                    ╔══════════════════════════╗
                    ║     Manager OSS v1.0     ║
                    ╚══════════════════════════╝
              powered by ShellOnBack · promptops.it
```

A minimal, open-source desktop app for managing AI CLI terminal sessions and prompts. Built with Electron, xterm.js, and zero cloud dependencies.

---

## What it does

PromptOps Manager OSS gives you a single desktop app to:

- **Run AI CLI tools** (Claude Code, OpenAI Codex, Gemini CLI) in managed terminal sessions
- **Spawn sub-agents** with configurable execution modes (Sprint, Architect, Detective, Refactor, Paranoid, Minimal)
- **Manage a prompt catalog** — save, edit, and inject prompts into any active session
- **Track token efficiency** — real-time estimation of token usage, baseline, and savings
- **Git integration** — view status, stage, commit (with AI message generation), pull, push
- **Asset management** — upload files, preview images, trigger AI analysis/debug/explain
- **Code mapping** — automatic workspace scanning when creating sessions

Everything runs locally. No backend, no cloud, no authentication.

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- At least one AI CLI tool installed:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`
  - [OpenAI Codex](https://github.com/openai/codex) — `npm install -g @openai/codex`
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `npm install -g @google/gemini-cli`

### Install & Run

```bash
git clone git@github.com:shellonback/promptops-manager-oss.git
cd promptops-manager-oss
npm install
npx electron-rebuild
npm start
```

That's it. The app opens and you can:

1. Click **Open Folder** to select a workspace
2. Click **+ New** in Sessions to create a terminal session
3. Pick a provider, optionally select an initial prompt, hit **Start Session**
4. Type in the terminal or inject prompts from the sidebar

### Troubleshooting

**`node-pty` build fails:**
```bash
xcode-select --install  # macOS — install build tools
npx electron-rebuild     # then rebuild
```

**Provider not found:**
```bash
which claude   # should return a path
which codex
which gemini
```

---

## Features

### Terminal Sessions
- Create sessions with Claude Code CLI, OpenAI Codex, or Gemini CLI
- Each session spawns a real PTY process via `node-pty`
- Full xterm.js terminal with GitHub Dark theme, 5000-line scrollback
- Tab-based session switching, rename, close
- Workspace-aware: sessions inherit the selected folder as CWD

### Sub-Agents
- Spawn sub-agents from the Action Center sidebar
- 6 execution modes with behavioral config injection:
  - **Sprint** — low reasoning, max speed, medium risk
  - **Architect** — max reasoning, structured output, low speed
  - **Detective** — high reasoning, focused exploration, zero risk
  - **Refactor** — medium reasoning, structured output, low risk
  - **Paranoid** — max reasoning, extreme exploration, zero risk
  - **Minimal** — low reasoning, zero verbosity, max speed
- Quick agent presets: Security, Tests, Review, Docs, Refactor, Performance
- Split/Tab/Grid layout modes for multiple agents
- Prompt injection uses **Bracketed Paste Mode** (same technique as the main PromptOps Manager app)

### Prompt Catalog
- Create, edit, delete prompts (stored locally)
- Inject any prompt into the active session with one click
- Select a prompt as initial input when creating a new session

### Action Center (Right Sidebar)
- Mode selector (6 presets with per-field config)
- Sub-agent spawn form (provider + prompt)
- Quick agent buttons
- Active agents list with status indicators
- Prompt Slots — saved prompts for fast injection or agent spawning
- Hidden when no session/workspace is active

### Git Panel
- Branch display, pull, push, refresh
- File status with staged/unstaged indicators
- Stage All + Commit with message
- AI commit message generation (sends prompt to active session)

### Assets Panel
- Upload files to `.promptops-assets/` in the workspace
- Image preview (base64 thumbnails)
- AI actions: Analyze, Debug, Explain (injects prompts into active session)
- Open assets folder in Finder

### Token Efficiency
- Bottom bar showing: Used | Baseline | Saved | Efficiency%
- Click for detailed modal with breakdown tables and optimization engine stats
- Per-session token tracking and history

### Session Creation Modal
- Session name, provider selection
- Workspace picker with folder selector
- Code mapping: automatic directory tree scanning (ignores node_modules, .git, etc.)
- Initial prompt selection from saved prompts
- Advanced settings (cols/rows)

---

## How Sub-Agent Injection Works

When you spawn a sub-agent, the app replicates the exact flow from the main PromptOps Manager:

1. Builds a **mode preamble** based on the selected mode (behavioral instructions)
2. Prepends it to your prompt
3. Spawns a new PTY process (120x24) for the selected provider
4. Waits **2000ms** for the CLI to initialize
5. Injects the full prompt using **Bracketed Paste Mode** (`\x1b[200~` ... `\x1b[201~`)
6. Sends **Enter** (`\r`) after a **300ms** delay

This ensures multi-line prompts are treated as a single atomic paste, preventing premature submission.

---

## Project Structure

```
promptops-manager-oss/
├── electron/
│   ├── main.js          # Main process: PTY spawn, BPM injection, Git, Assets, Code mapping
│   └── preload.js       # Context bridge (secure API exposure)
├── src/
│   ├── index.html       # UI layout (all panels)
│   ├── styles.css       # All styles (glass UI, dark theme, 1500 lines)
│   ├── app.js           # Frontend logic (sessions, agents, prompts, git, assets, tokens)
│   └── assets/logos/    # Logo files
├── scripts/
│   └── build.js         # esbuild bundler + asset copy
├── package.json
└── README.md
```

## Tech Stack

| Component | Technology |
|---|---|
| Desktop shell | Electron |
| Terminal emulator | xterm.js (`@xterm/xterm` + `@xterm/addon-fit`) |
| PTY | node-pty |
| Bundler | esbuild |
| Icons | Tabler Icons (CDN) |
| Font | Inter (Google Fonts) |

## Storage

All data is stored locally:

| Data | Location |
|---|---|
| Prompts | `~/Library/Application Support/promptops-manager-oss/.promptops/prompts.json` |
| Prompt Slots | `~/Library/Application Support/promptops-manager-oss/.promptops/slots.json` |
| Session Assets | `{workspace}/.promptops-assets/` |

No data is sent to any server. Ever.

---

## License

MIT

## Credits

Built by [ShellOnBack](https://shellonback.com) — powered by [PromptOps](https://promptops.it).
