const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const util = require('util');
const https = require('https');
const FormData = require('form-data');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const { shell } = require('electron');

// Promise-based versions of callbacks
const fsReadFile = util.promisify(fs.readFile);
const fsWriteFile = util.promisify(fs.writeFile);
const fsStat = util.promisify(fs.stat);
const fsReaddir = util.promisify(fs.readdir);

// Initialize the storage
const store = new Store();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    // Uncomment to open DevTools for debugging
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    // After the window is created, send the last selected folder data
    const lastFolderData = store.get('lastFolder');
    if (lastFolderData) {
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('restore-last-folder', lastFolderData);
        });
    }

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.on('select-folder', async (event) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            event.sender.send('folder-selected', {
                success: false,
                error: 'Folder selection canceled'
            });
            return;
        }

        const rootFolderPath = result.filePaths[0];

        // Show initial loading indicator in UI
        event.sender.send('folder-loading-start', { path: rootFolderPath });

        try {
            // Use a custom recursive directory scanning function instead of glob
            console.log(`Starting custom recursive scan for ${rootFolderPath}`);

            const appsettingsFiles = await findFilesRecursively(rootFolderPath,
                (fileName) => fileName.startsWith('appsettings.') && fileName.endsWith('.json'));

            console.log(`Found ${appsettingsFiles.length} appsettings.*.json files`);

            // Process all found files
            const files = [];
            const processedPaths = new Set();

            // Track progress
            let processed = 0;
            const total = appsettingsFiles.length;

            for (const configFile of appsettingsFiles) {
                processed++;

                // Update progress every 5 files or at the end
                if (processed % 5 === 0 || processed === total) {
                    const percentage = Math.round((processed / total) * 100);
                    event.sender.send('folder-loading-progress', {
                        processed,
                        total,
                        percentage,
                        currentDirectory: path.basename(path.dirname(configFile))
                    });
                }

                if (processedPaths.has(configFile)) continue;
                processedPaths.add(configFile);

                const fileName = path.basename(configFile);
                const envMatch = fileName.match(/appsettings\.(.+)\.json/i);
                const environment = envMatch ? envMatch[1] : 'default';

                // Get project info from file path
                const relativeFilePath = path.relative(rootFolderPath, configFile);
                const pathParts = relativeFilePath.split(path.sep);

                // Check if the root folder itself is the API project
                const rootFolderName = path.basename(rootFolderPath);
                const isRootApiProject = rootFolderName.includes('API');

                // Try to find API project in the path
                const apiPartIndex = pathParts.findIndex(part =>
                    part.includes('_API') || part.includes('API_') || part.toLowerCase().includes('api'));

                let projectName;
                let hierarchy = [];

                if (apiPartIndex >= 0) {
                    projectName = pathParts[apiPartIndex];
                    hierarchy = pathParts.slice(0, apiPartIndex + 1);
                } else if (isRootApiProject) {
                    projectName = rootFolderName;
                    hierarchy = [projectName];
                } else {
                    // Use parent folder as project name
                    projectName = path.basename(path.dirname(configFile));

                    // Build a simple hierarchy based on path
                    const dirName = path.dirname(relativeFilePath);
                    if (dirName && dirName !== '.') {
                        hierarchy = dirName.split(path.sep);
                    } else {
                        hierarchy = [projectName];
                    }
                }

                // Make sure hierarchy has at least one element and doesn't contain duplicates
                if (hierarchy.length === 0) {
                    hierarchy = [projectName];
                }

                const uniqueHierarchy = [...new Set(hierarchy)];

                files.push({
                    path: configFile,
                    filename: fileName,
                    environment,
                    project: projectName,
                    hierarchy: uniqueHierarchy
                });

                // Log processing info
                console.log(`Processed: ${fileName}, Project: ${projectName}, Hierarchy: ${JSON.stringify(uniqueHierarchy)}`);
            }

            console.log(`Total processed files: ${files.length}`);

            const folderData = {
                path: rootFolderPath,
                files: files
            };

            // Save to persistent storage
            store.set('lastFolder', folderData);

            event.sender.send('folder-selected', {
                success: true,
                ...folderData
            });
        } catch (error) {
            console.error('Error finding config files:', error);
            event.sender.send('folder-selected', {
                success: false,
                error: error.message
            });
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        event.sender.send('folder-selected', {
            success: false,
            error: error.message
        });
    }
});

