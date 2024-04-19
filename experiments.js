const express = require('express');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar-fs');
const lzma = require('lzma-native');
const csv = require('csv-parser');
const path = require('path');

async function readCsvFile(filePath) {
    const gameData = {};

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const gameId = row.GAME_ID;
                const homeTeam = row.PLAYER1_TEAM_NICKNAME;
                const visitorTeam = row.PLAYER2_TEAM_NICKNAME;
                const player3Team = row.PLAYER3_TEAM_NICKNAME;
                const game = gameData[gameId] || { teams: new Set(), events: [] };

                // Collecting teams
                if (homeTeam) game.teams.add(homeTeam);
                if (visitorTeam) game.teams.add(visitorTeam);
                if (player3Team) game.teams.add(player3Team);

                // Collecting event details
                const event = {
                    eventnum: +row.EVENTNUM,
                    score: row.SCORE,
                    score_diff: row.SCOREMARGIN,
                    time_left: row.PCTIMESTRING,
                    period: +row.PERIOD,
                    etype: +row.EVENTMSGTYPE,
                    description: (row.HOMEDESCRIPTION || '') + (row.NEUTRALDESCRIPTION || '') + (row.VISITORDESCRIPTION || ''),
                    player1_team: row.PLAYER1_TEAM_NICKNAME,
                    player2_team: row.PLAYER2_TEAM_NICKNAME,
                    player3_team: row.PLAYER3_TEAM_NICKNAME,
                    emsg: +row.EVENTMSGACTIONTYPE
                };
                game.events.push(event);

                gameData[gameId] = game;
            })
            .on('end', () => {
                // Convert Set to Array and ensure only games with unique teams are included
                const result = Object.entries(gameData).map(([gameId, data]) => {
                    return {
                        gameId: gameId,
                        teams: Array.from(data.teams),
                        events: data.events
                    };
                }).filter(game => game.teams.length === 2); // Filter out games that don't have exactly two unique teams

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

async function getFormattedNBAData(seasons, data, seasontype = 'rg') {
    try {
        const csvPaths = await getNBAData(seasons, data, seasontype);
        let allGamesData = [];

        console.log(csvPaths)

        for (let csvPath of csvPaths) {
            const gameData = await readCsvFile(csvPath);

            // console.log(gameData)
            allGamesData.push(...gameData);
        }
        return allGamesData
    } catch (error) {
        console.error('Failed to fetch or format NBA data:', error);
        return [];
    }
}


const gameData = getFormattedNBAData([2022], 'nbastats', 'rg')
