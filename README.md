# PromptOps Manager OSS

A minimal, open-source desktop app for managing AI CLI terminal sessions and prompts. Built with Electron, xterm.js, and zero cloud dependencies.

![PromptOps Manager](src/assets/logos/logo-full.png)

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

## Features

### Terminal Sessions
- Create sessions with Claude Code CLI, OpenAI Codex, or Gemini CLI
- Each session spawns a real PTY process via `node-pty`
- Full xterm.js terminal with GitHub Dark theme, 5000-line scrollback
- Tab-based session switching, rename, close
- Workspace-aware: sessions inherit the selected folder as CWD

### Sub-Agents
- Spawn sub-agents from the Action Center sidebar
- 6 execution modes with behavioral config injection (reasoning depth, verbosity, exploration, speed, risk)
- Quick agent presets: Security, Tests, Review, Docs, Refactor, Performance
- Split/Tab/Grid layout modes for multiple agents
- Prompt injection uses Bracketed Paste Mode (same technique as the main PromptOps Manager app)

### Prompt Catalog
- Create, edit, delete prompts (stored in `~/.promptops/prompts.json`)
- Inject any prompt into the active session with one click
- Select a prompt as initial input when creating a new session

### Action Center (Right Sidebar)
- Mode selector (6 presets with per-field config)
- Sub-agent spawn form (provider + prompt)
- Quick agent buttons
- Active agents list with status
- Prompt Slots — saved prompts for fast injection or agent spawning

### Git Panel
- Branch display, pull, push, refresh
- File status with staged/unstaged indicators
- Stage All + Commit with message
- AI commit message generation (sends prompt to active session)

### Assets Panel
- Upload files to `.promptops-assets/` in the workspace
- Image preview (base64 thumbnails)
- AI actions: Analyze, Debug, Explain (injects prompts into active session)

### Token Efficiency
- Bottom bar showing: Used | Baseline | Saved | Efficiency%
- Click for detailed modal with breakdown and optimization engine stats
- Per-session token tracking

### Session Creation Modal
- Session name, provider selection
- Workspace picker with folder selector
- Code mapping: automatic directory tree scanning
- Advanced settings (cols/rows)

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- At least one AI CLI tool installed:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) → `npm install -g @anthropic-ai/claude-code`
  - [OpenAI Codex](https://github.com/openai/codex) → `npm install -g @openai/codex`
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) → `npm install -g @anthropic-ai/gemini-cli`

### Install & Run

```bash
# Clone the repo
git clone git@github.com:shellonback/promptops-manager-oss.git
cd promptops-manager-oss

# Install dependencies
npm install

# Rebuild node-pty for Electron
npx electron-rebuild

# Launch
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
# Make sure you have build tools
xcode-select --install  # macOS
# Then rebuild
npx electron-rebuild
```

**Provider not found:**
Make sure the CLI tool is installed globally and available in your PATH:
```bash
which claude   # should return a path
which codex    # should return a path
which gemini   # should return a path
```

## Project Structure

```
promptops-manager-oss/
├── electron/
│   ├── main.js          # Electron main process (PTY, IPC, Git, Assets)
│   └── preload.js       # Context bridge (secure API)
├── src/
│   ├── index.html       # UI layout
│   ├── styles.css       # All styles (glass UI, dark theme)
│   ├── app.js           # Frontend logic (sessions, agents, prompts, git, assets, tokens)
│   └── assets/logos/    # Logo files
├── scripts/
│   └── build.js         # esbuild bundler + asset copy
├── .promptops/          # Local storage (prompts, slots)
├── package.json
└── README.md
```

## Tech Stack

- **Electron** — desktop shell
- **node-pty** — pseudo-terminal for spawning CLI processes
- **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) — terminal emulator
- **esbuild** — JS bundler (dev dependency)
- **Tabler Icons** — icon set (loaded via CDN)
- **Inter** — UI font (loaded via Google Fonts)

## Storage

All data is stored locally:

- **Prompts**: `~/{userData}/.promptops/prompts.json`
- **Prompt Slots**: `~/{userData}/.promptops/slots.json`
- **Session Assets**: `{workspace}/.promptops-assets/`

No data is sent to any server.

## How Sub-Agent Injection Works

When you spawn a sub-agent, the app:

1. Builds a **mode preamble** based on the selected mode (e.g., Sprint, Architect)
2. Prepends it to your prompt
3. Spawns a new PTY process for the selected provider
4. Waits **2000ms** for the CLI to initialize
5. Injects the full prompt using **Bracketed Paste Mode** (`\x1b[200~` ... `\x1b[201~`)
6. Sends **Enter** (`\r`) after a **300ms** delay

This ensures multi-line prompts are treated as a single atomic paste, preventing premature submission.

## License

MIT

## Credits

Built by [Shellonback](https://shellonback.com) — powered by [PromptOps](https://promptops.it).