// Custom recursive directory scanning function
async function findFilesRecursively(dir, fileFilter) {
    const result = [];

    async function scanDir(currentDir) {
        try {
            const entries = await fsReaddir(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules, bin, obj folders which are commonly large and not relevant
                    if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj' || entry.name === '.git') {
                        continue;
                    }

                    // Recursively scan subdirectory
                    await scanDir(fullPath);
                } else if (entry.isFile() && fileFilter(entry.name)) {
                    result.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${currentDir}:`, error);
        }
    }

    await scanDir(dir);
    return result;
}

// Handle file loading
ipcMain.on('get-file', async (event, filePath) => {
    try {
        if (!filePath) {
            event.sender.send('file-loaded', {
                success: false,
                error: 'No file path provided'
            });
            return;
        }

        try {
            console.log(`Attempting to load file: ${filePath}`);

            // Verify the file exists
            const stats = await fsStat(filePath);
            if (!stats.isFile()) {
                throw new Error('Path does not point to a valid file');
            }

            // Read file content
            const content = await fsReadFile(filePath, 'utf8');
            console.log(`File loaded successfully, size: ${content.length} bytes`);

            // Store the original content for later comparison
            const originalContent = content;

            // Try to parse JSON with our enhanced method
            const jsonContent = parseJSONWithComments(content);

            // Check if we got a parse error indicator
            const hasParseError = jsonContent && jsonContent._parseError === true;

            // Extract file info
            const pathInfo = path.parse(filePath);
            const filename = pathInfo.base;
            const filenameMatch = filename.match(/appsettings\.(.+)\.json/i);
            const environment = filenameMatch ? filenameMatch[1] : 'default';

            // Get project name from path
            const pathParts = filePath.split(path.sep);
            const projectName = pathParts.find(part =>
                part.includes('_API') || part.includes('API_')) || path.basename(path.dirname(filePath));

            if (hasParseError) {
                event.sender.send('file-loaded', {
                    success: true,
                    file: {
                        path: filePath,
                        filename,
                        environment,
                        project: projectName
                    },
                    content: jsonContent,
                    originalContent: originalContent,
                    hasParseError: true,
                    parseErrorMessage: jsonContent._errorMessage
                });
            } else {
                event.sender.send('file-loaded', {
                    success: true,
                    file: {
                        path: filePath,
                        filename,
                        environment,
                        project: projectName
                    },
                    content: jsonContent,
                    originalContent: originalContent
                });
            }
        } catch (error) {
            console.error('Error reading file:', error);
            event.sender.send('file-loaded', {
                success: false,
                error: error.message
            });
        }
    } catch (error) {
        console.error('Error in get-file handler:', error);
        event.sender.send('file-loaded', {
            success: false,
            error: error.message
        });
    }
});


// Add a handler for opening URLs in the default browser
ipcMain.on('open-external-url', (event, { url }) => {
    try {
        console.log(`Opening URL in browser: ${url}`);

        // Validate URL to prevent security issues
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            shell.openExternal(url);
        } else {
            console.error(`Invalid URL format: ${url}`);
        }
    } catch (error) {
        console.error(`Error opening URL: ${error.message}`);
    }
});

// Save file handler
ipcMain.on('save-file', async (event, data) => {
    try {
        const { path: filePath, originalContent, changedPaths } = data;

        if (!filePath) {
            event.sender.send('file-saved', {
                success: false,
                error: 'No file path provided'
            });
            return;
        }

        // Verify the file exists before saving
        try {
            const stats = await fsStat(filePath);
            if (!stats.isFile()) {
                throw new Error('Path does not point to a valid file');
            }

            // Update only changed values in the original file content
            let updatedContent = originalContent;

            // Apply each change directly to the content
            changedPaths.forEach(change => {
                const { path, value } = change;
                console.log(`Applying change to path: ${path}, value:`, value);

                try {
                    // Find the property location in the JSON
                    const propertyInfo = findPropertyInJson(path, updatedContent);

                    if (propertyInfo) {
                        const { startPos, endPos } = propertyInfo;

                        // Properly serialize the value based on its type
                        let serializedValue;
                        if (typeof value === 'string') {
                            // Properly escape quotes and special characters for JSON
                            serializedValue = JSON.stringify(value);
                        } else {
                            serializedValue = JSON.stringify(value);
                        }

                        // Replace the value in the content
                        updatedContent =
                            updatedContent.substring(0, startPos) +
                            serializedValue +
                            updatedContent.substring(endPos);
                    } else {
                        console.warn(`Could not find property ${path} in the JSON content`);
                    }
                } catch (replaceError) {
                    console.error(`Error replacing value for path ${path}:`, replaceError);
                }
            });

            // Write the updated content back to the file
            await fsWriteFile(filePath, updatedContent, 'utf8');
            event.sender.send('file-saved', {
                success: true,
                message: 'File saved successfully'
            });
        } catch (error) {
            event.sender.send('file-saved', {
                success: false,
                error: error.message
            });
        }
    } catch (error) {
        console.error('Error saving file:', error);
        event.sender.send('file-saved', {
            success: false,
            error: error.message
        });
    }
});

// Helper function to find property position in JSON content
function findPropertyInJson(propertyPath, jsonContent) {
    const parts = propertyPath.split('.');
    const lastPart = parts[parts.length - 1];

    // Look for the property pattern with the right formatting
    const propertyPattern = new RegExp(
        `["']${lastPart}["']\\s*:\\s*(("[^"]*")|('[^']*')|(\\d+)|(true|false|null)|({[^{}]*})|(\[[^\[\]]*\]))`,
        'g'
    );

    let match;
    while ((match = propertyPattern.exec(jsonContent)) !== null) {
        // Found a potential match, now check if it's for the correct nested path
        const fullMatch = match[0];
        const valueMatch = match[1];

        // Calculate the start and end positions of just the value
        const valueStartPos = match.index + fullMatch.indexOf(valueMatch);
        const valueEndPos = valueStartPos + valueMatch.length;

        // For simple cases, we can return the position directly
        if (parts.length === 1) {
            return {
                startPos: valueStartPos,
                endPos: valueEndPos
            };
        }

        // For nested properties, we need to check if this is in the right context
        // This is a simplified approach - for a complete solution, a proper JSON parser would be better
        const contextBefore = jsonContent.substring(0, match.index);
        const parentParts = parts.slice(0, -1);

        // Check if all parent parts are present in the right order before this property
        let isCorrectContext = true;
        let lastFoundIndex = 0;

        for (const part of parentParts) {
            const partPattern = new RegExp(`["']${part}["']\\s*:`, 'g');
            partPattern.lastIndex = lastFoundIndex;

            const parentMatch = partPattern.exec(contextBefore);
            if (!parentMatch || parentMatch.index < lastFoundIndex) {
                isCorrectContext = false;
                break;
            }

            lastFoundIndex = parentMatch.index;
        }

        if (isCorrectContext) {
            return {
                startPos: valueStartPos,
                endPos: valueEndPos
            };
        }
    }

    return null;
}

// Improved helper function to parse JSON with comments and handle bad control characters
function parseJSONWithComments(content) {
    try {
        // Remove comments before parsing
        let cleanContent = content
            .replace(/\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

        // Handle bad control characters in JSON
        cleanContent = cleanContent
            // Replace control characters (0x00-0x1F except allowed ones)
            .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]+/g, '')
            // Fix common issues with newlines
            .replace(/\r\n/g, '\n')
            // Fix potential issues with trailing commas
            .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
            .replace(/,\s*\]/g, ']'); // Remove trailing commas in arrays

        // Try to parse the cleaned content
        try {
            return JSON.parse(cleanContent);
        } catch (initialError) {
            console.error('Initial JSON parsing error:', initialError);

            // Second attempt: Use a more aggressive approach to clean the content
            const aggressiveCleanContent = cleanContent
                // Replace all non-ASCII characters with spaces
                .replace(/[^\x20-\x7E]/g, ' ')
                // Fix double quotes issues
                .replace(/""/g, '""')
                // Ensure proper quote formatting
                .replace(/([^\\])\\([^"\\/bfnrtu])/g, '$1$2');

            return JSON.parse(aggressiveCleanContent);
        }
    } catch (error) {
        console.error('Error parsing JSON:', error);

        // As a last resort, try a line-by-line approach
        try {
            const lines = content.split('\n');
            const cleanedLines = lines.map(line => {
                // Remove comments
                const commentIndex = line.indexOf('//');
                if (commentIndex >= 0) {
                    line = line.substring(0, commentIndex);
                }

                // Clean control characters
                return line
                    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]+/g, '')
                    .replace(/\r/g, '');
            });

            const finalContent = cleanedLines.join('\n')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*\]/g, ']');

            return JSON.parse(finalContent);
        } catch (finalError) {
            console.error('Failed all parsing attempts. Creating empty object as fallback.');

            // Return an empty object as a fallback
            return {
                "_parseError": true,
                "_errorMessage": finalError.message
            };
        }
    }
}

