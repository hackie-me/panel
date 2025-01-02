const fs = require('fs');
const path = require('path');

/**
 * Recursively searches for files by name at any depth in a directory.
 * @param {string} dir - Starting directory path
 * @param {string} filePrefix - Prefix of the file name to search for
 * @param {string} fileSuffix - Suffix of the file name to search for
 * @param {string[]} ignoredFolders - List of folder names to ignore
 * @returns {string[]} - List of file paths matching the name criteria
 */
function findFilesByName(dir, filePrefix, fileSuffix, ignoredFolders) {
    let matchingFiles = [];

    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const isDirectory = fs.statSync(fullPath).isDirectory();

        if (isDirectory) {
            if (!ignoredFolders.includes(item)) {
                // Recursively search in subdirectories
                matchingFiles = matchingFiles.concat(findFilesByName(fullPath, filePrefix, fileSuffix, ignoredFolders));
            }
        } else if (item.startsWith(filePrefix) && item.endsWith(fileSuffix)) {
            matchingFiles.push(fullPath);
        }
    });

    return matchingFiles;
}

/**
 * Saves the search results into separate files for each environment (e.g., dev, prod).
 * @param {string} folderPath - Starting folder path
 * @param {string} outputFolder - Folder to save the output files
 */
function saveFileSearchResults(folderPath, outputFolder) {
    try {
        const filePrefix = 'appsettings.'; // Prefix to match
        const fileSuffix = '.json'; // Suffix to match
        const ignoredFolders = ['.git', 'node_modules', 'dist', 'build', 'bin'];
        const foundFiles = findFilesByName(folderPath, filePrefix, fileSuffix, ignoredFolders);

        // Group files by environment (i.e., by the part of the filename after 'appsettings.')
        const envFiles = {};

        foundFiles.forEach(filePath => {
            const fileName = path.basename(filePath);
            const env = fileName.split('.')[1]; // Extract environment name (e.g., dev, prod)

            if (!envFiles[env]) {
                envFiles[env] = [];
            }
            envFiles[env].push(filePath);
        });

        // Create a separate output file for each environment
        Object.keys(envFiles).forEach(env => {
            const outputFilePath = path.join(outputFolder, `foundfiles.${env}.json`);
            const resultData = { foundFiles: envFiles[env] };

            fs.writeFileSync(outputFilePath, JSON.stringify(resultData, null, 2));
            console.log(`Results for ${env} saved to: ${outputFilePath}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}

const folderPath = 'D:\\Projects\\24092024_Community\\Community'; // Adjust as needed
const outputFolder = './'; // Output folder where you want the files saved

saveFileSearchResults(folderPath, outputFolder);
