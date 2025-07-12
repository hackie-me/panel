// Require electron modules
const { ipcRenderer } = require('electron');
const path = require('path');

// DOM Elements
const selectFolderBtn = document.getElementById('selectFolderBtn');
const rootPathDisplay = document.getElementById('rootPathDisplay');
const rootPath = document.getElementById('rootPath');
const fileTreeContainer = document.getElementById('fileTreeContainer');
const currentFileName = document.getElementById('currentFileName');
const editorContainer = document.getElementById('editorContainer');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const fileSearch = document.getElementById('fileSearch');

// Global variables for package management
let currentRootPath = '';
let currentInfrastructurePath = '';
let loadingToastElement = null;

const copyPostgresBtn = document.createElement('button');
copyPostgresBtn.id = 'copyPostgresBtn';
copyPostgresBtn.className = 'btn btn-outline-info ms-2';
copyPostgresBtn.innerHTML = '<i class="fas fa-database me-1"></i>Load PostgreSQL Config';
copyPostgresBtn.title = 'Copy PostgreSQL configuration to Dev environment';
copyPostgresBtn.disabled = true;

document.addEventListener('DOMContentLoaded', function () {
    // Add sync button after the other buttons are loaded
    const buttonContainer = document.querySelector('.action-buttons');
    if (buttonContainer) {
        // Add discard from git button
        const discardGitBtn = document.createElement('button');
        discardGitBtn.id = 'discardGitBtn';
        discardGitBtn.className = 'btn btn-outline-danger ms-2';
        discardGitBtn.innerHTML = '<i class="fas fa-trash-alt me-1"></i>Discard from Git';
        discardGitBtn.title = 'Discard changes to appsettings.*.json files from Git';
        buttonContainer.appendChild(discardGitBtn);
        discardGitBtn.addEventListener('click', discardFromGit);
    }

    // Add package management event listeners
    const validateBtn = document.getElementById('validateStructureBtn');
    const showReplaceBtn = document.getElementById('showReplacePackagesBtn');
    const executeBtn = document.getElementById('executeReplaceBtn');

    if (validateBtn) {
        validateBtn.addEventListener('click', validateProjectStructure);
    }

    if (showReplaceBtn) {
        showReplaceBtn.addEventListener('click', toggleReplacePackagesOptions);
    }

    if (executeBtn) {
        executeBtn.addEventListener('click', executeReplacePackages);
    }
});

// Insert the button after the reset button
resetBtn.parentNode.insertBefore(copyPostgresBtn, resetBtn.nextSibling);

// Add event listener
copyPostgresBtn.addEventListener('click', copyPostgreSQLConfig);

// Add after the existing button initialization code
document.addEventListener('DOMContentLoaded', function () {
    // Add sync button after the other buttons are loaded
    const buttonContainer = document.querySelector('.action-buttons');
    if (buttonContainer) {
        const syncFilesBtn = document.createElement('button');
        syncFilesBtn.id = 'syncFilesBtn';
        syncFilesBtn.className = 'btn btn-outline-success ms-2';
        syncFilesBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Sync Across Projects';
        syncFilesBtn.title = 'Apply changes to identical files across projects';

        // Add it to the button container
        buttonContainer.appendChild(syncFilesBtn);

        // Add event listener
        syncFilesBtn.addEventListener('click', syncFilesAcrossProjects);
    }
});

// Global variables
let currentFile = null;
let originalJson = null;
let currentJson = null;
let changedPaths = [];

// Event Listeners
selectFolderBtn.addEventListener('click', selectRootFolder);
saveBtn.addEventListener('click', saveCurrentFile);
resetBtn.addEventListener('click', resetForm);
darkModeToggle.addEventListener('click', toggleDarkMode);
fileSearch.addEventListener('input', filterFileTree);

// Package Management Functions
function setupPackageManagement(rootPath) {
    currentRootPath = rootPath;

    // Try to find infrastructure path
    const infraPath = findInfrastructurePath(rootPath);
    currentInfrastructurePath = infraPath;

    // Show package management section
    const packageSection = document.getElementById('packageManagementSection');
    if (packageSection) {
        packageSection.classList.remove('d-none');
    }

    console.log('Package management setup:', { rootPath, infraPath });
}

function findInfrastructurePath(rootPath) {
    // Try different possible infrastructure paths
    const possiblePaths = [
        path.join(rootPath, 'KLSPL.Community.Common.Infrastructure'),
        path.join(path.dirname(rootPath), 'KLSPL.Community.Common.Infrastructure'),
        path.join(rootPath, '..', 'KLSPL.Community.Common.Infrastructure')
    ];

    // For now, return the first possible path
    // In a real implementation, you might want to check if these paths exist
    return possiblePaths[0];
}

async function validateProjectStructure() {
    if (!currentRootPath) {
        showToast('Please select a root folder first', 'warning');
        return;
    }

    try {
        showLoadingToast('Validating project structure...');

        const result = await ipcRenderer.invoke('validate-project-structure', {
            projectsPath: currentRootPath,
            infrastructurePath: currentInfrastructurePath
        });

        hideLoadingToast();

        if (result.success) {
            showPowerShellOutput('Project Structure Validation', result.output, result.errors);
            showToast('Project structure validation completed', 'success');
        } else {
            showToast(`Validation failed: ${result.error}`, 'danger');
            showPowerShellOutput('Project Structure Validation (Error)', result.output, result.errors);
        }
    } catch (error) {
        hideLoadingToast();
        console.error('Error validating project structure:', error);
        showToast('Failed to validate project structure', 'danger');
    }
}

function toggleReplacePackagesOptions() {
    const optionsDiv = document.getElementById('replacePackagesOptions');
    if (optionsDiv) {
        if (optionsDiv.classList.contains('d-none')) {
            optionsDiv.classList.remove('d-none');
        } else {
            optionsDiv.classList.add('d-none');
        }
    }
}

async function executeReplacePackages() {
    if (!currentRootPath) {
        showToast('Please select a root folder first', 'warning');
        return;
    }

    const selectionElement = document.getElementById('projectSelection');
    const whatIfElement = document.getElementById('whatIfMode');

    if (!selectionElement || !whatIfElement) {
        showToast('UI elements not found', 'danger');
        return;
    }

    const selection = selectionElement.value;
    const whatIf = whatIfElement.checked;

    // If user selected "custom", show the directory selection dialog
    if (selection === 'custom') {
        try {
            // Get available directories first
            const directoriesResult = await ipcRenderer.invoke('get-available-directories', {
                projectsPath: currentRootPath
            });

            if (!directoriesResult.success || directoriesResult.directories.length === 0) {
                showToast('No directories found for selection', 'warning');
                return;
            }

            // Show directory selection dialog
            const selectedDirectories = await showDirectorySelectionDialog(
                'Select Projects to Update',
                'Choose which projects you want to update:',
                directoriesResult.directories
            );

            if (!selectedDirectories || selectedDirectories.length === 0) {
                showToast('No directories selected', 'info');
                return;
            }

            // Convert selected directories to indices string
            const selectedIndices = selectedDirectories.map(dir => dir.Index).join(',');

            const confirmMessage = whatIf
                ? `Run package replacement simulation for ${selectedDirectories.length} selected projects?`
                : `⚠️ WARNING: This will make actual changes to your project files!\n\nReplace package references for ${selectedDirectories.length} selected projects?`;

            if (!confirm(confirmMessage)) {
                return;
            }

            // Execute with the selected indices
            await executePackageReplacement(selectedIndices, whatIf);
        } catch (error) {
            console.error('Error in custom directory selection:', error);
            showToast('Error selecting directories', 'danger');
        }
    } else {
        // Standard selection (all, community, apis)
        const confirmMessage = whatIf
            ? `Run package replacement simulation for "${selection}" projects?`
            : `⚠️ WARNING: This will make actual changes to your project files!\n\nReplace package references for "${selection}" projects?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        await executePackageReplacement(selection, whatIf);
    }
}

// Helper function to execute the package replacement
async function executePackageReplacement(selection, whatIf) {
    try {
        showLoadingToast(`${whatIf ? 'Simulating' : 'Executing'} package replacement...`);

        const result = await ipcRenderer.invoke('replace-package-references', {
            projectsPath: currentRootPath,
            infrastructurePath: currentInfrastructurePath,
            selection: selection,
            whatIf: whatIf
        });

        hideLoadingToast();

        if (result.success) {
            const title = whatIf ? 'Package Replacement Simulation' : 'Package Replacement Results';
            showPowerShellOutput(title, result.output, result.errors);

            const message = whatIf
                ? 'Package replacement simulation completed'
                : 'Package replacement completed successfully';
            showToast(message, 'success');

            // Hide the options after successful execution
            const optionsDiv = document.getElementById('replacePackagesOptions');
            if (optionsDiv) {
                optionsDiv.classList.add('d-none');
            }
        } else {
            showToast(`Package replacement failed: ${result.error}`, 'danger');
            showPowerShellOutput('Package Replacement (Error)', result.output, result.errors);
        }
    } catch (error) {
        hideLoadingToast();
        console.error('Error executing package replacement:', error);
        showToast('Failed to execute package replacement', 'danger');
    }
}

// Function to show directory selection dialog
function showDirectorySelectionDialog(title, message, directories) {
    return new Promise((resolve) => {
        // Build the list of directories with checkboxes
        let directoryListHtml = '';
        directories.forEach((directory) => {
            const displayName = directory.Name;
            const directoryType = directory.Type || 'Unknown';
            const typeClass = directoryType === 'Community' ? 'text-primary' : 'text-secondary';

            directoryListHtml += `
                <div class="form-check mb-2 d-flex align-items-center">
                    <input class="form-check-input" type="checkbox" value="${directory.Index}" id="dir-${directory.Index}">
                    <label class="form-check-label flex-grow-1 ms-2" for="dir-${directory.Index}">
                        <div class="d-flex justify-content-between align-items-center">
                            <span>${displayName}</span>
                            <span class="badge bg-light ${typeClass} ms-2">${directoryType}</span>
                        </div>
                        <small class="text-muted">${directory.Path}</small>
                    </label>
                </div>
            `;
        });

        // Create the dialog HTML
        const dialogHtml = `
            <div class="modal fade" id="directorySelectionDialog" tabindex="-1" aria-labelledby="directorySelectionDialogLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="directorySelectionDialogLabel">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                            <div class="directory-selection-list" style="max-height: 400px; overflow-y: auto; border: 1px solid #dee2e6; padding: 15px; border-radius: 4px;">
                                ${directoryListHtml}
                            </div>
                            <div class="mt-3">
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="selectAllDirsBtn">Select All</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary ms-2" id="deselectAllDirsBtn">Deselect All</button>
                                <button type="button" class="btn btn-sm btn-outline-info ms-2" id="selectCommunityBtn">Community Only</button>
                                <button type="button" class="btn btn-sm btn-outline-info ms-2" id="selectApisBtn">APIs Only</button>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelDirSelectionBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmDirSelectionBtn">Continue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add the dialog to the document
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer);

        // Initialize the modal
        const modalElement = document.getElementById('directorySelectionDialog');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Add event listeners for the buttons
        document.getElementById('selectAllDirsBtn').addEventListener('click', () => {
            document.querySelectorAll('.directory-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = true;
            });
        });

        document.getElementById('deselectAllDirsBtn').addEventListener('click', () => {
            document.querySelectorAll('.directory-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        });

        document.getElementById('selectCommunityBtn').addEventListener('click', () => {
            document.querySelectorAll('.directory-selection-list input[type="checkbox"]').forEach(checkbox => {
                const index = parseInt(checkbox.value);
                const directory = directories.find(d => d.Index === index);
                checkbox.checked = directory && directory.Type === 'Community';
            });
        });

        document.getElementById('selectApisBtn').addEventListener('click', () => {
            document.querySelectorAll('.directory-selection-list input[type="checkbox"]').forEach(checkbox => {
                const index = parseInt(checkbox.value);
                const directory = directories.find(d => d.Index === index);
                checkbox.checked = directory && directory.Type === 'API';
            });
        });

        document.getElementById('cancelDirSelectionBtn').addEventListener('click', () => {
            modal.hide();
            resolve([]);
        });

        document.getElementById('confirmDirSelectionBtn').addEventListener('click', () => {
            // Get all selected directories
            const selectedDirectories = [];
            document.querySelectorAll('.directory-selection-list input[type="checkbox"]:checked').forEach(checkbox => {
                const index = parseInt(checkbox.value);
                const directory = directories.find(d => d.Index === index);
                if (directory) {
                    selectedDirectories.push(directory);
                }
            });

            modal.hide();
            resolve(selectedDirectories);
        });

        // Cleanup when the modal is hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(dialogContainer);
        });
    });
}

