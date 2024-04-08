const express = require('express');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar-fs');
const lzma = require('lzma-native');
const csv = require('csv-parser');
const util = require('util');
const path = require('path');
const app = express();
const port = 3000;

// getNBAData([2022], 'datanba', 'rg', true)
app.use(express.static('public'));
app.get('/fetch-nba-data/:year', async (req, res) => {
    const year = req.params.year;
    console.log(`Chosen year is ${year}`);
    try {
        const csvPaths = await getNBAData([year], 'nbastats', 'rg', true);
        const gamesData = await readCsvFile(csvPaths[0]);
        res.json(gamesData); // Send the data back to the client
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching NBA data');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
async function readCsvFile(filePath) {
    const gameData = {};
  
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const gameId = row.GAME_ID;
          const homeTeam = row.PLAYER1_TEAM_NICKNAME;
          const visitorTeam = row.PLAYER2_TEAM_NICKNAME;
          const teams = gameData[gameId] || new Set();
  
          if (homeTeam) teams.add(homeTeam);
          if (visitorTeam) teams.add(visitorTeam);
  
          gameData[gameId] = teams;
        })
        .on('end', () => {
          // Convert Set to Array and filter out games with less than 2 teams (if any)
          const result = Object.entries(gameData).map(([gameId, teamsSet]) => {
            return [gameId, ...teamsSet];
          }).filter(game => game.length === 3); // Ensure only games with exactly two teams are included
  
          resolve(result);
        })
        .on('error', (error) => reject(error));
    });
  }

async function getNBAData(seasons, data, seasontype = 'rg', untar = true) {

    
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

    
    //console.log(needData)

    try {
        const response = await axios.get('https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt');
        const availableFiles = response.data.trim().split('\n').map(line => line.split('='));
        const needElements = availableFiles.filter(([name]) => needData.includes(name));

        
        //console.log(availableFiles)
        //console.log(needElements)

        for (let [name, element] of needElements) {
            const { data: fileData } = await axios.get(element, { responseType: 'arraybuffer' });
            const fileName = `${name}.tar.xz`;

            
            fs.writeFileSync(fileName, fileData);

            if (untar) {
                const extractionPath = `./public/${name}`;
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