// Function to get authentication token
async function getAuthToken() {
    console.log('Getting authentication token...');

    try {
        const response = await httpRequest({
            method: 'POST',
            hostname: 'REMOVED_URL',
            path: '/api_integration/Authentication/Token',
            headers: {
                'Content-Type': 'application/json'
            }
        }, JSON.stringify({
            client_secret: 'REMOVED_SECRET'
        }));

        const tokenData = JSON.parse(response);
        console.log('Token obtained successfully');
        return tokenData.access_token;
    } catch (error) {
        console.error('Error getting authentication token:', error);
        throw error;
    }
}

// Function to decrypt data
async function decryptData(encryptedValue) {
    console.log('Decrypting data...');

    try {
        // Get auth token
        const token = await getAuthToken();

        // Create form data
        const form = new FormData();
        form.append('data', encryptedValue);

        // Make the request
        const response = await httpFormRequest({
            method: 'POST',
            hostname: 'REMOVED_URL',
            path: '/api_master/DataProtection/DecryptData',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, form);

        console.log('Data decrypted successfully');
        return response;
    } catch (error) {
        console.error('Error decrypting data:', error);
        throw error;
    }
}

// Function to encrypt data
async function encryptData(decryptedValue) {
    console.log('Encrypting data...');

    try {
        // Get auth token
        const token = await getAuthToken();

        // Create form data
        const form = new FormData();
        form.append('data', decryptedValue);

        // Make the request
        const response = await httpFormRequest({
            method: 'POST',
            hostname: 'REMOVED_URL',
            path: '/api_master/DataProtection/EncryptData',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, form);

        console.log('Data encrypted successfully');
        return response;
    } catch (error) {
        console.error('Error encrypting data:', error);
        throw error;
    }
}

// Helper function for HTTP requests
function httpRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseData);
                } else {
                    reject(new Error(`HTTP request failed with status code ${res.statusCode}: ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

// Helper function for form data HTTP requests
function httpFormRequest(options, form) {
    return new Promise((resolve, reject) => {
        // Get the form headers and add them to the request options
        const formHeaders = form.getHeaders();
        options.headers = { ...options.headers, ...formHeaders };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseData);
                } else {
                    reject(new Error(`HTTP request failed with status code ${res.statusCode}: ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        // Pipe the form data to the request
        form.pipe(req);
    });
}

