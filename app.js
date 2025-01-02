const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const port = 3933;

// Middleware to parse JSON data
app.use(bodyParser.json());

// Serve static files (CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/environments', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'environments.html'));
});

// Route to get all environment configurations
app.get('/api/environments', (req, res) => {
    fs.readFile('./panel/config.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send(err);
        }
        const environments = JSON.parse(data);
        res.json(environments);
    });
});

// Route to save a new environment configuration
app.post('/add-environment', (req, res) => {
    const { name, value } = req.body;

    if (!name || !value) {
        return res.status(400).send('Environment name and value are required');
    }

    fs.readFile('./panel/config.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading config file');
        }

        const environments = JSON.parse(data);
        environments.push({ name, value });

        fs.writeFile('./panel/config.json', JSON.stringify(environments, null, 2), 'utf8', (err) => {
            if (err) {
                return res.status(500).send('Error saving configuration');
            }
            res.status(200).send('Configuration saved!');
        });
    });
});

// Route to update the AppSetting value
app.post('/update-environment', (req, res) => {
    const { selectedEnv } = req.body;

    if (!selectedEnv) {
        return res.status(400).send('Selected environment is required');
    }

    fs.readFile('./panel/config.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading config file');
        }

        const environments = JSON.parse(data);
        const env = environments.find((env) => env.name === selectedEnv);
        if (!env) {
            return res.status(404).send('Environment not found');
        }

        // Assuming you want to update a file (e.g., app settings) here
        const files = require('./files.json'); // Replace this with the actual file path

        files.forEach(async (file) => {
            const updatedContent = {
                "AppSettings": {
                    "AppSettingvalue": env.value
                },
                "ApplicationInsights": {
                    "ConnectionString": ""
                },
                "Logging": {
                    "LogLevel": {
                        "Default": "Warning",
                        "Hangfire": "Information"
                    }
                },
                "ApiRateLimiter": {
                    "DefaultFixedWindow": 30, // in seconds
                    "DefaultFixedLimit": 5000,
                    "HighCapecityFixedWindow": 30, // in seconds
                    "HighCapecityFixedLimit": 10000,
                    "DistributedFixedWindow": 60, // in seconds
                    "DistributedFixedLimit": 100,
                    "ConcurrencyRateLimit": 500
                },
                "SignalRSetting": {
                    "IsEnabled": false
                }
            };
            await fs.promises.writeFile(file, JSON.stringify(updatedContent, null, 2), 'utf8');
        });

        res.status(200).send('Active Environment Updated');
    });
});

// Route to delete environment
app.delete('/api/environments/:name', (req, res) => {
    const { name } = req.params;
    fs.readFile('./panel/config.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading config file');
        }
        let environments = JSON.parse(data).filter(env => env.name !== name);
        fs.writeFile('./panel/config.json', JSON.stringify(environments, null, 2), 'utf8', (err) => {
            if (err) {
                return res.status(500).send('Error deleting environment');
            }
        });
        res.status(200).json({ message: 'Environment deleted successfully!' });
    });
});

app.get('/checkout', (req, res) => {
    // Folder path (you can pass this from the request body if needed)
    const folderPath = "D:\\Projects\\24092024_Community\\Community"; // Update folder path here

    console.log(folderPath);

    // Git command to discard changes in .json files
    const gitCommand = '"C:\\Program Files\\Git\\bin\\git.exe" checkout -- *.json'; // Full path to git

    // Run the Git command in the specified folder
    exec(gitCommand, { cwd: folderPath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: `Error executing git command: ${error.message}` });
        }
        if (stderr) {
            return res.status(500).json({ error: `stderr: ${stderr}` });
        }

        res.redirect('/');
    });
});

app.get('/csproj', (req, res) => {
    // Folder path (you can pass this from the request body if needed)
    const folderPath = "D:\\Projects\\24092024_Community\\Community"; // Update folder path here

    console.log(folderPath);

    // Git command to discard changes in .json files
    const gitCommand = '"C:\\Program Files\\Git\\bin\\git.exe" checkout -- *.csproj'; // Full path to git

    // Run the Git command in the specified folder
    exec(gitCommand, { cwd: folderPath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: `Error executing git command: ${error.message}` });
        }
        if (stderr) {
            return res.status(500).json({ error: `stderr: ${stderr}` });
        }

        res.redirect('/');
    });
});