function showPowerShellOutput(title, output, errors) {
    const modal = document.getElementById('powershellOutputModal');
    const modalTitle = document.querySelector('#powershellOutputModal .modal-title');
    const outputDiv = document.getElementById('powershellOutput');

    if (!modal || !modalTitle || !outputDiv) {
        console.error('PowerShell output modal elements not found');
        return;
    }

    modalTitle.textContent = title;

    let formattedOutput = '';
    if (output) {
        formattedOutput += output;
    }
    if (errors) {
        formattedOutput += '\n\n=== ERRORS ===\n' + errors;
    }

    outputDiv.textContent = formattedOutput || 'No output available';

    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

// Utility functions for loading toasts
function showLoadingToast(message) {
    hideLoadingToast(); // Hide any existing loading toast

    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }

    const toastElement = createToastElement(message, 'info', false); // false = don't auto-hide

    toastContainer.appendChild(toastElement);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    loadingToastElement = toastElement;
}

function hideLoadingToast() {
    if (loadingToastElement) {
        const toast = bootstrap.Toast.getInstance(loadingToastElement);
        if (toast) {
            toast.hide();
        }
        // Remove the element after hiding
        setTimeout(() => {
            if (loadingToastElement && loadingToastElement.parentNode) {
                loadingToastElement.parentNode.removeChild(loadingToastElement);
            }
            loadingToastElement = null;
        }, 300);
    }
}

// Update the createToastElement function to support non-auto-hiding toasts
function createToastElement(message, type = 'info', autoHide = true) {
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    if (!autoHide) {
        toast.setAttribute('data-bs-autohide', 'false');
    }

    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${autoHide ? '' : '<i class="fas fa-spinner fa-spin me-2"></i>'}${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    return toast;
}

// IPC response listeners
ipcRenderer.on('folder-selected', (event, data) => {
    if (data.success) {
        // Setup package management
        setupPackageManagement(data.path);

        // Update UI with selected folder
        rootPathDisplay.classList.remove('d-none');
        rootPath.textContent = data.path;
        rootPath.title = data.path;

        // Build file tree
        buildFileTree(data.files);

        showToast('Folder selected successfully', 'success');
    } else {
        fileTreeContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h5>Error selecting folder</h5>
                <p>${data.error || 'Please try again'}</p>
            </div>
        `;
        showToast('Error selecting folder', 'error');
    }
});

// Progress bar handlers
ipcRenderer.on('folder-loading-start', (event, data) => {
    fileTreeContainer.innerHTML = `
        <div class="loading-container">
            <p class="mb-2">Scanning folder structure...</p>
            <p class="small text-muted mb-3">${data.path}</p>
            <div class="progress mb-2" style="height: 20px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
            </div>
            <p class="small text-muted directory-status">Initializing scan...</p>
        </div>
    `;

    // Show the path immediately
    rootPathDisplay.classList.remove('d-none');
    rootPath.textContent = data.path;
    rootPath.title = data.path;
});

ipcRenderer.on('folder-loading-total', (event, data) => {
    const statusEl = document.querySelector('.directory-status');
    if (statusEl) {
        statusEl.textContent = data.message;
    }
});

ipcRenderer.on('folder-loading-progress', (event, data) => {
    const progressBar = document.querySelector('.progress-bar');
    const statusEl = document.querySelector('.directory-status');

    if (progressBar) {
        const percentage = data.percentage;
        progressBar.style.width = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', percentage);
        progressBar.textContent = `${percentage}%`;
    }

    if (statusEl) {
        statusEl.textContent = `Scanning directory ${data.processed} of ${data.total}: ${data.currentDirectory}`;
    }
});

// Update the file-loaded handler to enable/disable the PostgreSQL button
ipcRenderer.on('file-loaded', (event, data) => {
    if (data.success) {
        // Reset changed paths
        changedPaths = [];

        // Update global variables
        currentFile = data.file;
        currentFile.originalContent = data.originalContent; // Store the original content
        currentJson = data.content;
        originalJson = JSON.parse(JSON.stringify(data.content)); // Deep clone

        // Update UI
        currentFileName.textContent = data.file.filename;

        // Enable buttons
        saveBtn.disabled = false;
        resetBtn.disabled = false;

        // Enable PostgreSQL button if this is a Dev environment file and has AppSettingvalue
        const isDevFile = data.file.filename.toLowerCase().includes('dev');
        copyPostgresBtn.disabled = !isDevFile;


        // Check if there was a parse error
        if (data.hasParseError) {
            editorContainer.innerHTML = `
                <div class="alert alert-warning">
                    <h5><i class="fas fa-exclamation-triangle me-2"></i>JSON Parse Error</h5>
                    <p>The file could not be parsed correctly due to invalid JSON format.</p>
                    <p><strong>Error:</strong> ${data.parseErrorMessage}</p>
                    <p>Some features may be limited. You can view the raw file content below.</p>
                    <div class="mt-3">
                        <button class="btn btn-sm btn-primary" id="showRawContent">
                            <i class="fas fa-code me-1"></i>Show Raw Content
                        </button>
                    </div>
                </div>
            `;

            // Add event listener for the raw content button
            document.getElementById('showRawContent').addEventListener('click', () => {
                showRawContent(data.originalContent);
            });

            showToast(`Loaded ${data.file.filename} with parse errors`, 'warning');
        } else {
            // Render form
            renderJsonForm(currentJson, editorContainer);
            showToast(`Loaded ${data.file.filename}`, 'success');
        }
    } else {
        editorContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h5>Error loading file</h5>
                <p>${data.error || 'Failed to load file content'}</p>
                <button class="btn btn-sm btn-outline-primary mt-3" id="tryRawView">
                    <i class="fas fa-file-alt me-1"></i>Try Raw View
                </button>
            </div>
        `;

        // Add event listener for the raw view button
        const tryRawViewBtn = document.getElementById('tryRawView');
        if (tryRawViewBtn) {
            tryRawViewBtn.addEventListener('click', async () => {
                try {
                    // Request raw file content without parsing
                    const filePath = data.file?.path;
                    if (filePath) {
                        const rawContent = await fsReadFile(filePath, 'utf8');
                        showRawContent(rawContent);
                    }
                } catch (error) {
                    console.error('Error reading raw file:', error);
                    showToast('Error reading raw file', 'error');
                }
            });
        }

        // Disable buttons
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        copyPostgresBtn.disabled = true;

        showToast('Error loading file', 'error');
    }
});

// Function to show raw content
function showRawContent(content) {
    // Escape HTML to prevent XSS
    const escapedContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    editorContainer.innerHTML = `
        <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle me-2"></i>
            Viewing raw file content. Editing is not available in this mode.
        </div>
        <div class="raw-content-container">
            <pre><code>${escapedContent}</code></pre>
        </div>
    `;

    // Disable buttons
    saveBtn.disabled = true;
    resetBtn.disabled = true;
}

ipcRenderer.on('file-saved', (event, data) => {
    if (data.success) {
        // Update original JSON
        originalJson = JSON.parse(JSON.stringify(currentJson));

        showToast('File saved successfully', 'success');
    } else {
        showToast(`Error saving file: ${data.error}`, 'error');
    }

    // Reset button state
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Changes';
});

ipcRenderer.on('restore-last-folder', (event, folderData) => {
    try {
        isLoadingLastFolder = true;

        // Setup package management
        setupPackageManagement(folderData.path);

        // Update UI with the folder path
        rootPathDisplay.classList.remove('d-none');
        rootPath.textContent = folderData.path;
        rootPath.title = folderData.path;

        // Build the file tree
        buildFileTree(folderData.files);

        showToast('Previous session restored', 'info');
        isLoadingLastFolder = false;
    } catch (error) {
        console.error('Error restoring last folder:', error);
        showToast('Error restoring previous session', 'error');
        isLoadingLastFolder = false;
    }
});

// Improve the buildFileTree function for better performance
function buildFileTree(files) {
    console.log("Building file tree with files:", files);

    if (!files || files.length === 0) {
        fileTreeContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h5>No config files found</h5>
                <p>No API projects or appsettings files found in this folder</p>
            </div>
        `;
        return;
    }

    // Log the first few files to check their structure
    console.log("Sample files:", files.slice(0, 3));

    // Remove duplicate files (same path)
    const uniqueFiles = [];
    const filePaths = new Set();

    files.forEach(file => {
        if (!filePaths.has(file.path)) {
            filePaths.add(file.path);
            uniqueFiles.push(file);
        }
    });

    console.log(`Filtered ${files.length} files to ${uniqueFiles.length} unique files`);

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    const fileTree = document.createElement('ul');
    fileTree.className = 'file-tree';

    // Group files by project hierarchy
    const projects = {};

    uniqueFiles.forEach(file => {
        try {
            // Ensure file has a hierarchy property, if not create one
            const hierarchy = file.hierarchy || [file.project];
            const { environment, path: filePath, filename } = file;

            // Debug log
            console.log(`Processing file: ${filename}, hierarchy: ${JSON.stringify(hierarchy)}`);

            let currentLevel = projects;
            hierarchy.forEach((level, index) => {
                if (!level) {
                    console.warn("Empty hierarchy level found, skipping");
                    return;
                }

                if (!currentLevel[level]) {
                    currentLevel[level] = {
                        isFolder: true,
                        items: {},
                        files: []
                    };
                }

                // If this is the last level, add the file to this level
                if (index === hierarchy.length - 1) {
                    currentLevel[level].files.push(file);
                }

                // Move to the next level
                currentLevel = currentLevel[level].items;
            });
        } catch (error) {
            console.error("Error processing file in buildFileTree:", error, file);
        }
    });

    // Log the project structure
    console.log("Project structure:", JSON.stringify(Object.keys(projects)));

    // Recursively build the tree DOM
    function buildTreeNode(node, parentElement, path = []) {
        // Sort folder names
        const folderNames = Object.keys(node).sort();

        folderNames.forEach(folderName => {
            try {
                const folder = node[folderName];
                const currentPath = [...path, folderName];
                const folderPathString = currentPath.join('-');
                const folderId = `folder-${folderPathString.replace(/[^a-zA-Z0-9-]/g, '')}`;

                const folderItem = document.createElement('li');

                // Create folder header
                const folderHeader = document.createElement('div');
                folderHeader.className = 'file-tree-item';
                folderHeader.setAttribute('data-toggle', 'collapse');
                folderHeader.setAttribute('data-target', `#${folderId}`);

                // Determine folder icon based on name
                let folderIcon = 'fa-folder';
                if (folderName.includes('_API')) {
                    folderIcon = 'fa-cogs';
                } else if (folderName === 'community') {
                    folderIcon = 'fa-users';
                }

                folderHeader.innerHTML = `
                    <span class="file-tree-toggle">
                        <i class="fas fa-caret-right"></i>
                    </span>
                    <i class="fas ${folderIcon}"></i>
                    ${folderName}
                    <span class="badge bg-secondary rounded-pill ms-2">${folder.files.length}</span>
                `;

                // Create files container
                const itemsContainer = document.createElement('ul');
                itemsContainer.id = folderId;
                itemsContainer.className = 'collapse';

                // First add subfolders (recursively)
                if (folder.items && Object.keys(folder.items).length > 0) {
                    buildTreeNode(folder.items, itemsContainer, currentPath);
                }

                // Then add files for this folder
                if (folder.files && folder.files.length > 0) {
                    // Sort files by environment
                    folder.files.sort((a, b) => {
                        const envOrder = { 'dev': 1, 'development': 1, 'staging': 2, 'uat': 3, 'prod': 4, 'production': 4 };
                        const envA = (a.environment || '').toLowerCase();
                        const envB = (b.environment || '').toLowerCase();

                        return (envOrder[envA] || 99) - (envOrder[envB] || 99);
                    });

                    // Create file items
                    folder.files.forEach(file => {
                        try {
                            const { environment, path, filename } = file;
                            if (!path || !filename) {
                                console.warn("Invalid file data:", file);
                                return;
                            }

                            const envClass = getEnvironmentClass(environment);

                            const fileItem = document.createElement('li');
                            const fileLink = document.createElement('div');
                            fileLink.className = 'file-tree-item';
                            fileLink.setAttribute('data-file-path', path);
                            fileLink.innerHTML = `
                                <i class="fas fa-file-code"></i>
                                ${filename}
                                <span class="env-badge ${envClass}">${environment || 'default'}</span>
                            `;

                            // Add click event listener
                            fileLink.addEventListener('click', function (e) {
                                e.stopPropagation(); // Prevent event from bubbling to parent toggles
                                loadFile(path);
                            });

                            fileItem.appendChild(fileLink);
                            itemsContainer.appendChild(fileItem);
                        } catch (fileError) {
                            console.error("Error adding file to tree:", fileError, file);
                        }
                    });
                }

                folderItem.appendChild(folderHeader);
                folderItem.appendChild(itemsContainer);
                parentElement.appendChild(folderItem);
            } catch (folderError) {
                console.error("Error processing folder in buildTreeNode:", folderError, folderName);
            }
        });
    }

    // Start building the tree
    buildTreeNode(projects, fileTree);

    // Add the tree to the DOM
    fragment.appendChild(fileTree);
    fileTreeContainer.innerHTML = '';
    fileTreeContainer.appendChild(fragment);

    // Add toggle functionality using event delegation
    fileTreeContainer.removeEventListener('click', handleTreeToggle);
    fileTreeContainer.addEventListener('click', handleTreeToggle);

    console.log("File tree built successfully");
}