// Add new IPC handlers for encryption/decryption operations
ipcMain.handle('decrypt-value', async (event, encryptedValue) => {
    try {
        const decryptedValue = await decryptData(encryptedValue);
        return { success: true, value: decryptedValue };
    } catch (error) {
        console.error('Error handling decrypt-value:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('encrypt-value', async (event, decryptedValue) => {
    try {
        const encryptedValue = await encryptData(decryptedValue);
        return { success: true, value: encryptedValue };
    } catch (error) {
        console.error('Error handling encrypt-value:', error);
        return { success: false, error: error.message };
    }
});

// Handler to get all files in a directory
ipcMain.handle('get-directory-files', async (event, dirPath) => {
    try {
        const files = await fsReaddir(dirPath);

        // Get full paths for all files
        const fullPaths = files.map(file => path.join(dirPath, file));

        // Filter out directories, keep only files
        const fileStats = await Promise.all(
            fullPaths.map(async filePath => {
                try {
                    const stat = await fsStat(filePath);
                    return { path: filePath, isFile: stat.isFile() };
                } catch (e) {
                    return { path: filePath, isFile: false };
                }
            })
        );

        // Return only file paths
        const filePaths = fileStats
            .filter(item => item.isFile)
            .map(item => item.path);

        return { success: true, files: filePaths };
    } catch (error) {
        console.error('Error getting directory files:', error);
        return { success: false, error: error.message };
    }
});

// Update the get-file-content handler in main.js to handle comments and other JSON issues
ipcMain.handle('get-file-content', async (event, filePath) => {
    try {
        const content = await fsReadFile(filePath, 'utf8');

        // Check if this looks like a JSON file
        if (filePath.toLowerCase().endsWith('.json')) {
            try {
                // Try to parse it to verify it's valid JSON (but with comment handling)
                const cleanContent = content
                    .replace(/\/\/.*$/gm, '') // Remove single-line comments
                    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]+/g, '') // Remove control characters
                    .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
                    .replace(/,\s*\]/g, ']'); // Remove trailing commas in arrays

                // Just test parse, we don't need the result
                JSON.parse(cleanContent);

                // If successful, return the original content with comments for display
                // but also the cleaned content for parsing
                return {
                    success: true,
                    content: content,
                    cleanContent: cleanContent
                };
            } catch (jsonError) {
                console.error('Warning: File appears to be JSON but could not be parsed:', jsonError);
                // Return content anyway but with a warning
                return {
                    success: true,
                    content: content,
                    jsonParseError: jsonError.message
                };
            }
        } else {
            // Not a JSON file, just return the content
            return { success: true, content };
        }
    } catch (error) {
        console.error('Error reading file content:', error);
        return { success: false, error: error.message };
    }
});