// Function to recursively get all .csproj files in the folder
const getCsprojFiles = (dir, files = []) => {
    const items = fs.readdirSync(dir); // Read the content of the directory

    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            // If it's a directory, recurse into it
            getCsprojFiles(fullPath, files);
        } else if (stats.isFile() && item.endsWith('.csproj')) {
            // If it's a .csproj file, add to the files array
            files.push(fullPath);
        }
    });

    return files;
};
app.get('/exclude', (req, res) => {
    const rootFolderPath = 'D:\\Projects\\24092024_Community\\Community'; // Root folder path

    // Get all .csproj files from the folder (recursively)
    const csprojFiles = getCsprojFiles(rootFolderPath);

    if (csprojFiles.length === 0) {
        return res.status(404).json({ message: 'No .csproj files found' });
    }

    // Process each .csproj file to remove migration references
    csprojFiles.forEach((csprojFile) => {
        fs.readFile(csprojFile, 'utf8', (readError, data) => {
            if (readError) {
                console.error(`Error reading file ${csprojFile}: ${readError.message}`);
                return;
            }

            // Create a regular expression to find migration references
            const migrationPattern = /<None Include=".*(Migrations|Migration).*\.cs" \/>/g;

            // Remove all migration file references
            const updatedData = data.replace(migrationPattern, '');

            // Only write back if the data has changed
            if (updatedData !== data) {
                fs.writeFile(csprojFile, updatedData, 'utf8', (writeError) => {
                    if (writeError) {
                        console.error(`Error writing to file ${csprojFile}: ${writeError.message}`);
                        return;
                    }

                    console.log(`Migration references removed from: ${csprojFile}`);
                });
            }
        });
    });

    res.status(200).json({ message: 'Migration files excluded from .csproj files successfully' });
});

app.post('/api/setPath', (req, res) => {

    // Get the folder path from the request body 
    const folderPath = req.query.folderPath;

    // Read the system configuration file
    const systemConfigPath = path.resolve('./panel/system.json');
    const systemConfig = JSON.parse(fs.readFileSync(systemConfigPath, 'utf-8'));

    // Update the project path
    systemConfig.projectPath = folderPath;

    // Save the updated system configuration
    fs.writeFileSync(systemConfigPath, JSON.stringify(systemConfig, null, 2), 'utf-8');

    res.json({ message: 'Project path updated successfully', path: systemConfigPath });

});

app.get('/getEnvFiles', (req, res) => {
    try {
        const systemConfigPath = path.resolve('./panel/system.json');
        const systemConfig = JSON.parse(fs.readFileSync(systemConfigPath, 'utf-8'));

        const folderPath = systemConfig.projectPath;
        systemConfig.appSettingsLoaded = true;

        // Save updated system configuration
        fs.writeFileSync(systemConfigPath, JSON.stringify(systemConfig, null, 2), 'utf-8');

        const outputPath = path.resolve('./panel/filesTemp.json');
        saveFileSearchResults(folderPath, outputPath); // Ensure this function is defined

        const files = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

        res.json({ message: 'Environment files found successfully', data: files });
    } catch (error) {
        console.error('Error fetching environment files:', error);
        res.status(500).json({ error: error});
    }
});



// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


/**
 * Recursively searches for files matching a specific name at any depth in a directory.
 * @param {string} dir - Starting directory path
 * @param {string} targetFileName - Name of the file to search for
 * @param {string[]} ignoredFolders - List of folder names to ignore
 * @returns {string[]} - List of file paths matching the target file name
 */
function findFilesByName(dir, targetFileName, ignoredFolders) {
    let matchingFiles = [];

    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const isDirectory = fs.statSync(fullPath).isDirectory();

        if (isDirectory) {
            if (!ignoredFolders.includes(item)) {
                // Recursively search in subdirectories
                matchingFiles = matchingFiles.concat(findFilesByName(fullPath, targetFileName, ignoredFolders));
            }
        } else if (item === targetFileName) {
            matchingFiles.push(fullPath);
        }
    });

    return matchingFiles;
}

/**
 * Searches for all instances of 'appsettings.dev.json' and saves the results to a JSON file.
 * @param {string} folderPath - Starting folder path
 * @param {string} outputPath - Path to save the JSON output
 */
function saveFileSearchResults(folderPath, outputPath) {
    try {
        const targetFileName = 'appsettings.dev.json';
        const ignoredFolders = ['.git', 'node_modules', 'dist', 'build'];
        const foundFiles = findFilesByName(folderPath, targetFileName, ignoredFolders);

        const resultData = { foundFiles };

        fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2));
        console.log(`Results saved to: ${outputPath}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}