// Handler for tree toggle to prevent multiple event bindings
function handleTreeToggle(e) {
    const toggleItem = e.target.closest('.file-tree-item[data-toggle]');
    if (toggleItem) {
        const targetId = toggleItem.getAttribute('data-target');
        if (!targetId) return; // Safety check

        const target = document.querySelector(targetId);
        if (!target) {
            console.warn(`Could not find target element with id: ${targetId}`);
            return;
        }

        const icon = toggleItem.querySelector('.file-tree-toggle i');
        if (!icon) return; // Safety check

        if (target.classList.contains('show')) {
            target.classList.remove('show');
            icon.classList.remove('fa-caret-down');
            icon.classList.add('fa-caret-right');
        } else {
            target.classList.add('show');
            icon.classList.remove('fa-caret-right');
            icon.classList.add('fa-caret-down');
        }
    }
}

// Dark mode toggle
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    darkModeToggle.innerHTML = isDarkMode ?
        '<i class="fas fa-sun"></i>' :
        '<i class="fas fa-moon"></i>';
}

// Select root folder
function selectRootFolder() {
    try {
        // Show loading state
        fileTreeContainer.innerHTML = `
            <div class="loader">
                <div class="spinner"></div>
            </div>
        `;

        // Request folder selection from main process
        ipcRenderer.send('select-folder');
    } catch (error) {
        console.error('Error selecting folder:', error);
        fileTreeContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h5>Error</h5>
                <p>Failed to select folder. Please try again.</p>
            </div>
        `;
        showToast('Error selecting folder', 'error');
    }
}

// Load file content
function loadFile(filePath) {
    try {
        console.log(`Loading file: ${filePath}`);

        // Verify that the file path is valid
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
        }

        // Clear any active file
        document.querySelectorAll('.file-tree-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // Set the clicked file as active
        // We need to escape special characters in the selector
        // Enhanced escaping to handle paths with URLs
        const escapedPath = filePath.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/:/g, '\\:')  // Escape colons (for URLs)
            .replace(/\//g, '\\/')  // Escape forward slashes (for URLs)
            .replace(/\?/g, '\\?')  // Escape question marks (for URL parameters)
            .replace(/=/g, '\\=')  // Escape equals signs (for URL parameters)
            .replace(/&/g, '\\&');  // Escape ampersands (for URL parameters)
        const fileItem = document.querySelector(`.file-tree-item[data-file-path="${escapedPath}"]`);

        if (fileItem) {
            fileItem.classList.add('active');
        } else {
            console.warn(`Could not find file item element for path: ${filePath}`);
        }

        // Show loading state
        editorContainer.innerHTML = `
            <div class="loader">
                <div class="spinner"></div>
                <p class="mt-3">Loading file...</p>
                <p class="small text-muted">${path.basename(filePath)}</p>
            </div>
        `;

        // Request file content from main process
        ipcRenderer.send('get-file', filePath);
    } catch (error) {
        console.error('Error loading file:', error);
        editorContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h5>Error</h5>
                <p>Failed to load file: ${error.message}</p>
            </div>
        `;
        showToast('Error loading file: ' + error.message, 'error');
    }
}

// Handle input change to track changes
function handleInputChange(event) {
    const input = event.target;
    const path = input.name;
    const type = input.getAttribute('data-type');
    const value = input.type === 'checkbox' ? input.checked : input.value;

    // Get the processed value
    const processedValue = getValueFromString(value, type);

    // Check if this path is already in the changed paths
    const existingIndex = changedPaths.findIndex(item => item.path === path);

    if (existingIndex >= 0) {
        // Update the existing entry
        changedPaths[existingIndex].value = processedValue;
    } else {
        // Add a new entry
        changedPaths.push({ path, value: processedValue });
    }
}

// Render field for null values
function renderNullField(container, label, path) {
    container.innerHTML = `
        <label for="${path}" class="form-label">${label}</label>
        <div class="field-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('${path}')">
                <i class="fas fa-copy"></i>
            </button>
        </div>
        <input type="text" id="${path}" name="${path}" class="form-control" value="" data-type="null">
    `;
}

// Render field for number values
function renderNumberField(container, label, value, path) {
    container.innerHTML = `
        <label for="${path}" class="form-label">${label}</label>
        <div class="field-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('${path}')">
                <i class="fas fa-copy"></i>
            </button>
        </div>
        <input type="number" id="${path}" name="${path}" class="form-control" value="${value}" data-type="number">
    `;
}

// Render field for boolean values
function renderBooleanField(container, label, value, path) {
    container.innerHTML = `
        <div class="form-check form-switch mt-4">
            <input class="form-check-input" type="checkbox" id="${path}" name="${path}" ${value ? 'checked' : ''} data-type="boolean">
            <label class="form-check-label" for="${path}">${label}</label>
        </div>
    `;
}

// Render field for array values
function renderArrayField(container, label, value, path) {
    container.innerHTML = `
        <label for="${path}" class="form-label">${label}</label>
        <div class="field-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('${path}')">
                <i class="fas fa-copy"></i>
            </button>
        </div>
        <textarea id="${path}" name="${path}" class="form-control array-input" rows="${Math.min(value.length + 2, 8)}" data-type="array">${JSON.stringify(value, null, 2)}</textarea>
    `;
}

