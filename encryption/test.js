const fs = require('fs');

// Path to your TypeScript file
const filePath = '1.ts';

// Read the file contents
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }

  // Regular expressions to find 'tablename' keys and their values
  const directAssignmentRegex = /tablename:\s*'([^']+)'/g;
  const separateAssignmentRegex = /\.tablename\s*=\s*(this\.\w+\s*\+\s*)?'([^']+)'/g;

  const tableNames = {};
  let match;

  // Extract table names from direct assignments
  while ((match = directAssignmentRegex.exec(data)) !== null) {
    const tableName = match[1].split(' ')[0];
    if (tableNames[tableName]) {
      tableNames[tableName]++;
    } else {
      tableNames[tableName] = 1;
    }
  }

  // Extract table names from separate assignments
  while ((match = separateAssignmentRegex.exec(data)) !== null) {
    const tableName = match[2].split(' ')[0];
    if (tableNames[tableName]) {
      tableNames[tableName]++;
    } else {
      tableNames[tableName] = 1;
    }
  }

  // Print unique table names with their counts
  console.log('Unique table names with counts:');
  for (const [tableName, count] of Object.entries(tableNames)) {
    console.table(`${tableName}: ${count}`);
  }
});