// Enhanced handler to find matching files by filename - looks one more level up
ipcMain.handle('find-matching-files', async (event, { rootDir, fileName }) => {
    try {
        console.log(`Searching for ${fileName} in ${rootDir}`);

        // Also search one level up from the provided root
        const parentDir = path.dirname(rootDir);
        console.log(`Also searching one level up: ${parentDir}`);

        // Define patterns to ignore
        const ignorePatterns = [
            'node_modules',
            'bin',
            'obj',
            '.git'
        ];

        // Find all matching files in both the root directory and one level up
        const filesInRoot = await findFilesRecursively(rootDir, fileName, ignorePatterns);
        const filesInParent = await findFilesRecursively(parentDir, fileName, ignorePatterns);

        // Combine the results, removing duplicates
        const allFiles = [...new Set([...filesInRoot, ...filesInParent])];
        console.log(`Found ${allFiles.length} matching files in total`);

        return { success: true, files: allFiles };
    } catch (error) {
        console.error('Error finding matching files:', error);
        return { success: false, error: String(error.message || 'Unknown error') };
    }
});

// Recursive function to find files with matching name
async function findFilesRecursively(directory, targetFileName, ignorePatterns) {
    const results = [];

    // Check if directory should be ignored
    for (const pattern of ignorePatterns) {
        if (directory.includes(pattern)) {
            return results;
        }
    }

    try {
        // Read directory contents
        const entries = await fs.promises.readdir(directory, { withFileTypes: true });

        // Process each entry
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                try {
                    // Recursively search subdirectories
                    const subResults = await findFilesRecursively(fullPath, targetFileName, ignorePatterns);
                    results.push(...subResults);
                } catch (err) {
                    console.warn(`Error reading subdirectory ${fullPath}:`, err);
                    // Continue with other entries
                }
            } else if (entry.name === targetFileName) {
                // Found a matching file
                results.push(fullPath);
            }
        }
    } catch (error) {
        console.warn(`Error reading directory ${directory}:`, error);
        // Return whatever we found so far
    }

    return results;
}