// Render field for object values
function renderObjectField(container, label, value, path, depth) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'object-fieldset';

    const legend = document.createElement('legend');
    legend.className = 'object-legend';
    legend.textContent = label;

    const nestedContainer = document.createElement('div');

    fieldset.appendChild(legend);
    fieldset.appendChild(nestedContainer);
    container.appendChild(fieldset);

    renderJsonForm(value, nestedContainer, path, depth + 1);
}

// Check if a value is encrypted by looking for the property name
function isEncryptedField(key) {
    return key === 'AppSettingvalue';
}

// Render field for string values with encryption support
function renderStringField(container, label, value, path) {
    const isLongText = value && value.length > 100;
    const isEncrypted = isEncryptedField(label);

    // Escape HTML in value to prevent XSS
    const escapedValue = String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    if (isLongText) {
        container.innerHTML = `
            <label for="${path}" class="form-label">${label}</label>
            <div class="field-actions">
                ${isEncrypted ? `
                <button type="button" class="btn btn-sm btn-outline-info me-1 decrypt-btn" data-path="${path}">
                    <i class="fas fa-lock-open"></i>
                </button>` : ''}
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('${path}')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <textarea id="${path}" name="${path}" class="form-control" rows="3" data-type="string">${escapedValue}</textarea>
        `;
    } else {
        container.innerHTML = `
            <label for="${path}" class="form-label">${label}</label>
            <div class="field-actions">
                ${isEncrypted ? `
                <button type="button" class="btn btn-sm btn-outline-info me-1 decrypt-btn" data-path="${path}">
                    <i class="fas fa-lock-open"></i>
                </button>` : ''}
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('${path}')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <input type="text" id="${path}" name="${path}" class="form-control" value="${escapedValue}" data-type="string">
        `;
    }

    // Add event listener for decrypt button if this is an encrypted field
    if (isEncrypted) {
        const decryptBtn = container.querySelector('.decrypt-btn');
        if (decryptBtn) {
            decryptBtn.addEventListener('click', () => {
                const inputElement = document.getElementById(path);
                openEncryptionModal(path, inputElement.value);
            });
        }
    }
}

// Copy field value to clipboard
function copyValue(path) {
    const element = document.getElementById(path);
    if (!element) return;

    // Copy value to clipboard
    navigator.clipboard.writeText(element.value)
        .then(() => {
            showToast('Value copied to clipboard', 'info');
        })
        .catch(err => {
            console.error('Failed to copy value:', err);
        });
}

// Save current file
function saveCurrentFile() {
    if (!currentFile) return;

    try {
        // Show saving indicator
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';

        // Send save request to main process with original content and changed paths
        ipcRenderer.send('save-file', {
            path: currentFile.path,
            content: currentJson,
            originalContent: currentFile.originalContent,
            changedPaths: changedPaths
        });

        // Update current JSON based on changes
        changedPaths.forEach(change => {
            const { path, value } = change;
            updateObjectByPath(currentJson, path.split('.'), value);
        });
    } catch (error) {
        console.error('Error saving file:', error);
        showToast('Error saving file', 'error');

        // Reset button state
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Changes';
    }
}

// Helper function to update a nested object property by path
function updateObjectByPath(obj, pathArray, value) {
    if (pathArray.length === 1) {
        obj[pathArray[0]] = value;
        return;
    }

    const key = pathArray[0];
    if (!obj[key]) obj[key] = {};

    updateObjectByPath(obj[key], pathArray.slice(1), value);
}

// Reset form to original values
function resetForm() {
    if (originalJson) {
        // Reset changed paths
        changedPaths = [];

        renderJsonForm(originalJson, editorContainer);
        showToast('Form has been reset to original values', 'info');
    }
}

// Convert string values to appropriate types
function getValueFromString(str, type) {
    if (type === 'number') return Number(str);
    if (type === 'boolean') return str === 'true' || str === 'on' || str === true;
    if (type === 'null') return str === '' ? null : str;
    if (type === 'array') {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.error('Invalid array JSON:', e);
            return [];
        }
    }
    return str; // string by default
}

