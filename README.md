# API Config Editor

A powerful Electron-based desktop application to manage, edit, and synchronize API configuration files (especially `appsettings.*.json` files) across multiple .NET/API projects, with advanced PowerShell-driven package management and Git integration.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [Usage Guide](#usage-guide)
  - [Selecting a Root Folder](#selecting-a-root-folder)
  - [Navigating Projects & Files](#navigating-projects--files)
  - [Editing JSON Configurations](#editing-json-configurations)
  - [Decrypting/Encrypting Values](#decryptingencrypting-values)
  - [Copying PostgreSQL Configurations](#copying-postgresql-configurations)
  - [Syncing Files Across Projects](#syncing-files-across-projects)
  - [Git Integration: Discarding Changes](#git-integration-discarding-changes)
  - [Package Management (PowerShell)](#package-management-powershell)
- [End-to-End Example Workflow](#end-to-end-example-workflow)
- [Troubleshooting](#troubleshooting)
- [License & Credits](#license--credits)

---

## Features

- **Project-Aware File Tree**: Auto-discovers and categorizes `appsettings.*.json` files by project and environment.
- **JSON Editor**: Intuitive form-based editor for JSON configs, with type-aware fields and validation.
- **Encrypted Value Support**: Decrypt and securely edit encrypted fields (e.g., `AppSettingvalue`) with easy re-encryption.
- **PostgreSQL Config Copy**: 1-click copy of PostgreSQL connection settings across environments.
- **Sync Across Projects**: Propagate config changes to identical files in other projects.
- **Git Integration**: Discard changes to config files (current repo or all repos).
- **PowerShell Package Management**: Validate solution structure and replace package references across multiple projects using advanced PowerShell automation, including simulation (What-If) mode.
- **Dark Mode**: Modern UI with light/dark mode toggle.
- **Persistent Session**: Remembers last opened folder and restores UI state.
- **Robust Error Handling**: Handles malformed JSON, missing files, and permission issues gracefully.

---

## Installation

### Prerequisites

- **Node.js** (>=16.0.0)
- **npm** (>=8.0.0)
- **Windows** (PowerShell package management is designed for Windows)
- **.NET-based Projects** for full feature set

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/hardikkanajariya/panel.git
cd panel

# 2. Install dependencies
npm install

# 3. Start the app
npm start
```

> **Build for Windows:**  
> `npm run build`

---

## Getting Started

1. **Launch the App.**
2. **Select Root Folder:** Click "Select Root Folder" and choose your main projects directory (containing API/Community projects).
3. **Browse Files:** Explore the generated sidebar file tree; select any `appsettings.*.json` to edit.
4. **Make Changes:** Edit values, decrypt/encrypt secrets, or copy configs as needed.
5. **Save & Sync:** Save your changes, propagate to other projects, or discard via Git as required.

---

## Core Concepts

- **Root Folder:** The parent directory containing all your API projects and optionally a `Community` directory.
- **Hierarchy Detection:** The app groups files by their containing project, attempts to detect environments (dev, prod, staging, etc.), and shows them in a logical hierarchy.
- **Encrypted Values:** The app uses your `.env` settings to call external APIs for encrypting/decrypting sensitive values.
- **PowerShell Automation:** Handles solution-level package reference validation and migration.

---

## Usage Guide

### Selecting a Root Folder

- Click **"Select Root Folder"**.
- The app scans for API/Community projects and all `appsettings.*.json` files.
- Progress is shown as directories are scanned.

### Navigating Projects & Files

- The sidebar groups all found files by project and environment.
- Click any file to load it into the main editor.

### Editing JSON Configurations

- The editor displays a type-aware form for each config value.
- Type-specific fields: checkboxes (bool), numeric inputs, text, textareas, etc.
- All changes are tracked; unsaved changes can be reset.

### Decrypting/Encrypting Values

- Encrypted fields (e.g., `AppSettingvalue`) have a lock icon.
- Click to open a modal for decryption.
- Edit the decrypted JSON (form or raw view), then re-encrypt before saving.

### Copying PostgreSQL Configurations

- On Dev environment files, a "Load PostgreSQL Config" button is enabled.
- Copies the `AppSettingvalue` from a matching PostgreSQL file in the same directory.
- User confirmation is requested before overwriting values.

### Syncing Files Across Projects

- Use "Sync Across Projects" to propagate the current config file to all matching files in sibling projects.
- Select which files to update in a confirmation dialog.

### Git Integration: Discarding Changes

- "Discard from Git" allows you to revert changes to appsettings files using `git checkout`.
- You can choose to discard only in the current repo or across all detected repos.

### Package Management (PowerShell)

- **Validate Structure**: Verifies the existence and correctness of project/infrastructure directories and solutions.
- **Replace Packages**: Replaces NuGet package references with local project references across solutions.
  - Choose all, just Community, just APIs, or custom projects.
  - Simulation mode ("What-If") shows planned changes without making them.
  - Actual mode applies changes directly.

---

## End-to-End Example Workflow

1. **Update a Connection String**
    - Select your API's root folder.
    - Find and select `appsettings.Development.json` of a project.
    - Decrypt the `AppSettingvalue`, update a DB connection, re-encrypt, and save.

2. **Propagate Changes**
    - Click "Sync Across Projects" to apply this config to all API projects with the same file.

3. **Validate Solution Structure**
    - Use "Validate Structure" to check that all projects/solutions are set up correctly.

4. **Migrate to Project References**
    - Use "Replace Packages" (What-If, then actual) to switch from NuGet to local project references for infrastructure packages.

5. **Rollback Mistakes**
    - Use "Discard from Git" to revert unwanted changes to config files.

---

## Troubleshooting

- **JSON Parse Errors:** Malformed files are shown in raw view with error details. Fix formatting and reload.
- **Missing PowerShell Output:** Ensure you have PowerShell installed and accessible in your PATH.
- **API Not Working (Encryption/Decryption):** Verify your `.env` file is correct and the API server is accessible.
- **Permission Denied:** Run the app as administrator if needed for file system or Git operations.

---

## License & Credits

- MIT License
- Made with ❤️ by [Hardik Kanjariya](https://github.com/hardikkanajariya)

---
