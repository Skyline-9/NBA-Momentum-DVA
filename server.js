const express = require('express');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar-fs');
const lzma = require('lzma-native');
const csv = require('csv-parser');
const path = require('path');
const app = express();
const port = 3000;

const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger-output.json');

// getNBAData([2022], 'datanba', 'rg', true)
app.use(express.static('public'));

app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.get('/api/game/:gameID', (req, res) => {
    // #swagger.description = 'Fetch NBA boxscore data for a given game'

    const gameID = req.params.gameID;
    axios.get(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_00${gameID}.json`).then(response => {
        res.json(response.data);
    })
        .catch(error => {
            console.error(error);
            res.status(500).send(`Error fetching game data for ${gameID}`);
        });
});

app.get("/api/pace/:year", async (req, res) => {
    // #swagger.description = 'Fetch NBA pace for a given season. Note that year here is the END of the season'
    /* #swagger.responses[200] = {
          description: 'Season pace data for every team and league average.',
    } */

    const year = req.params.year;

    // Check if file is cached
    const path = `./public/data/pace/${year}-pace.json`;
    if (fs.existsSync(path)) {
        console.log("Pace data already exists, reading file...");

        try {
            const paceData = JSON.parse(fs.readFileSync(path));
            res.json(paceData);
            return;
        } catch (error) {
            console.error(error);
            res.status(500).send("Error reading from cached pace data!");
        }
    }

    // Download file
    // IMPORTANT: Change endpoint url if file is moved
    const paceDataUrl = `https://raw.githubusercontent.com/Skyline-9/NBA-Pace-Data/main/data/${year}-pace.json`;
    axios.get(paceDataUrl).then(response => {
        // Create folder if doesn't exist
        fs.promises.mkdir('./public/data/pace', {recursive: true}).catch(console.error);

        // Write response.data to file
        fs.writeFile(`./public/data/pace/${year}-pace.json`, JSON.stringify(response.data), {recursive: true}, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log("Pace file properly cached!");
            }
        });

        res.json(response.data);
    })
        .catch(error => {
            console.error(error);
            res.status(500).send("Error downloading pace data!")
        });
})

app.get('/api/nba_season/:year', async (req, res) => {
    // #swagger.description = 'Fetch NBA data for a given year. Note that year here is the START of the season'
    /* #swagger.responses[200] = {
          description: 'List of games in NBA season.',
    } */

    const year = req.params.year;
    console.log(`Chosen year is ${year}`);
    try {
        // Check if the data is already downloaded
        const checkPath = `./public/data/nbastats_${year}/nbastats_${year}.csv`;
        if (fs.existsSync(checkPath)) {
            console.log("File already exists, reading directly...")

            const gamesData = await readCsvFile(checkPath);
            res.json(gamesData); // Send the data back to the client
            return;
        }

        console.log("File does not exist, fetching...");

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
            const {data: fileData} = await axios.get(element, {responseType: 'arraybuffer'});
            const fileName = `${name}.tar.xz`;


            fs.writeFileSync(fileName, fileData);

            if (untar) {
                const extractionPath = `./public/data/${name}`;
                fs.mkdirSync(extractionPath, {recursive: true});

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