// Filter file tree based on search
function filterFileTree() {
    const searchValue = fileSearch.value.toLowerCase();

    document.querySelectorAll('.file-tree-item').forEach(item => {
        const fileItem = item.textContent.trim().toLowerCase();
        const parentLi = item.closest('li');
        if (!parentLi) return; // Safety check

        if (fileItem.includes(searchValue)) {
            parentLi.style.display = '';

            // If searching, expand the parent
            if (searchValue && item.hasAttribute('data-toggle')) {
                const targetId = item.getAttribute('data-target');
                if (!targetId) return; // Safety check

                const target = document.querySelector(targetId);
                if (!target) return; // Safety check

                const icon = item.querySelector('.file-tree-toggle i');
                if (!icon) return; // Safety check

                if (!target.classList.contains('show')) {
                    target.classList.add('show');
                    icon.classList.remove('fa-caret-right');
                    icon.classList.add('fa-caret-down');
                }
            }

            // Highlight matching text
            if (searchValue) {
                const originalText = item.innerHTML;
                try {
                    const regex = new RegExp(`(${searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    item.innerHTML = originalText.replace(regex, '<span class="search-highlight">$1</span>');
                } catch (e) {
                    console.error('Regex error:', e);
                    // Just use the original text if there's a regex error
                    item.innerHTML = originalText;
                }
            }
        } else {
            // Don't hide folders with matching children
            if (item.hasAttribute('data-toggle')) {
                const targetId = item.getAttribute('data-target');
                if (!targetId) return; // Safety check

                const target = document.querySelector(targetId);
                if (!target) return; // Safety check

                const hasVisibleChildren = Array.from(target.querySelectorAll('li')).some(
                    child => child.style.display !== 'none'
                );

                parentLi.style.display = hasVisibleChildren ? '' : 'none';
            } else {
                parentLi.style.display = 'none';
            }
        }
    });
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) return; // Safety check

    const toast = document.createElement('div');
    toast.className = `toast show bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'info' ? 'info' : 'light'} text-${type === 'error' || type === 'success' ? 'white' : 'dark'}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-body">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'} me-2"></i>
            ${message}
        </div>
    `;

    toastContainer.appendChild(toast);

    // Auto-remove after specified duration
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Get environment badge class
function getEnvironmentClass(env) {
    if (!env) return 'dev'; // Default if empty

    const envLower = env.toLowerCase();
    if (envLower === 'dev' || envLower === 'development') return 'dev';
    if (envLower === 'prod' || envLower === 'production') return 'prod';
    if (envLower === 'staging' || envLower === 'uat') return 'staging';
    if (envLower === 'test') return 'test';
    return 'dev'; // Default
}

// Update the openEncryptionModal function to render the decrypted JSON as form fields
async function openEncryptionModal(path, value) {
    try {
        // Show loading state
        const modalHtml = `
            <div class="modal fade" id="encryptionModal" tabindex="-1" aria-labelledby="encryptionModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="encryptionModalLabel">Encrypted Value Editor</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Property Path</label>
                                <input type="text" class="form-control" value="${path}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Encrypted Value</label>
                                <textarea class="form-control" rows="3" readonly>${value}</textarea>
                            </div>
                            <div id="decryptionContainer">
                                <div class="d-flex justify-content-center mb-3" id="decryptionLoader">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <span class="ms-2">Decrypting...</span>
                                </div>
                                
                                <div class="mb-3 d-none" id="decryptedValueContainer">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <label class="form-label mb-0">Decrypted Value</label>
                                        <div class="btn-group" role="group">
                                            <button class="btn btn-sm btn-outline-secondary" type="button" id="viewRawBtn">View Raw</button>
                                            <button class="btn btn-sm btn-outline-secondary" type="button" id="viewFormBtn">View Form</button>
                                        </div>
                                    </div>
                                    
                                    <!-- Form View Container -->
                                    <div id="decryptedFormContainer" class="border rounded p-3 bg-light"></div>
                                    
                                    <!-- Raw JSON View Container (hidden initially) -->
                                    <div id="decryptedRawContainer" class="d-none">
                                        <div class="input-group">
                                            <textarea class="form-control" id="decryptedValue" rows="8"></textarea>
                                            <button class="btn btn-outline-secondary" type="button" id="formatJsonBtn">Format JSON</button>
                                        </div>
                                    </div>
                                    
                                    <div class="form-text mt-2">Edit values as needed, then click "Save Changes" to update with the encrypted version.</div>
                                </div>
                                
                                <div class="alert alert-danger d-none" id="decryptionError"></div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" id="saveEncryptedBtn">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Append modal to body
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // Initialize the modal
        const modalElement = document.getElementById('encryptionModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Get elements
        const decryptionLoader = document.getElementById('decryptionLoader');
        const decryptedValueContainer = document.getElementById('decryptedValueContainer');
        const decryptedValueElement = document.getElementById('decryptedValue');
        const decryptedFormContainer = document.getElementById('decryptedFormContainer');
        const decryptedRawContainer = document.getElementById('decryptedRawContainer');
        const decryptionError = document.getElementById('decryptionError');
        const saveEncryptedBtn = document.getElementById('saveEncryptedBtn');
        const formatJsonBtn = document.getElementById('formatJsonBtn');
        const viewRawBtn = document.getElementById('viewRawBtn');
        const viewFormBtn = document.getElementById('viewFormBtn');

        // Variables to store the decrypted data
        let decryptedData = null;
        let decryptedJsonChanges = [];

        // Function to toggle between raw and form views
        function showRawView() {
            decryptedFormContainer.classList.add('d-none');
            decryptedRawContainer.classList.remove('d-none');
            viewRawBtn.classList.add('active');
            viewFormBtn.classList.remove('active');

            // Update raw JSON with any changes made in the form
            if (decryptedData) {
                // Apply all changes from form to the decrypted data
                decryptedJsonChanges.forEach(change => {
                    updateObjectByPath(decryptedData, change.path.split('.'), change.value);
                });

                // Update the text area
                decryptedValueElement.value = JSON.stringify(decryptedData, null, 2);
            }
        }

        function showFormView() {
            decryptedRawContainer.classList.add('d-none');
            decryptedFormContainer.classList.remove('d-none');
            viewFormBtn.classList.add('active');
            viewRawBtn.classList.remove('active');

            // Update form with any changes made in the raw view
            try {
                const updatedJson = JSON.parse(decryptedValueElement.value);
                decryptedData = updatedJson;
                renderDecryptedJsonForm(updatedJson, decryptedFormContainer);
            } catch (e) {
                showToast('Invalid JSON format. Please fix before switching to form view.', 'error');
                showRawView(); // Stay in raw view if there's a parsing error
            }
        }

        // Add event listeners for the view toggle buttons
        viewRawBtn.addEventListener('click', showRawView);
        viewFormBtn.addEventListener('click', showFormView);

        // Custom function to handle input changes in the decrypted JSON form
        function handleDecryptedJsonChange(event) {
            const input = event.target;
            const path = input.name;
            const type = input.getAttribute('data-type');
            const value = input.type === 'checkbox' ? input.checked : input.value;

            // Get the processed value
            const processedValue = getValueFromString(value, type);

            // Check if this path is already in the changed paths
            const existingIndex = decryptedJsonChanges.findIndex(item => item.path === path);

            if (existingIndex >= 0) {
                // Update the existing entry
                decryptedJsonChanges[existingIndex].value = processedValue;
            } else {
                // Add a new entry
                decryptedJsonChanges.push({ path, value: processedValue });
            }
        }

        // Function to render the decrypted JSON as a form
        function renderDecryptedJsonForm(json, container, path = '', depth = 0) {
            container.innerHTML = '';
            container.className = `depth-${depth % 4}`;

            if (!json || typeof json !== 'object') {
                container.innerHTML = '<div class="alert alert-warning">Invalid JSON structure</div>';
                return;
            }

            const form = document.createElement('form');
            form.id = 'decryptedJsonForm';
            form.className = 'needs-validation';

            Object.entries(json).forEach(([key, value]) => {
                // Skip metadata
                if (key === '_metadata') return;

                const currentPath = path ? `${path}.${key}` : key;
                const formField = document.createElement('div');
                formField.className = 'form-field';

                // Render field based on value type
                if (value === null || value === undefined) {
                    renderDecryptedNullField(formField, key, currentPath);
                } else if (typeof value === 'string') {
                    renderDecryptedStringField(formField, key, value, currentPath);
                } else if (typeof value === 'number') {
                    renderDecryptedNumberField(formField, key, value, currentPath);
                } else if (typeof value === 'boolean') {
                    renderDecryptedBooleanField(formField, key, value, currentPath);
                } else if (Array.isArray(value)) {
                    renderDecryptedArrayField(formField, key, value, currentPath);
                } else if (typeof value === 'object') {
                    renderDecryptedObjectField(formField, key, value, currentPath, depth);
                }

                form.appendChild(formField);
            });

            container.appendChild(form);

            // Add event listeners to all inputs for change tracking
            const inputs = form.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                input.addEventListener('change', handleDecryptedJsonChange);
            });
        }

        // Renderer functions for decrypted JSON form fields (similar to main form but with unique IDs)
        function renderDecryptedNullField(container, label, path) {
            container.innerHTML = `
                <label for="decrypted_${path}" class="form-label">${label}</label>
                <div class="field-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('decrypted_${path}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <input type="text" id="decrypted_${path}" name="${path}" class="form-control" value="" data-type="null">
            `;
        }

        function renderDecryptedStringField(container, label, value, path) {
            const isLongText = value && value.length > 100;

            // Escape HTML in value to prevent XSS
            const escapedValue = String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

            if (isLongText) {
                container.innerHTML = `
                    <label for="decrypted_${path}" class="form-label">${label}</label>
                    <div class="field-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('decrypted_${path}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <textarea id="decrypted_${path}" name="${path}" class="form-control" rows="3" data-type="string">${escapedValue}</textarea>
                `;
            } else {
                container.innerHTML = `
                    <label for="decrypted_${path}" class="form-label">${label}</label>
                    <div class="field-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('decrypted_${path}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <input type="text" id="decrypted_${path}" name="${path}" class="form-control" value="${escapedValue}" data-type="string">
                `;
            }
        }

        function renderDecryptedNumberField(container, label, value, path) {
            container.innerHTML = `
                <label for="decrypted_${path}" class="form-label">${label}</label>
                <div class="field-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('decrypted_${path}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <input type="number" id="decrypted_${path}" name="${path}" class="form-control" value="${value}" data-type="number">
            `;
        }

        function renderDecryptedBooleanField(container, label, value, path) {
            container.innerHTML = `
                <div class="form-check form-switch mt-4">
                    <input class="form-check-input" type="checkbox" id="decrypted_${path}" name="${path}" ${value ? 'checked' : ''} data-type="boolean">
                    <label class="form-check-label" for="decrypted_${path}">${label}</label>
                </div>
            `;
        }

        function renderDecryptedArrayField(container, label, value, path) {
            container.innerHTML = `
                <label for="decrypted_${path}" class="form-label">${label}</label>
                <div class="field-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyValue('decrypted_${path}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <textarea id="decrypted_${path}" name="${path}" class="form-control array-input" rows="${Math.min(value.length + 2, 8)}" data-type="array">${JSON.stringify(value, null, 2)}</textarea>
            `;
        }

        function renderDecryptedObjectField(container, label, value, path, depth) {
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'object-fieldset';

            const legend = document.createElement('legend');
            legend.className = 'object-legend';
            legend.textContent = label;

            const nestedContainer = document.createElement('div');

            fieldset.appendChild(legend);
            fieldset.appendChild(nestedContainer);
            container.appendChild(fieldset);

            renderDecryptedJsonForm(value, nestedContainer, path, depth + 1);
        }

        // Try to decrypt the value
        try {
            const result = await ipcRenderer.invoke('decrypt-value', value);

            if (result.success) {
                decryptionLoader.classList.add('d-none');
                decryptedValueContainer.classList.remove('d-none');

                // Check if the decrypted value is JSON
                try {
                    decryptedData = JSON.parse(result.value);

                    // Display the decrypted JSON in both formats
                    decryptedValueElement.value = JSON.stringify(decryptedData, null, 2);

                    // Render as form by default
                    renderDecryptedJsonForm(decryptedData, decryptedFormContainer);
                    viewFormBtn.classList.add('active');
                } catch (e) {
                    // Not JSON, just display as raw text
                    decryptedData = result.value;
                    decryptedValueElement.value = result.value;

                    // Force raw view if not valid JSON
                    showRawView();

                    // Disable form view button
                    viewFormBtn.disabled = true;
                    viewFormBtn.title = 'Not a valid JSON object';
                }

                // Format JSON button handler
                formatJsonBtn.addEventListener('click', () => {
                    try {
                        const jsonValue = JSON.parse(decryptedValueElement.value);
                        decryptedValueElement.value = JSON.stringify(jsonValue, null, 2);
                    } catch (e) {
                        showToast('Invalid JSON format', 'error');
                    }
                });

                // Save button handler
                saveEncryptedBtn.addEventListener('click', async () => {
                    try {
                        saveEncryptedBtn.disabled = true;
                        saveEncryptedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

                        // Get the final value to encrypt
                        let finalValue;

                        if (decryptedRawContainer.classList.contains('d-none')) {
                            // We're in form view, get the updated object with all changes
                            finalValue = JSON.stringify(decryptedData);

                            // Apply all changes
                            decryptedJsonChanges.forEach(change => {
                                updateObjectByPath(decryptedData, change.path.split('.'), change.value);
                            });

                            finalValue = JSON.stringify(decryptedData);
                        } else {
                            // We're in raw view, get the value directly from the textarea
                            finalValue = decryptedValueElement.value;

                            // Validate it's proper JSON if it was originally JSON
                            if (typeof decryptedData === 'object' && decryptedData !== null) {
                                try {
                                    JSON.parse(finalValue);
                                } catch (e) {
                                    showToast('Invalid JSON format. Please fix before saving.', 'error');
                                    saveEncryptedBtn.disabled = false;
                                    saveEncryptedBtn.innerHTML = 'Save Changes';
                                    return;
                                }
                            }
                        }

                        const encryptResult = await ipcRenderer.invoke('encrypt-value', finalValue);

                        if (encryptResult.success) {
                            // Update the field value in the form
                            const inputElement = document.getElementById(path);
                            if (inputElement) {
                                inputElement.value = encryptResult.value;

                                // Trigger change event to register the change
                                const event = new Event('change');
                                inputElement.dispatchEvent(event);

                                showToast('Encrypted value updated', 'success');
                                modal.hide();
                            } else {
                                showToast('Could not find input element to update', 'error');
                            }
                        } else {
                            showToast(`Error encrypting value: ${encryptResult.error}`, 'error');
                        }
                    } catch (error) {
                        console.error('Error saving encrypted value:', error);
                        showToast('Error saving encrypted value', 'error');
                    } finally {
                        saveEncryptedBtn.disabled = false;
                        saveEncryptedBtn.innerHTML = 'Save Changes';
                    }
                });
            } else {
                decryptionLoader.classList.add('d-none');
                decryptionError.classList.remove('d-none');
                decryptionError.textContent = `Error decrypting value: ${result.error}`;
            }
        } catch (error) {
            console.error('Error in decrypt process:', error);
            decryptionLoader.classList.add('d-none');
            decryptionError.classList.remove('d-none');
            decryptionError.textContent = `Error: ${error.message}`;
        }

        // Clean up when modal is closed
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modalContainer);
        });
    } catch (error) {
        console.error('Error opening encryption modal:', error);
        showToast('Error opening encryption modal', 'error');
    }
}

// Update the renderJsonForm function to add event listeners for decrypt buttons
function renderJsonForm(json, container, path = '', depth = 0) {
    container.innerHTML = '';
    container.className = `depth-${depth % 4}`;

    if (!json || typeof json !== 'object') {
        container.innerHTML = '<div class="alert alert-warning">Invalid JSON structure</div>';
        return;
    }

    const form = document.createElement('form');
    form.id = 'jsonForm';
    form.className = 'needs-validation';

    Object.entries(json).forEach(([key, value]) => {
        // Skip metadata
        if (key === '_metadata') return;

        const currentPath = path ? `${path}.${key}` : key;
        const formField = document.createElement('div');
        formField.className = 'form-field';

        // Render field based on value type
        if (value === null || value === undefined) {
            renderNullField(formField, key, currentPath);
        } else if (typeof value === 'string') {
            renderStringField(formField, key, value, currentPath);
        } else if (typeof value === 'number') {
            renderNumberField(formField, key, value, currentPath);
        } else if (typeof value === 'boolean') {
            renderBooleanField(formField, key, value, currentPath);
        } else if (Array.isArray(value)) {
            renderArrayField(formField, key, value, currentPath);
        } else if (typeof value === 'object') {
            renderObjectField(formField, key, value, currentPath, depth);
        }

        form.appendChild(formField);
    });

    container.appendChild(form);

    // Add event listeners to all inputs for change tracking
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('change', handleInputChange);
    });
}

