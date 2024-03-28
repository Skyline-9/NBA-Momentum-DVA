const fs = require('fs');
const axios = require('axios');
const tar = require('tar-fs');
const lzma = require('lzma-native');
const csv = require('csv-parser');
const util = require('util');
const path = require('path');

const games = {};

async function getNBAData(seasons, data, seasontype = 'rg', untar = false) {
    if (!Array.isArray(seasons)) {
        seasons = [seasons];
    }
    if (typeof data === 'string') {
        data = [data];
    }

    let needData;
    if (seasontype === 'rg' || seasontype === 'po') {
        needData = data.flatMap(d => seasons.map(season => `${d}_${seasontype === 'rg' ? '' : seasontype + '_'}${season}`));
    } else {
        const needDataRg = data.flatMap(d => seasons.map(season => `${d}_${season}`));
        const needDataPo = data.flatMap(d => seasons.map(season => `${d}_po_${season}`));
        needData = [...needDataRg, ...needDataPo];
    }

    let csvPaths = []; // To store paths of extracted CSV files

    try {
        const response = await axios.get('https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt');
        const availableFiles = response.data.trim().split('\n').map(line => line.split('='));
        const needElements = availableFiles.filter(([name]) => needData.includes(name));

        for (let [name, element] of needElements) {
            const { data: fileData } = await axios.get(element, { responseType: 'arraybuffer' });
            const fileName = `${name}.tar.xz`;
            fs.writeFileSync(fileName, fileData);

            if (untar) {
                const extractionPath = `./${name}`;
                fs.mkdirSync(extractionPath, { recursive: true });

                const decompressor = lzma.createDecompressor();
                const tarExtractor = tar.extract(extractionPath);

                await new Promise((resolve, reject) => {
                    fs.createReadStream(fileName)
                    .pipe(decompressor)
                    .pipe(tarExtractor)
                    .on('finish', () => {
                        console.log(`Extraction complete for ${name}`);
                        fs.unlinkSync(fileName); // Remove the .tar.xz file after extraction
                        resolve();
                    })
                    .on('error', (error) => {
                        console.error(`Extraction error for ${name}:`, error);
                        reject(error);
                    });
                });

                // Assume the CSV file has a predictable name or is the only file in the directory
                const filesInDir = fs.readdirSync(extractionPath);
                const csvFile = filesInDir.find(f => f.endsWith('.csv'));
                if (csvFile) {
                    csvPaths.push(path.join(extractionPath, csvFile));
                }
            }
        }

        return csvPaths;
    } catch (error) {
        console.error('Failed to download or extract files:', error);
    }
}

async function readCsvFiles(csvPaths) {
    // Object to store game data
    const gamesData = {};

    // Helper function to process each row
    function processRow(row) {
        const gameID = row.GAME_ID;
        if (gameID) {
            // Initialize game entry if it does not exist
            if (!gamesData[gameID]) {
                gamesData[gameID] = {
                    date: row.wallclk.split('T')[0], // Extract the date part
                    teams: new Set() // Use a Set to capture unique teams
                };
            }

            // Regular expression to match team abbreviations in the description
            const teamRegex = /\[([A-Z]{2,3})\s?[\d-]*\]/g;
            let match;
            while ((match = teamRegex.exec(row.de)) !== null) {
                // Add the team abbreviation to the set for the game
                gamesData[gameID].teams.add(match[1]);
            }
        }
    }

    // Wait for all CSVs to be processed
    const processCsvPromises = csvPaths.map(csvPath => {
        return new Promise((resolve, reject) => {
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', processRow)
                .on('end', () => {
                    console.log(`CSV file ${csvPath} has been processed.`);
                    resolve();
                })
                .on('error', reject);
        });
    });

    // Wait for all promises to resolve
    await Promise.all(processCsvPromises);

    // After all CSV files are processed, output the results
    const output = Object.entries(gamesData).map(([gameID, { date, teams }]) => {
        // Ensure we only have two teams per game
        const teamNames = [...teams];
        if (teamNames.length === 2) {
            return `${gameID}, ${date}, ${teamNames[0]} vs ${teamNames[1]}`;
        }
    }).filter(Boolean); // Filter out any undefined entries

    console.log('Unique Games, Dates, and Teams:');
    console.log(output.join('\n'));
}

console.log('Script started');
getNBAData([2022], 'datanba', 'rg', true).then(csvPaths => {
    if (csvPaths.length > 0) {
        readCsvFiles(csvPaths);
    } else {
        console.log('No CSV files to read.');
    }
});