// Updated handler to update a file with new content
ipcMain.handle('update-file', async (event, { filePath, content }) => {
    try {
        console.log(`Updating file: ${filePath}`);

        // Ensure filePath is a string
        const normalizedPath = String(filePath);

        // Check if file exists before attempting to write
        try {
            await fs.promises.access(normalizedPath, fs.constants.W_OK);
        } catch (accessError) {
            console.error(`File does not exist or is not writable: ${normalizedPath}`);
            return {
                success: false,
                error: `File does not exist or is not writable: ${normalizedPath}`
            };
        }

        // Write the file
        await fs.promises.writeFile(normalizedPath, content, 'utf8');
        console.log(`Successfully updated file: ${normalizedPath}`);

        return { success: true };
    } catch (error) {
        console.error(`Error updating file ${filePath}:`, error);
        return {
            success: false,
            error: String(error.message || 'Unknown error')
        };
    }
});

// Handler to find Git repositories
ipcMain.handle('find-git-repositories', async (event, { rootDir }) => {
    try {
        console.log(`Searching for Git repositories in: ${rootDir}`);

        // Define patterns to ignore
        const ignorePatterns = [
            'node_modules',
            'bin',
            'obj'
        ];

        // Find all .git directories
        const repositories = [];

        async function findGitDirsRecursively(dir, depth = 0) {
            // Limit search depth to avoid excessive recursion
            if (depth > 5) return;

            // Check if directory should be ignored
            for (const pattern of ignorePatterns) {
                if (dir.includes(pattern)) {
                    return;
                }
            }

            try {
                // Check if this directory contains a .git directory
                const gitDir = path.join(dir, '.git');
                try {
                    const stats = await fs.promises.stat(gitDir);
                    if (stats.isDirectory()) {
                        repositories.push(dir);
                        // If we found a Git repository, don't search its subdirectories
                        return;
                    }
                } catch (error) {
                    // .git directory doesn't exist here, continue searching
                }

                // Read directory contents
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });

                // Process each subdirectory
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const fullPath = path.join(dir, entry.name);
                        await findGitDirsRecursively(fullPath, depth + 1);
                    }
                }
            } catch (error) {
                console.warn(`Error reading directory ${dir}:`, error);
            }
        }

        // Start the recursive search
        await findGitDirsRecursively(rootDir);

        console.log(`Found ${repositories.length} Git repositories`);
        return { success: true, repositories };
    } catch (error) {
        console.error('Error finding Git repositories:', error);
        return { success: false, error: String(error.message || 'Unknown error') };
    }
});

// Improved handler to find appsettings.*.json files in a Git repository
ipcMain.handle('find-git-appsettings', async (event, { repoDir }) => {
    try {
        console.log(`Searching for appsettings.*.json files in Git repository: ${repoDir}`);

        // Try using Git to list all tracked files
        try {
            const { stdout } = await execAsync('git ls-files', { cwd: repoDir });

            // Filter for appsettings.*.json files
            const files = stdout.split('\n')
                .filter(file => file.match(/appsettings\..*\.json$/i))
                .map(file => path.join(repoDir, file));

            if (files.length > 0) {
                console.log(`Found ${files.length} appsettings.*.json files in repository using git ls-files`);
                return { success: true, files };
            }
        } catch (gitError) {
            console.warn(`Git ls-files command failed: ${gitError.message}`);
            // Fall through to the backup method
        }

        // Backup method: Use file system traversal to find appsettings files
        console.log('Using file system traversal to find appsettings.*.json files');

        const files = [];

        async function findAppSettingsFiles(dir) {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory() &&
                        !entry.name.startsWith('.') &&
                        !['node_modules', 'bin', 'obj'].includes(entry.name)) {
                        // Recursively search subdirectories
                        await findAppSettingsFiles(fullPath);
                    }
                    else if (entry.isFile() &&
                        entry.name.match(/appsettings\..*\.json$/i)) {
                        // Found a matching file
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                console.warn(`Error reading directory ${dir}:`, error);
                // Continue with other directories
            }
        }

        await findAppSettingsFiles(repoDir);
        console.log(`Found ${files.length} appsettings.*.json files in repository using filesystem traversal`);

        return { success: true, files };
    } catch (error) {
        console.error(`Error finding appsettings files in Git repository ${repoDir}:`, error);
        return { success: false, error: String(error.message || 'Unknown error') };
    }
});