// Function to copy PostgreSQL config to current environment
async function copyPostgreSQLConfig() {
    try {
        showToast('Looking for PostgreSQL configuration...', 'info');

        // Get button element
        const copyPostgresBtn = document.getElementById('copyPostgresBtn');

        // Disable the button during processing
        if (copyPostgresBtn) {
            copyPostgresBtn.disabled = true;
            copyPostgresBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Loading...';
        }

        // Step 1: Find the corresponding PostgreSQL file
        // Get the current file's path
        if (!currentFile || !currentFile.path) {
            showToast('No file is currently loaded', 'error');
            resetButton();
            return;
        }

        // Get the current file path and directory
        const currentDir = path.dirname(currentFile.path);
        const currentBaseName = path.basename(currentFile.path);

        console.log('Current directory:', currentDir);
        console.log('Current file:', currentBaseName);

        // Check if we're already in a PostgreSQL file
        if (currentBaseName.toLowerCase().includes('postgresql')) {
            showToast('Already viewing PostgreSQL configuration', 'warning');
            resetButton();
            return;
        }

        // Look for PostgreSQL file in the same directory
        const possibleNames = [
            'appsettings.PostgreSQL.json',
            'appsettings.Postgresql.json',
            'appsettings.postgresql.json',
            'appsettings.POSTGRESQL.json',
            'appsettings.PostGreSQL.json'  // Added this variant
        ];

        // Request all files in the directory
        const files = await ipcRenderer.invoke('get-directory-files', currentDir);

        if (!files.success) {
            showToast(`Error scanning directory: ${files.error}`, 'error');
            resetButton();
            return;
        }

        console.log('Files in directory:', files.files);

        // Find PostgreSQL file - try different possible names
        let postgreSQLFile = null;

        for (const pgFileName of possibleNames) {
            const fullPath = path.join(currentDir, pgFileName);
            console.log('Looking for:', fullPath);

            const foundFile = files.files.find(file =>
                file.toLowerCase() === fullPath.toLowerCase()
            );

            if (foundFile) {
                postgreSQLFile = foundFile;
                console.log('Found PostgreSQL file:', foundFile);
                break;
            }
        }

        // If still not found, try a more flexible approach - look for any file with postgresql in the name
        if (!postgreSQLFile) {
            postgreSQLFile = files.files.find(file =>
                path.basename(file).toLowerCase().includes('postgresql') ||
                path.basename(file).toLowerCase().includes('postgre')
            );

            if (postgreSQLFile) {
                console.log('Found PostgreSQL file using flexible search:', postgreSQLFile);
            }
        }

        if (!postgreSQLFile) {
            showToast('No PostgreSQL configuration file found in this directory', 'error');
            resetButton();
            return;
        }

        // Step 2: Load the PostgreSQL file
        const pgFileResult = await ipcRenderer.invoke('get-file-content', postgreSQLFile);

        if (!pgFileResult.success) {
            showToast(`Error loading PostgreSQL file: ${pgFileResult.error}`, 'error');
            resetButton();
            return;
        }

        // Step 3: Find the AppSettingvalue in the PostgreSQL file
        let pgContent;
        try {
            // Use the cleaned content if available, otherwise try to clean it here
            const contentToParse = pgFileResult.cleanContent || pgFileResult.content;

            // Clean the content more aggressively if needed
            const cleanContent = contentToParse
                .replace(/\/\/.*$/gm, '') // Remove single-line comments
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]+/g, '') // Remove control characters
                .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
                .replace(/,\s*\]/g, ']'); // Remove trailing commas in arrays

            console.log('Attempting to parse PostgreSQL file content');
            pgContent = JSON.parse(cleanContent);
            console.log('Successfully parsed PostgreSQL content');
        } catch (e) {
            console.error('JSON parse error:', e);
            showToast(`Error parsing PostgreSQL file: ${e.message}`, 'error');
            resetButton();
            return;
        }

        // Find the AppSettingvalue, checking both root level and AppSettings.AppSettingvalue
        let pgAppSettingValue = null;

        if ('AppSettingvalue' in pgContent) {
            pgAppSettingValue = pgContent.AppSettingvalue;
            console.log('Found AppSettingvalue at root level');
        } else if (pgContent.AppSettings && 'AppSettingvalue' in pgContent.AppSettings) {
            pgAppSettingValue = pgContent.AppSettings.AppSettingvalue;
            console.log('Found AppSettingvalue in AppSettings object');
        }

        if (!pgAppSettingValue) {
            showToast('No AppSettingvalue found in PostgreSQL configuration', 'error');
            resetButton();
            return;
        }

        // Step 4: Check where we need to put the AppSettingvalue in the current file
        let currentAppSettingPath = '';
        let shouldCreateAppSettings = false;

        if ('AppSettingvalue' in currentJson) {
            currentAppSettingPath = 'AppSettingvalue';
        } else if (currentJson.AppSettings && 'AppSettingvalue' in currentJson.AppSettings) {
            currentAppSettingPath = 'AppSettings.AppSettingvalue';
        } else if (currentJson.AppSettings) {
            // AppSettings exists but no AppSettingvalue
            currentAppSettingPath = 'AppSettings.AppSettingvalue';
            shouldCreateAppSettings = false;
        } else {
            // Neither exists, create at root level to match source
            currentAppSettingPath = 'AppSettingvalue';
            shouldCreateAppSettings = 'AppSettings' in pgContent;
        }

        // Step 5: Get confirmation from user
        const confirmResult = await showConfirmDialog(
            'Copy PostgreSQL Configuration',
            `Are you sure you want to copy the PostgreSQL configuration from <strong>${path.basename(postgreSQLFile)}</strong> to <strong>${currentBaseName}</strong>?<br><br>This will update the AppSettingvalue property.`
        );

        if (!confirmResult) {
            showToast('Operation cancelled', 'info');
            resetButton();
            return;
        }

        // Step 6: Update the value in the current file
        if (currentAppSettingPath === 'AppSettingvalue') {
            currentJson.AppSettingvalue = pgAppSettingValue;
        } else if (currentAppSettingPath === 'AppSettings.AppSettingvalue') {
            if (!currentJson.AppSettings) {
                currentJson.AppSettings = {};
            }
            currentJson.AppSettings.AppSettingvalue = pgAppSettingValue;
        }

        // Step 7: Update the UI
        renderJsonForm(currentJson, editorContainer);

        // Step 8: Register the change
        // We need to find the path to the field in the form
        let formFieldPath = currentAppSettingPath;
        const appSettingField = document.querySelector(`input[name="${formFieldPath}"], textarea[name="${formFieldPath}"]`);

        if (!appSettingField && formFieldPath === 'AppSettings.AppSettingvalue') {
            // Try the flattened path version
            formFieldPath = 'AppSettings.AppSettingvalue';
            const nestedField = document.querySelector(`input[name="${formFieldPath}"], textarea[name="${formFieldPath}"]`);

            if (nestedField) {
                // Trigger change event to register the change
                const event = new Event('change');
                nestedField.dispatchEvent(event);

                // Add to changed paths if not already there
                registerValueChange(formFieldPath, pgAppSettingValue);

                showToast('PostgreSQL configuration loaded successfully', 'success');
            } else {
                // Last resort: Just add it to changedPaths directly
                registerValueChange(formFieldPath, pgAppSettingValue);
                showToast('PostgreSQL configuration loaded, but form field not found. Changes will still be saved.', 'warning');
            }
        } else if (appSettingField) {
            // Trigger change event to register the change
            const event = new Event('change');
            appSettingField.dispatchEvent(event);

            // Add to changed paths if not already there
            registerValueChange(formFieldPath, pgAppSettingValue);

            showToast('PostgreSQL configuration loaded successfully', 'success');
        } else {
            // Last resort: Just add it to changedPaths directly
            registerValueChange(formFieldPath, pgAppSettingValue);
            showToast('PostgreSQL configuration loaded, but form field not found. Changes will still be saved.', 'warning');
        }
    } catch (error) {
        console.error('Error copying PostgreSQL config:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        resetButton();
    }

    // Helper function to register a value change
    function registerValueChange(path, value) {
        const existingIndex = changedPaths.findIndex(item => item.path === path);
        if (existingIndex >= 0) {
            changedPaths[existingIndex].value = value;
        } else {
            changedPaths.push({
                path: path,
                value: value
            });
        }
    }

    // Helper function to reset button state
    function resetButton() {
        const copyPostgresBtn = document.getElementById('copyPostgresBtn');
        if (copyPostgresBtn) {
            copyPostgresBtn.disabled = false;
            copyPostgresBtn.innerHTML = '<i class="fas fa-database me-1"></i>Load PostgreSQL Config';
        }
    }
}

