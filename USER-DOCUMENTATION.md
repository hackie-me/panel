# API Config Editor - User Guide

Welcome to the **API Config Editor**! This guide will help you understand and use all the features of the application. This documentation is for **end users** (not developers) and focuses on functionality, workflows, and requirements.

---

## Table of Contents

1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Getting Started](#getting-started)
4. [Main Features](#main-features)
   - [Selecting the Root Folder](#selecting-the-root-folder)
   - [Viewing and Editing Configuration Files](#viewing-and-editing-configuration-files)
   - [Searching Files](#searching-files)
   - [Package Management](#package-management)
     - [Validate Structure](#validate-structure)
     - [Replace Packages](#replace-packages)
   - [Sync Across Projects](#sync-across-projects)
   - [Copy PostgreSQL Configuration](#copy-postgresql-configuration)
   - [Git Integration (Discard Changes)](#git-integration-discard-changes)
   - [Dark Mode](#dark-mode)
5. [PowerShell Output Modal](#powershell-output-modal)
6. [Tips & Troubleshooting](#tips--troubleshooting)
7. [Contact & Credits](#contact--credits)

---

## Overview

**API Config Editor** is a desktop application (built with Electron) designed to simplify the management of API configuration files (such as `appsettings.*.json`) across multiple .NET projects. It provides an easy-to-use interface for editing, validating, and syncing configuration files, as well as managing package references and integrating with Git for advanced operations.

---

## System Requirements

- **Operating System:** Windows 10/11 recommended (may run on Mac/Linux with PowerShell Core installed)
- **.NET Projects:** The tool is optimized for projects using `appsettings.*.json` files (typical in .NET Core/ASP.NET APIs)
- **PowerShell:** Windows PowerShell or PowerShell Core (`pwsh`) must be available
- **Git** (optional): For Git integration and discard functionality
- **Internet Connection:** Required for some authentication and encryption/decryption APIs

---

## Getting Started

1. **Install the Application**
   - Download and install the API Config Editor from your organization’s software portal or provided installer.

2. **Launch the Application**
   - Double-click the application icon to start.

3. **Select a Root Folder**
   - Click **Select Root Folder** in the sidebar to choose your main projects directory (e.g., `D:\Projects`).

---

## Main Features

### Selecting the Root Folder

- **Purpose:** Loads your main projects directory and scans for all configuration files (`appsettings.*.json`).
- **How to Use:**
  - Click on **Select Root Folder** in the sidebar.
  - Browse and select your main project folder.
  - The sidebar updates with a hierarchical tree of all found config files, grouped by project/API.

---

### Viewing and Editing Configuration Files

- **Purpose:** View and edit the contents of any `appsettings.*.json` file in a safe, user-friendly form.
- **How to Use:**
  - Click a file in the sidebar tree to load it.
  - The main area shows a form with all editable fields.
  - Make changes as needed. Modified fields are tracked automatically.
  - Click **Save Changes** to write your edits to disk.
  - Click **Reset** to revert unsaved changes to the last saved state.

---

### Searching Files

- **Purpose:** Quickly locate configuration files by name or environment.
- **How to Use:**
  - Use the **Search files...** box at the bottom of the sidebar.
  - Enter part of a filename or environment name (e.g., `dev`, `prod`).
  - Matching files and folders are highlighted and expanded.

---

### Package Management

#### Validate Structure

- **Purpose:** Checks that your projects and infrastructure folders are set up correctly.
- **How to Use:**
  - Click **Validate Structure** in the sidebar (visible after selecting a root folder).
  - A report is shown detailing status of directories, API projects, infrastructure, and solutions.
  - Errors or warnings will be highlighted.

#### Replace Packages

- **Purpose:** Migrates package references to project references across multiple projects/APIs. Useful for upgrading shared libraries.
- **How to Use:**
  - Click **Replace Packages** in the sidebar.
  - Choose which projects to update (`All Projects`, `Community Only`, `APIs Only`, or `Custom Selection...`).
  - Optionally enable **Simulation Mode (What-If)** to preview changes without applying them.
  - Click **Execute** to begin. Results are shown in the PowerShell Output modal.

---

### Sync Across Projects

- **Purpose:** Apply the same configuration changes to identical files in other projects (e.g., sync `appsettings.Dev.json` across all APIs).
- **How to Use:**
  - After editing a file, click the **Sync Across Projects** button in the main area.
  - The tool finds all identical files and allows you to select which to update.
  - Confirm and apply changes to selected files.

---

### Copy PostgreSQL Configuration (NOT WORKING)

- **Purpose:** Easily copy database connection settings from a dedicated PostgreSQL config file to another environment (e.g., Dev).
- **How to Use:**
  - When viewing a Dev environment file, click **Load PostgreSQL Config**.
  - The tool finds the corresponding PostgreSQL config file in the same directory.
  - Confirm to copy the settings. The form updates with the new configuration.

---

### Git Integration (Discard Changes) (NOT WORKING)

- **Purpose:** Discard changes to configuration files and revert to the last committed state in Git.
- **How to Use:**
  - Click **Discard from Git** in the main area.
  - Choose to discard changes in the current repository or all repositories.
  - Select which files to discard and confirm.
  - The tool resets the files using Git.

---

### Dark Mode

- **Purpose:** Switch between light and dark UI themes for better visibility.
- **How to Use:**
  - Click the **Moon/Sun icon** in the sidebar to toggle dark mode.

---

## PowerShell Output Modal

- **Purpose:** View detailed results of PowerShell-based operations (like package replacement or validation).
- **How to Use:**
  - Results appear automatically after relevant operations.
  - Review the log for details, warnings, or errors.
  - Click **Close** to dismiss.

---

## Tips & Troubleshooting

- **Saving Changes:** Always save changes before syncing or discarding to avoid data loss.
- **Simulation Mode:** Use Simulation Mode when replacing packages to preview changes before applying.
- **Git Issues:** If the tool cannot find a Git repository, make sure your projects are under version control.
- **PowerShell Errors:** If PowerShell actions fail, ensure PowerShell is installed and accessible from your system PATH.
- **Invalid JSON:** The editor warns you if a file cannot be parsed. You can view the raw content but cannot edit in form mode.
- **Encrypted Values:** Click the lock icon next to encrypted fields to decrypt, edit, and re-encrypt values securely.

---

## Contact & Credits

- **Made With ❤️ By Hardik Kanjariya**
- For support, contact your IT department or reach out to the application's maintainer.

---

## Quick Reference

| Button/Icon                     | Functionality                                      |
|----------------------------------|----------------------------------------------------|
| **Select Root Folder**           | Load your projects and config files                |
| **Save Changes**                 | Save edits to the current config file              |
| **Reset**                        | Undo unsaved changes                              |
| **Sync Across Projects**         | Apply changes to identical files elsewhere         |
| **Load PostgreSQL Config**       | Copy settings from PostgreSQL config               |
| **Validate Structure**           | Check organization of your projects                |
| **Replace Packages**             | Convert package refs to project refs               |
| **Discard from Git**             | Revert changes using Git                           |
| **Dark Mode (Moon/Sun)**         | Toggle UI theme                                    |

---

**Enjoy streamlined configuration management for your APIs!**