// Handler to discard changes to files in a Git repository
ipcMain.handle('discard-git-changes', async (event, { repoDir, files }) => {
    try {
        console.log(`Discarding changes to ${files.length} files in repository: ${repoDir}`);

        // Convert absolute paths to paths relative to the repository
        const relativePaths = files.map(file => path.relative(repoDir, file));

        // Use Git checkout to discard changes
        const command = `git checkout -- ${relativePaths.map(p => `"${p}"`).join(' ')}`;
        console.log(`Executing command: ${command}`);

        const { stdout, stderr } = await execAsync(command, { cwd: repoDir });

        if (stderr && !stderr.includes('Already on') && !stderr.includes('Switched to branch')) {
            console.warn(`Git command produced stderr: ${stderr}`);
        }

        console.log(`Git command output: ${stdout}`);
        return { success: true };
    } catch (error) {
        console.error(`Error discarding changes in Git repository ${repoDir}:`, error);
        return { success: false, error: String(error.message || 'Unknown error') };
    }
});

// Handler to find Git repository root using git command
ipcMain.handle('get-git-root', async (event, { startDir }) => {
    try {
        console.log(`Attempting to find Git root from: ${startDir}`);

        // Try using git rev-parse to find the repository root
        const { stdout } = await execAsync('git rev-parse --show-toplevel', {
            cwd: startDir
        });

        // Normalize the path
        const gitRoot = stdout.trim().replace(/\\/g, '/');
        console.log(`Git root found: ${gitRoot}`);

        return { success: true, gitRoot };
    } catch (error) {
        console.log(`Git command failed: ${error.message}`);

        // Try a different approach: check if we're in a submodule
        try {
            const { stdout } = await execAsync('git rev-parse --git-dir', {
                cwd: startDir
            });

            // Handle the case where we're in a submodule
            const gitDir = stdout.trim();
            if (gitDir && gitDir !== '.git') {
                const potentialRoot = path.resolve(startDir, path.dirname(gitDir));
                console.log(`Potential Git root (submodule): ${potentialRoot}`);
                return { success: true, gitRoot: potentialRoot };
            }
        } catch (subError) {
            console.log(`Submodule check failed: ${subError.message}`);
        }

        return { success: false, error: String(error.message || 'Unknown error') };
    }
});

// Handler for opening URLs in default browser
ipcMain.on('open-external-url', (event, { url }) => {
    try {
        console.log(`Opening URL in browser: ${url}`);
        shell.openExternal(url);
    } catch (error) {
        console.error(`Error opening URL: ${error.message}`);
    }
});

// Improved handler for reading files
ipcMain.handle('read-file', async (event, { filePath }) => {
    try {
        console.log(`Reading file: ${filePath}`);

        // Check if file exists and is readable
        try {
            await fs.promises.access(filePath, fs.constants.R_OK);
        } catch (accessError) {
            console.error(`File does not exist or is not readable: ${filePath}`);
            return {
                success: false,
                error: `File does not exist or is not readable: ${filePath}`
            };
        }

        // Read the file content with explicit UTF-8 encoding
        const content = await fs.promises.readFile(filePath, { encoding: 'utf8' });

        // Basic validation for JSON files
        if (filePath.toLowerCase().endsWith('.json')) {
            try {
                // Check if content is valid JSON by attempting to parse it
                JSON.parse(content);
                // If parsing succeeds, return the original content
                return { success: true, content };
            } catch (parseError) {
                console.warn(`File contains invalid JSON, but returning content anyway: ${parseError.message}`);
                // Return the content even if it's not valid JSON
                // The renderer will attempt to fix and parse it
                return { success: true, content };
            }
        }

        return { success: true, content };
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return {
            success: false,
            error: String(error.message || 'Unknown error')
        };
    }
});