// Helper function to show a confirmation dialog
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const dialogHtml = `
            <div class="modal fade" id="confirmDialog" tabindex="-1" aria-labelledby="confirmDialogLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="confirmDialogLabel">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            ${message}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmBtn">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer);

        const modalElement = document.getElementById('confirmDialog');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        document.getElementById('cancelBtn').addEventListener('click', () => {
            modal.hide();
            resolve(false);
        });

        document.getElementById('confirmBtn').addEventListener('click', () => {
            modal.hide();
            resolve(true);
        });

        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(dialogContainer);
        });
    });
}

// Updated sync function to look one more level up for projects
async function syncFilesAcrossProjects() {
    try {
        console.log('Starting sync across projects');

        // Get current file
        if (!currentFile || !currentFile.path) {
            showToast('No file is currently loaded', 'error');
            return;
        }

        // Extract the filename (we'll look for this exact file in other projects)
        const currentFileName = path.basename(currentFile.path);
        const currentDir = path.dirname(currentFile.path);

        console.log(`Current file: ${currentFileName}`);
        console.log(`Current directory: ${currentDir}`);

        // Disable the button during processing
        const syncFilesBtn = document.getElementById('syncFilesBtn');
        if (syncFilesBtn) {
            syncFilesBtn.disabled = true;
            syncFilesBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Searching...';
        }

        // Check if there are unsaved changes
        if (changedPaths.length > 0) {
            const saveFirst = await showConfirmDialog(
                'Unsaved Changes',
                'You have unsaved changes in the current file. Would you like to save these changes before syncing?'
            );

            if (saveFirst) {
                await saveCurrentFile();
            }
        }

        // Step 1: Find potential project root directories
        console.log('Looking for project root directory');
        let possibleProjectRoot = currentDir;
        let projectRootFound = false;

        // Try to find a folder with common project identifiers
        for (let i = 0; i < 5; i++) { // Look up to 5 levels up
            console.log(`Checking directory: ${possibleProjectRoot}`);

            // Check if this directory has typical project files (like .csproj, package.json, etc.)
            const directoryContent = await ipcRenderer.invoke('get-directory-files', possibleProjectRoot);

            if (directoryContent.success) {
                const files = directoryContent.files.map(f => path.basename(f).toLowerCase());
                console.log(`Found files: ${files.join(', ')}`);

                if (files.some(f => f.endsWith('.csproj') || f === 'package.json' || f === '.git' || f === 'program.cs')) {
                    console.log(`Project root found: ${possibleProjectRoot}`);
                    projectRootFound = true;
                    break;
                }
            }

            // Go up one level
            const parentDir = path.dirname(possibleProjectRoot);
            if (parentDir === possibleProjectRoot) {
                // We're at the root already
                console.log('Reached filesystem root');
                break;
            }
            possibleProjectRoot = parentDir;
        }

        // If we didn't find a project root, use parent directory as a fallback
        if (!projectRootFound) {
            possibleProjectRoot = path.dirname(currentDir);
            console.log(`No project root found, using parent directory: ${possibleProjectRoot}`);
        }

        // Step 2: Look for parent directory that might contain multiple projects
        // Now we go up TWO levels to search more broadly
        const projectsRootDir = path.dirname(path.dirname(possibleProjectRoot));
        console.log(`Projects root directory (two levels up): ${projectsRootDir}`);

        // Step 3: Find all matching files in the projects directory
        console.log(`Searching for ${currentFileName} in ${projectsRootDir}`);

        // We'll do a recursive search for files with the same name
        const matchingFiles = await ipcRenderer.invoke('find-matching-files', {
            rootDir: projectsRootDir,
            fileName: currentFileName
        });

        if (!matchingFiles.success) {
            console.error(`Error finding matching files: ${matchingFiles.error}`);
            showToast(`Error finding matching files: ${matchingFiles.error}`, 'error');
            resetSyncButton();
            return;
        }

        console.log(`Found matching files: ${JSON.stringify(matchingFiles.files)}`);

        // Filter out the current file from the list
        const otherFiles = matchingFiles.files.filter(file => file !== currentFile.path);
        console.log(`Other files to sync: ${otherFiles.length}`);

        if (otherFiles.length === 0) {
            showToast('No matching files found in other projects', 'warning');
            resetSyncButton();
            return;
        }

        // Update button text
        if (syncFilesBtn) {
            syncFilesBtn.innerHTML = '<i class="fas fa-check me-1"></i>Found Files';
        }

        // Step 4: Show a dialog with the list of files to update
        const confirmSync = await showFileSelectionDialog(
            'Sync Files Across Projects',
            `Found ${otherFiles.length} matching files. Select which ones to update:`,
            otherFiles
        );

        if (!confirmSync || confirmSync.selectedFiles.length === 0) {
            showToast('Sync operation cancelled or no files selected', 'info');
            resetSyncButton();
            return;
        }

        console.log(`Selected files for sync: ${confirmSync.selectedFiles.length}`);

        // Step 5: Apply changes to selected files
        // Update button
        if (syncFilesBtn) {
            syncFilesBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin me-1"></i>Syncing...';
        }

        // Get current file content
        const currentContent = JSON.stringify(currentJson, null, 2);

        // Track success and failures
        let successCount = 0;
        let failCount = 0;

        // Process each selected file
        for (const filePath of confirmSync.selectedFiles) {
            try {
                console.log(`Updating file: ${filePath}`);

                // Write the current content to the target file
                const updateResult = await ipcRenderer.invoke('update-file', {
                    filePath: filePath,
                    content: currentContent
                });

                if (updateResult.success) {
                    console.log(`Successfully updated: ${filePath}`);
                    successCount++;
                } else {
                    console.error(`Failed to update ${filePath}: ${updateResult.error}`);
                    failCount++;
                }
            } catch (error) {
                console.error(`Error updating ${filePath}:`, error);
                failCount++;
            }
        }

        // Show results
        if (successCount > 0 && failCount === 0) {
            showToast(`Successfully updated ${successCount} files`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToast(`Updated ${successCount} files, but ${failCount} failed`, 'warning');
        } else {
            showToast(`Failed to update any files`, 'error');
        }
    } catch (error) {
        console.error('Error in sync operation:', error);
        showToast(`Error: ${error.message || 'Unknown error'}`, 'error');
    } finally {
        resetSyncButton();
    }

    // Helper function to reset the button state
    function resetSyncButton() {
        const syncFilesBtn = document.getElementById('syncFilesBtn');
        if (syncFilesBtn) {
            syncFilesBtn.disabled = false;
            syncFilesBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Sync Across Projects';
        }
    }
}

// Function to show a dialog with checkboxes for file selection
function showFileSelectionDialog(title, message, files) {
    return new Promise((resolve) => {
        // Prepare file paths for display (make them relative to a common base if possible)
        let basePath = '';
        if (files.length > 1) {
            // Try to find common path prefix
            const paths = [...files];
            basePath = paths[0].split(path.sep);

            for (let i = 1; i < paths.length; i++) {
                const currentPath = paths[i].split(path.sep);
                let j = 0;
                while (j < basePath.length && j < currentPath.length && basePath[j] === currentPath[j]) {
                    j++;
                }
                basePath = basePath.slice(0, j);
            }

            basePath = basePath.join(path.sep);
        }

        // Build the list of files with checkboxes
        let fileListHtml = '';
        files.forEach((filePath, index) => {
            const displayPath = basePath ? filePath.replace(basePath, '...') : filePath;
            fileListHtml += `
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" value="${filePath}" id="file-${index}" checked>
                    <label class="form-check-label" for="file-${index}" title="${filePath}">
                        ${displayPath}
                    </label>
                </div>
            `;
        });

        // Create the dialog HTML
        const dialogHtml = `
            <div class="modal fade" id="fileSelectionDialog" tabindex="-1" aria-labelledby="fileSelectionDialogLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="fileSelectionDialogLabel">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                            <div class="file-selection-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; padding: 10px; border-radius: 4px;">
                                ${fileListHtml}
                            </div>
                            <div class="mt-3">
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="selectAllBtn">Select All</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary ms-2" id="deselectAllBtn">Deselect All</button>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelSelectionBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmSelectionBtn">Apply Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add the dialog to the document
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer);

        // Initialize the modal
        const modalElement = document.getElementById('fileSelectionDialog');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Add event listeners for the buttons
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            document.querySelectorAll('.file-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = true;
            });
        });

        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            document.querySelectorAll('.file-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        });

        document.getElementById('cancelSelectionBtn').addEventListener('click', () => {
            modal.hide();
            resolve({ selectedFiles: [] });
        });

        document.getElementById('confirmSelectionBtn').addEventListener('click', () => {
            // Get all selected files
            const selectedFiles = [];
            document.querySelectorAll('.file-selection-list input[type="checkbox"]:checked').forEach(checkbox => {
                selectedFiles.push(checkbox.value);
            });

            modal.hide();
            resolve({ selectedFiles });
        });

        // Cleanup when the modal is hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(dialogContainer);
        });
    });
}

