# 🐙 Polpo Control Panel

> Wrapper multi-agente per Claude Code — gestisci N sessioni parallele da un'unica finestra, con voice briefing Jarvis e spawn esterno via webhook/Telegram.

```
         _____      _
        |  _  |___ | | ___   ___
        |   __| . || || . | / . \
        |__|   |___||_||  _| \___/
                         |_|
         🐙 Control Panel · v0.1.0-alpha
```

## Cosa fa

**Polpo Control Panel** è un desktop wrapper Electron che trasforma Claude Code da "un terminale con una sessione" a "N agenti paralleli con status vivo".

- 🧠 **Multi-agente**: tab paralleli, ognuno una sessione CC indipendente
- 🟢 **Status detector**: running / input-needed / done / stuck
- 🎙️ **Voice briefing** (Sprint 5): Jarvis avvisa quando un agente aspetta input
- 🌐 **Spawn esterno** (Sprint 4): webhook HTTP + Telegram Bridge aprono tab da fuori
- 🗂️ **Asset management**: drop file in `.polpo-assets/`, l'agente li analizza/debugga/spiega
- 🎛️ **Execution modes**: Sprint, Architect, Detective, Refactor, Paranoid, Minimal
- 🌓 **Zero cloud**: tutto locale, niente telemetria, niente login

## Filosofia

> *Il terminale è il motore. Il wrapper è il prodotto.*

Il Game Boy Advance SP è un wrapper fisico di un terminale — non mostri i circuiti, mostri Pokémon. Questo prodotto non mostra stdin/stdout, mostra obiettivi e stato.

## Stack

- **Electron 33** — shell desktop
- **xterm.js** — render terminale
- **node-pty** — spawn pseudo-TTY
- **esbuild** — bundling

## Sviluppo

```bash
git clone git@github.com:mattiacalastri/promptops-manager-oss.git polpo-control-panel
cd polpo-control-panel
npm install
npm run dev
```

Richiede **Node 20+** e **Claude Code CLI** installato in PATH.

## Origine

Fork MIT di [`shellonback/promptops-manager-oss`](https://github.com/shellonback/promptops-manager-oss) — ringraziamenti al team PromptOps / Luca Mangiacotti per aver rilasciato la base sotto MIT.

Il layer soul (voice briefing, Telegram integration, multi-agent orchestration, Polpo identity) è proprietario di Astra Digital.

## Roadmap

Vedi [`../TUI_SPRINT.md`](../TUI_SPRINT.md) per il backlog AGILE corrente.

| Sprint | Nome | Status |
|--------|------|--------|
| 1 | Fork & Boot | ✅ |
| 2 | Single PTY Tab | ⏳ |
| 3 | Multi-tab + Status Detector | ⏳ |
| 4 | External Spawn (Webhook + TG) | ⏳ |
| 5 | Voice Alert + Polish v1 | ⏳ |

## Licenza

MIT — come l'upstream.

## Autore

Mattia Calastri · [mattiacalastri.com](https://mattiacalastri.com) · Astra Digital
