# Developer Documentation – API Config Editor

This document provides technical details for contributors and maintainers, covering the code structure, main modules, IPC methods, PowerShell scripts, extensibility, and key logic.

---

## Table of Contents

- [Directory Structure](#directory-structure)
- [Main Technologies](#main-technologies)
- [Architecture Overview](#architecture-overview)
- [Main Modules](#main-modules)
  - [main.js (Electron Main Process)](#mainjs-electron-main-process)
  - [script.js (Renderer Process)](#scriptjs-renderer-process)
  - [powershell-scripts.js](#powershell-scriptsjs)
- [IPC Handlers & Methods](#ipc-handlers--methods)
- [PowerShell Script Workflows](#powershell-script-workflows)
- [Encryption/Decryption Flow](#encryptiondecryption-flow)
- [Sync & Git Integration](#sync--git-integration)
- [Adding Features / Extending](#adding-features--extending)
- [Error Handling & Logging](#error-handling--logging)

---

## Directory Structure

```
.
├── main.js                # Electron main process code (backend, IPC, FS, PowerShell)
├── script.js              # Renderer process JS (UI logic, events, IPC calls)
├── index.html             # UI: Bootstrap + custom elements
├── style.css              # Custom styles (not shown here)
├── powershell-scripts.js  # Embedded PowerShell scripts as JS strings
├── package.json           # App metadata and scripts
├── .env                   # API credentials for encryption/decryption
└── ...
```

---

## Main Technologies

- **Electron**: Desktop shell (Chromium + Node.js)
- **Bootstrap**: UI layout and modals
- **Node.js**: File system, child process, HTTP(S)
- **PowerShell**: Project/package management
- **dotenv**: Environment variables for API keys
- **form-data**: For multipart encryption API calls

---

## Architecture Overview

- **main.js** – Electron main process: handles file system operations, invokes PowerShell, manages encryption API calls, and exposes IPC handlers for the renderer.
- **script.js** – Renderer process: UI event handlers, dynamic DOM, form rendering, user workflows, and calls IPC methods to interact with backend.
- **powershell-scripts.js** – Contains PowerShell scripts as JS strings for validation and package replacement.
- **index.html** – Loads renderer code, Bootstrap, and root UI markup.

---

## Main Modules

### main.js (Electron Main Process)

- **Window Management**: Initializes and restores app state.
- **IPC Handlers**:
  - File operations: Get, save, update files
  - Directory scanning: Recursive file/project discovery
  - PowerShell Execution: Validates structure, replaces packages
  - Encryption/Decryption: Calls external HTTP API using credentials from `.env`
  - Git Operations: Uses `git` CLI to discard changes, find repo roots, and list tracked files
- **Helper Functions**:
  - `parseJSONWithComments`: Robust parsing of JSON files with comments/trailing commas
  - `findFilesRecursivelyByName/ByFilter`: Efficient recursive directory/file traversal
  - `executePowerShellScript`: Writes scripts to temp files and spawns PowerShell with parameters

### script.js (Renderer Process)

- **UI Elements**: Handles sidebar, file tree, modals, forms, and toasts.
- **Dynamic Form Rendering**: Converts JSON objects into editable forms with type-aware fields.
- **Change Tracking**: Tracks unsaved changes and propagates to backend for saving.
- **Encryption Modal**: Decrypts, renders, and re-encrypts sensitive values.
- **PostgreSQL Copy**: Automated copying of DB config between environments.
- **Sync Across Projects**: Finds all files with the same name and updates them.
- **Git Integration**: Discards changes in-appsettings files, grouped by repo.
- **PowerShell Integration**: Triggers validation and package replacement workflows.
- **Dialogs & Modals**: Uses Bootstrap modals for confirmation, selection, and output.

### powershell-scripts.js

- **replacePackageReferences**: Main automation script for replacing NuGet package refs with local project refs, with selection and simulation modes.
- **validateStructure**: Checks for expected directories, solution files, and .csproj files, outputs colored results.
- **Helpers**: Functions for directory selection, relative path computation, and project reference editing.

---

## IPC Handlers & Methods

Main communication between renderer and backend is via IPC. Core handlers:

- `get-file`, `save-file`, `update-file`, `read-file`: File CRUD
- `get-file-content`: Returns both raw and cleaned JSON for display/parsing
- `get-directory-files`: List files in a directory
- `find-matching-files`: Recursively finds files matching a given name, one level up
- `find-git-repositories`, `find-git-appsettings`, `get-git-root`, `discard-git-changes`: Git integration
- `validate-project-structure`, `replace-package-references`, `get-available-directories`: PowerShell package management
- `decrypt-value`, `encrypt-value`: Encryption API calls

All handler results are returned as structured JSON objects.

---

## PowerShell Script Workflows

### 1. Validate Structure

- Checks for existence of project folders, infrastructure, and solution files.
- Lists all found API/Community/infrastructure projects.
- Outputs color-coded status (OK, WARNING, ERROR).

### 2. Replace Package References

- Discovers all projects and their package references.
- For each, removes NuGet package references and adds local project references (to .csproj files).
- Adds infra projects to solution files as needed.
- Simulation mode (`-WhatIf`) previews changes.
- Supports All, Community, APIs, or custom selection.

---

## Encryption/Decryption Flow

- **.env** contains `CLIENT_SECRET` and `API_URL`.
- When decrypting, main process:
  1. Obtains auth token via `/api_integration/Authentication/Token` (POST).
  2. Decrypts/encrypts value via `/api_master/DataProtection/DecryptData` or `/EncryptData` (with Bearer token).
- Renderer opens modal, fetches decrypted value, displays as form or raw JSON, then re-encrypts and updates the main form.

---

## Sync & Git Integration

- **Sync Across Projects:**  
  - Finds all files with same name across sibling projects (using recursive search, one level up).
  - User selects files to update; app writes current JSON to all selected files.

- **Discard from Git:**  
  - Locates Git repo root (directory or via `git rev-parse`).
  - Lists all `appsettings.*.json` files tracked by Git.
  - User selects which files to discard.
  - Calls `git checkout -- <files>` to revert changes.

---

## Adding Features / Extending

- **Add New IPC Handler**
  1. In `main.js`, add new `ipcMain.handle` or `.on` block.
  2. In `script.js`, call via `ipcRenderer.invoke` or `.send`.
  3. Update UI as needed.

- **Add/Edit PowerShell Workflow**
  1. Edit scripts in `powershell-scripts.js`.
  2. Update handler in `main.js` to use new/modified script and parameters.
  3. Expose new UI controls as needed in `index.html` and `script.js`.

- **Add New File Type or Feature**
  1. Update `findFilesRecursivelyByFilter` and file tree building logic in `main.js` and `script.js`.
  2. Extend renderer form rendering for new field types or behaviors.

---

## Error Handling & Logging

- All IPC handlers are wrapped in try/catch blocks, returning structured error messages.
- Renderer shows toasts and alerts for errors.
- PowerShell script errors are captured and shown in the output modal.
- Malformed JSON is detected and raw view is presented.

---

**Contributions welcome!**  
For questions, file an issue or contact the maintainer.

---