// Updated discardFromGit function with better error handling
async function discardFromGit() {
    try {
        console.log('Starting discard from Git operation');

        // Get current file
        if (!currentFile || !currentFile.path) {
            showToast('No file is currently loaded', 'error');
            return;
        }

        // Extract the current directory
        const currentDir = path.dirname(currentFile.path);
        console.log(`Current directory: ${currentDir}`);

        // Disable the button during processing
        const discardGitBtn = document.getElementById('discardGitBtn');
        if (discardGitBtn) {
            discardGitBtn.disabled = true;
            discardGitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Searching...';
        }

        // Find Git repositories
        console.log('Looking for Git repositories');

        // First check if we're in a Git repository
        const currentRepo = await findGitRepository(currentDir);
        if (!currentRepo) {
            // If no Git repository found, check parent directories manually
            console.log('No Git repository found directly. Checking parent directories manually.');

            // Try to find Git repository in parent directories using direct directory listing
            let checkDir = currentDir;
            for (let i = 0; i < 5; i++) {
                const dirs = await ipcRenderer.invoke('get-directory-files', checkDir);

                if (dirs.success) {
                    // Check if any directory is a Git repository
                    for (const file of dirs.files) {
                        const fileName = path.basename(file);
                        if (fileName === '.git') {
                            const fullPath = path.dirname(file);
                            console.log(`Found Git repository at: ${fullPath}`);
                            // Proceed with this repository
                            await proceedWithDiscard([fullPath]);
                            return;
                        }
                    }
                }

                // Go up one level
                const parentDir = path.dirname(checkDir);
                if (parentDir === checkDir) {
                    break; // We're at the root
                }
                checkDir = parentDir;
            }

            // If we get here, we really couldn't find any Git repository
            showToast('No Git repository found for the current file. Make sure you are working within a Git repository.', 'error');
            resetDiscardButton();
            return;
        }

        // If we found a Git repository, proceed with the discard operation
        await proceedWithDiscard([currentRepo]);

    } catch (error) {
        console.error('Error in discard operation:', error);
        showToast(`Error: ${error.message || 'Unknown error'}`, 'error');
        resetDiscardButton();
    }

    // Helper function to reset the button state
    function resetDiscardButton() {
        const discardGitBtn = document.getElementById('discardGitBtn');
        if (discardGitBtn) {
            discardGitBtn.disabled = false;
            discardGitBtn.innerHTML = '<i class="fas fa-trash-alt me-1"></i>Discard from Git';
        }
    }

    // Helper function to proceed with the discard operation
    async function proceedWithDiscard(initialRepos) {
        // Ask user whether to discard from current repo only or all repos
        const discardOptions = await showDiscardOptionsDialog();

        if (!discardOptions || !discardOptions.action) {
            showToast('Operation cancelled', 'info');
            resetDiscardButton();
            return;
        }

        const { action } = discardOptions;
        console.log(`User selected: ${action}`);

        // Update button text
        const discardGitBtn = document.getElementById('discardGitBtn');
        if (discardGitBtn) {
            discardGitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Finding Repositories...';
        }

        let gitRepos = [];

        if (action === 'current') {
            // Use the first repository found
            gitRepos = [initialRepos[0]];
            console.log(`Using current Git repository: ${gitRepos[0]}`);
        } else if (action === 'all') {
            // Find all Git repositories in the parent directories
            // Get two levels up from the current repo to find potential parent directory with multiple repos
            const parentDir = path.dirname(path.dirname(initialRepos[0]));
            console.log(`Looking for all Git repositories in: ${parentDir}`);

            // Find all Git repositories in the parent directory
            const repoResult = await ipcRenderer.invoke('find-git-repositories', {
                rootDir: parentDir
            });

            if (repoResult.success && repoResult.repositories.length > 0) {
                gitRepos = repoResult.repositories;
                console.log(`Found ${gitRepos.length} Git repositories`);
            } else {
                // Fallback to just using the initial repositories found
                gitRepos = initialRepos;
                console.log(`Using only the initially found repositories: ${gitRepos.length}`);
            }
        }

        if (gitRepos.length === 0) {
            showToast('No Git repositories found', 'error');
            resetDiscardButton();
            return;
        }

        // Update button text
        if (discardGitBtn) {
            discardGitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Finding Files...';
        }

        // Find all appsettings.*.json files in each repository
        const allFiles = [];

        for (const repo of gitRepos) {
            // Find appsettings.*.json files in this repository
            const repoFiles = await ipcRenderer.invoke('find-git-appsettings', {
                repoDir: repo
            });

            if (repoFiles.success && repoFiles.files.length > 0) {
                allFiles.push({
                    repo,
                    files: repoFiles.files
                });
            }
        }

        if (allFiles.length === 0) {
            showToast('No appsettings.*.json files found in Git repositories', 'warning');
            resetDiscardButton();
            return;
        }

        // Update button text
        if (discardGitBtn) {
            discardGitBtn.innerHTML = '<i class="fas fa-check me-1"></i>Found Files';
        }

        // Flatten the file list for display
        const flattenedFiles = allFiles.flatMap(repo =>
            repo.files.map(file => ({
                repo: repo.repo,
                file: file
            }))
        );

        // Show a dialog with the list of files to discard
        const confirmDiscard = await showFileDiscardDialog(
            'Discard Files from Git',
            `Found ${flattenedFiles.length} appsettings.*.json files. Select which ones to discard from Git:`,
            flattenedFiles
        );

        if (!confirmDiscard || confirmDiscard.selectedFiles.length === 0) {
            showToast('Discard operation cancelled or no files selected', 'info');
            resetDiscardButton();
            return;
        }

        // Update button text
        if (discardGitBtn) {
            discardGitBtn.innerHTML = '<i class="fas fa-trash-alt fa-spin me-1"></i>Discarding...';
        }

        // Group selected files by repository
        const filesByRepo = {};
        for (const item of confirmDiscard.selectedFiles) {
            if (!filesByRepo[item.repo]) {
                filesByRepo[item.repo] = [];
            }
            filesByRepo[item.repo].push(item.file);
        }

        // Track success and failures
        let successCount = 0;
        let failCount = 0;

        // Process each repository
        for (const [repo, files] of Object.entries(filesByRepo)) {
            try {
                console.log(`Discarding ${files.length} files from repository: ${repo}`);

                // Discard changes to files in this repository
                const discardResult = await ipcRenderer.invoke('discard-git-changes', {
                    repoDir: repo,
                    files: files
                });

                if (discardResult.success) {
                    console.log(`Successfully discarded changes in repository: ${repo}`);
                    successCount += files.length;
                } else {
                    console.error(`Failed to discard changes in repository ${repo}: ${discardResult.error}`);
                    failCount += files.length;
                }
            } catch (error) {
                console.error(`Error discarding changes in repository ${repo}:`, error);
                failCount += files.length;
            }
        }

        // Show results
        if (successCount > 0 && failCount === 0) {
            showToast(`Successfully discarded changes to ${successCount} files`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToast(`Discarded changes to ${successCount} files, but ${failCount} failed`, 'warning');
        } else {
            showToast(`Failed to discard changes to any files`, 'error');
        }

        resetDiscardButton();
    }
}

// Updated function to find Git repository for a directory
async function findGitRepository(startDir) {
    let currentDir = startDir;
    console.log(`Looking for Git repository starting from: ${currentDir}`);

    // Look up to 10 levels up
    for (let i = 0; i < 10; i++) {
        try {
            console.log(`Checking for Git repository at: ${currentDir}`);

            // Check if .git directory exists using IPC
            const dirFiles = await ipcRenderer.invoke('get-directory-files', currentDir);

            if (dirFiles.success) {
                const hasGitDir = dirFiles.files.some(file =>
                    path.basename(file) === '.git'
                );

                if (hasGitDir) {
                    console.log(`Git repository found at: ${currentDir}`);
                    return currentDir; // Found the Git repository
                }
            }

            // Go up one level
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // We're at the root already
                console.log('Reached filesystem root, no Git repository found');
                break;
            }

            currentDir = parentDir;
        } catch (error) {
            console.error(`Error while checking for Git repository: ${error.message}`);
        }
    }

    // If we get here, try a different approach using the git command
    try {
        console.log('Trying git command to find repository root');
        const result = await ipcRenderer.invoke('get-git-root', { startDir });

        if (result.success && result.gitRoot) {
            console.log(`Git repository found at: ${result.gitRoot}`);
            return result.gitRoot;
        }
    } catch (error) {
        console.error(`Error using git command to find repository: ${error.message}`);
    }

    console.log('No Git repository found');
    return null; // Git repository not found
}

// Function to show a dialog with discard options
function showDiscardOptionsDialog() {
    return new Promise((resolve) => {
        // Create the dialog HTML
        const dialogHtml = `
            <div class="modal fade" id="discardOptionsDialog" tabindex="-1" aria-labelledby="discardOptionsDialogLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="discardOptionsDialogLabel">Discard Options</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>How would you like to discard changes to appsettings.*.json files?</p>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="radio" name="discardOption" id="discardOptionCurrent" value="current" checked>
                                <label class="form-check-label" for="discardOptionCurrent">
                                    Discard changes in the current repository only
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="discardOption" id="discardOptionAll" value="all">
                                <label class="form-check-label" for="discardOptionAll">
                                    Discard changes in all repositories found in parent directory
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelDiscardBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmDiscardBtn">Continue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add the dialog to the document
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer);

        // Initialize the modal
        const modalElement = document.getElementById('discardOptionsDialog');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Add event listeners for the buttons
        document.getElementById('cancelDiscardBtn').addEventListener('click', () => {
            modal.hide();
            resolve({ action: null });
        });

        document.getElementById('confirmDiscardBtn').addEventListener('click', () => {
            const selected = document.querySelector('input[name="discardOption"]:checked');
            const action = selected ? selected.value : 'current';

            modal.hide();
            resolve({ action });
        });

        // Cleanup when the modal is hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(dialogContainer);
        });
    });
}

// Function to show a dialog with checkboxes for file selection
function showFileDiscardDialog(title, message, files) {
    return new Promise((resolve) => {
        // Group files by repository for better display
        const filesByRepo = {};
        for (const item of files) {
            if (!filesByRepo[item.repo]) {
                filesByRepo[item.repo] = [];
            }
            filesByRepo[item.repo].push(item.file);
        }

        // Build the list of files with checkboxes, grouped by repository
        let fileListHtml = '';
        let fileIndex = 0;

        for (const [repo, repoFiles] of Object.entries(filesByRepo)) {
            // Get repository name for display
            const repoName = path.basename(repo);

            fileListHtml += `
                <div class="repository-group mb-3">
                    <div class="repository-name fw-bold mb-2">${repoName}</div>
                    <div class="ps-3">
            `;

            for (const file of repoFiles) {
                // Get relative path for display
                const relativePath = path.relative(repo, file);

                fileListHtml += `
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" value="${fileIndex}" id="file-${fileIndex}" checked>
                        <label class="form-check-label" for="file-${fileIndex}" title="${file}">
                            ${relativePath}
                        </label>
                    </div>
                `;

                fileIndex++;
            }

            fileListHtml += `
                    </div>
                </div>
            `;
        }

        // Create the dialog HTML
        const dialogHtml = `
            <div class="modal fade" id="fileDiscardDialog" tabindex="-1" aria-labelledby="fileDiscardDialogLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="fileDiscardDialogLabel">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                            <div class="file-selection-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; padding: 10px; border-radius: 4px;">
                                ${fileListHtml}
                            </div>
                            <div class="mt-3">
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="selectAllBtn">Select All</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary ms-2" id="deselectAllBtn">Deselect All</button>
                            </div>
                            <div class="alert alert-warning mt-3">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Warning:</strong> This will discard all changes to the selected files.
                                The files will be reset to their last committed state. This action cannot be undone.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelDiscardBtn">Cancel</button>
                            <button type="button" class="btn btn-danger" id="confirmDiscardBtn">Discard Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add the dialog to the document
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer);

        // Initialize the modal
        const modalElement = document.getElementById('fileDiscardDialog');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Add event listeners for the buttons
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            document.querySelectorAll('.file-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = true;
            });
        });

        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            document.querySelectorAll('.file-selection-list input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        });

        document.getElementById('cancelDiscardBtn').addEventListener('click', () => {
            modal.hide();
            resolve({ selectedFiles: [] });
        });

        document.getElementById('confirmDiscardBtn').addEventListener('click', () => {
            // Get all selected files
            const selectedFiles = [];
            document.querySelectorAll('.file-selection-list input[type="checkbox"]:checked').forEach(checkbox => {
                const index = parseInt(checkbox.value);
                if (!isNaN(index) && index >= 0 && index < files.length) {
                    selectedFiles.push(files[index]);
                }
            });

            modal.hide();
            resolve({ selectedFiles });
        });

        // Cleanup when the modal is hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(dialogContainer);
        });
    });
}

// Make sure to add copyValue to window scope
window.copyValue = function (elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Copy value to clipboard
    navigator.clipboard.writeText(element.value)
        .then(() => {
            showToast('Value copied to clipboard', 'info');
        })
        .catch(err => {
            console.error('Failed to copy value:', err);
        });
};