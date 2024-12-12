const fs = require('fs');
const path = require('path');

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

const folderPath = 'D:\\Projects\\24092024_Community\\Community'; // Adjust as needed
const outputPath = './foundFiles.json'; // Output file

saveFileSearchResults(folderPath, outputPath);
