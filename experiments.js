const express = require('express');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar-fs');
const lzma = require('lzma-native');
const csv = require('csv-parser');
const path = require('path');

// import {getMomentum} from "./public/calculations.js";
/**
 * File: calculations.js
 * Description: Various calculation methods for calculating momentum.
 */

const TEAM_TO_FULL_NAME = {
    "warriors": "Golden State Warriors",
    "clippers": "Los Angeles Clippers",  // IMPORTANT: Also check for San Diego Clippers!!
    "lakers": "Los Angeles Lakers",
    "suns": "Phoenix Suns",
    "kings": "Sacramento Kings",
    "mavericks": "Dallas Mavericks",
    "rockets": "Houston Rockets",
    "grizzlies": "Memphis Grizzlies",
    "vancouver": "Vancouver Grizzlies",
    "pelicans": "New Orleans Pelicans",
    "spurs": "San Antonio Spurs",
    "nuggets": "Denver Nuggets",
    "timberwolves": "Minnesota Timberwolves",
    "thunder": "Oklahoma City Thunder",
    "trail blazers": "Portland Trail Blazers",
    "jazz": "Utah Jazz",
    "hawks": "Atlanta Hawks",
    "celtics": "Boston Celtics",
    "nets": "Brooklyn Nets",
    "jerseys": "New Jersey Nets",
    "hornets": "Charlotte Hornets",
    "bobcats": "Charlotte Bobcats",
    "bulls": "Chicago Bulls",
    "cavaliers": "Cleveland Cavaliers",
    "pistons": "Detroit Pistons",
    "pacers": "Indiana Pacers",
    "heat": "Miami Heat",
    "bucks": "Milwaukee Bucks",
    "knicks": "New York Knicks",
    "magic": "Orlando Magic",
    "76ers": "Philadelphia 76ers",
    "raptors": "Toronto Raptors",
    "wizards": "Washington Wizards",
    "supersonics": "Seattle SuperSonics",
};

function ScoreNormalizedMomentum(gameData, interval = 10, scaling = 60) {
    // if use points/timeDiff, the value is higher, the momentum is higher
    function calMomentum(teamQueue) {
        let sumNormalizedTime = 0;
        // calculate for 5 events
        if (teamQueue.length < interval) {
            return 0;
        }
        // loop the queue
        for (let i = 1; i < teamQueue.length; i++) {
            const scoreChange = teamQueue[i].score - teamQueue[i - 1].score;
            const timeDiff = teamQueue[i].time_s - teamQueue[i - 1].time_s;
            // make sure that the time changed
            if (timeDiff !== 0) {
                sumNormalizedTime += scaling * scoreChange / timeDiff;
            } else {
                sumNormalizedTime += 0;
            }
        }
        return sumNormalizedTime;
    }

    // deep copy to not change the original object
    let new_gameData = JSON.parse(JSON.stringify(gameData));

    // set queue (length<=5) to save time and score
    let homeTeamQueue = [];
    let awayTeamQueue = [];
    let homeTeamMomentum = 0;
    let awayTeamMomentum = 0;
    let cur_period = 0;

    // get the momentum for each event
    new_gameData.forEach((event, index) => {
        if (!event.score) {
            return; // the last is no score
        }
        // get scores of two time (return int)
        const homeTeamScore = parseInt(event.score.split('-')[1]);
        const awayTeamScore = parseInt(event.score.split('-')[0]);

        // clear the data for each new period
        if (event.period !== cur_period) {
            cur_period = event.period;
            homeTeamQueue = [{time_s: event.t, score: homeTeamScore}];
            awayTeamQueue = [{time_s: event.t, score: awayTeamScore}];
            homeTeamMomentum = 0;
            awayTeamMomentum = 0;
        } else {

            homeTeamQueue.push({time_s: event.t, score: homeTeamScore});
            awayTeamQueue.push({time_s: event.t, score: awayTeamScore});

            // if the length >5, remove the oldest one
            if (homeTeamQueue.length > interval) {
                homeTeamQueue.shift();
            }
            homeTeamMomentum = calMomentum(homeTeamQueue);

            // if the length >5, remove the oldest one
            if (awayTeamQueue.length > interval) {
                awayTeamQueue.shift();
            }
            awayTeamMomentum = calMomentum(awayTeamQueue);
        }

        // add 2 momentum to the object
        event.homeTeamMomentum = homeTeamMomentum;
        event.awayTeamMomentum = awayTeamMomentum
        event.totalScoreNormalizedMomentum = homeTeamMomentum - awayTeamMomentum;
    });
    return new_gameData
}

function PAPM(gameData, paceData, homeTeam, awayTeam, windowSize = 180) {
    let new_gameData = JSON.parse(JSON.stringify(gameData));

    const leaguePace = paceData["League Average"];
    const homePace = paceData[TEAM_TO_FULL_NAME[homeTeam]];
    const awayPace = paceData[TEAM_TO_FULL_NAME[awayTeam]];

    const Madj = leaguePace / (0.5 * homePace + 0.5 * awayPace);
    new_gameData.forEach((event, index) => {
        if (!event.score) return;

        const homeTeamScore = parseInt(event.score.split('-')[1], 10);
        const awayTeamScore = parseInt(event.score.split('-')[0], 10);
        const eventTime = event.t;

        // Find the index of the event 3 minutes (180 seconds) ago
        let prevIndex = index;
        while (prevIndex > 0 && eventTime - new_gameData[prevIndex - 1].t <= windowSize) {
            prevIndex--;
        }

        // Calculate points scored and points given up within the 3-minute window
        let pointsScored, pointsGivenUp;
        if (prevIndex === 0) {
            pointsScored = homeTeamScore;
            pointsGivenUp = awayTeamScore;
        } else {
            const prevHomeScore = parseInt(new_gameData[prevIndex].score.split('-')[1], 10);
            const prevAwayScore = parseInt(new_gameData[prevIndex].score.split('-')[0], 10);
            pointsScored = homeTeamScore - prevHomeScore;
            pointsGivenUp = awayTeamScore - prevAwayScore;
        }

        // Calculate PAPM
        event.PAPM = (1 / Madj) * (pointsScored - pointsGivenUp);
    });

    return new_gameData;
}

function convertToSeconds(timeStr) {
    let parts = timeStr.split(':'); // Split the string by colon
    let minutes = parseInt(parts[0], 10); // Convert minutes to integer
    let seconds = parseInt(parts[1], 10); // Convert seconds to integer
    return minutes * 60 + seconds; // Calculate total seconds
}

function MAMBA(gameData, paceData, homeTeam, awayTeam, multiplier = 1.1, maxInterval = 80) {
    const leaguePace = paceData["League Average"];

    const homePace = paceData[TEAM_TO_FULL_NAME[homeTeam]];
    const awayPace = paceData[TEAM_TO_FULL_NAME[awayTeam]];

    const Madj = leaguePace / (0.5 * homePace + 0.5 * awayPace);

    // Helper function to calculate MAMBA for each team
    // function calculateMAMBAsForTeam(teamQueue, team) {
    //     let momentum = 0;
    //     let mult = 1; // Start with a multiplier of 1
    //     let windowStartIndex = 0; // Start of the 3-minute window
    //     let lastScoringTeam = null; // Track the last team that scored
    //
    //     for (let i = 0; i < teamQueue.length; i++) {
    //         let currentEvent = teamQueue[i];
    //
    //         // Check if the last scoring event was by the opposing team to reset the multiplier
    //         if (lastScoringTeam && lastScoringTeam !== team) {
    //             mult = 1;
    //         }
    //
    //         // Calculate momentum for events within the window
    //         if (currentEvent.dt % 3 === 0) {
    //             momentum += currentEvent.points * mult;
    //             mult *= multiplier; // Increase multiplier
    //         }
    //
    //         // Update last scoring team
    //         lastScoringTeam = team;
    //     }
    //
    //     return momentum;
    // }

    function calculateMAMBAsForTeam(events, Madj) {
        /**
         * Helper function to calculate NET MAMBAs
         * @param {Array} events - Array of events
         * @returns {Array} - Array of MAMBAs values, first element is the MAMBA value, second element is the time
         */
        const mambaS = [];

        const homeTeamQueue = [];
        const awayTeamQueue = [];

        let multi = 0;
        let lastTeamScore = null;
        let previousScore = events[0].score;
        events.forEach((event, i) => {
            if (!event.score) return;

            // Remove events from the queue until they match the window
            while (homeTeamQueue.length > 0 && event.t - homeTeamQueue[0].time > maxInterval) {
                homeTeamQueue.shift();
            }

            while (awayTeamQueue.length > 0 && event.t - awayTeamQueue[0].time > maxInterval) {
                awayTeamQueue.shift();
            }

            if (event.score !== previousScore) {
                const previousHomeTeamScore = parseInt(previousScore.split('-')[1], 10);
                const previousAwayTeamScore = parseInt(previousScore.split('-')[0], 10);
                const homeTeamScore = parseInt(event.score.split('-')[1], 10);
                const awayTeamScore = parseInt(event.score.split('-')[0], 10);

                // Away team scores
                if (awayTeamScore > previousAwayTeamScore) {
                    // Check if we update multiplier
                    if (lastTeamScore == null || lastTeamScore === 'home') {
                        multi = 1;
                        lastTeamScore = 'away';
                    } else {
                        multi *= multiplier;
                    }

                    awayTeamQueue.push({prun: multi * (awayTeamScore - previousAwayTeamScore), time: event.t});
                } else {
                    // Check if we update multiplier
                    if (lastTeamScore == null || lastTeamScore === 'away') {
                        multi = 1;
                        lastTeamScore = 'home';
                    } else {
                        multi *= multiplier;
                    }

                    homeTeamQueue.push({prun: multi * (homeTeamScore - previousHomeTeamScore), time: event.t});
                }

                // Calculate MAMBAs
                let homeTeamSum = 0;
                homeTeamQueue.forEach(element => {
                    homeTeamSum += element.prun;
                });

                let awayTeamSum = 0;
                awayTeamQueue.forEach(element => {
                    awayTeamSum += element.prun;
                });

                const calc = 1 / Madj * (homeTeamSum - awayTeamSum);

                // Update MAMBAs
                mambaS.push([calc, event.t]);

                previousScore = event.score;
            }
        });

        return mambaS;
    }

    function calculateMAMBAeForTeam(events) {
        /**
         * Calculate MAMBAe for both teams
         * @param {Array} events - Array of events
         * @returns {Array} - Array of MAMBAe values for both teams. First element is home team, second element is away team
         */
        let teamStats = {};

        // Necessary Preprocessing: Create a dictionary of cumulative team stats for all necesssary variables
        events.forEach((event, i) => {
            if (event.player1_team && !teamStats[event.player1_team]) {
                teamStats[event.player1_team] = [];
            }

            if (event.player2_team && !teamStats[event.player2_team]) {
                teamStats[event.player2_team] = [];
            }

            if (event.player3_team && !teamStats[event.player3_team]) {
                teamStats[event.player3_team] = [];
            }

            function getLastStats(team) {
                if (teamStats[team].length > 0) {
                    return {...teamStats[team][teamStats[team].length - 1]};
                }
                return {shotsMade: 0, shotsAttempted: 0, steals: 0, blocks: 0, OReb: 0, time: event.t};
            }

            if (event.etype === 1 && event.player1_team) {
                let lastStats = getLastStats(event.player1_team);
                let stats = {
                    shotsMade: lastStats.shotsMade + 1,
                    shotsAttempted: lastStats.shotsAttempted + 1,
                    steals: lastStats.steals,
                    blocks: lastStats.blocks,
                    OReb: lastStats.OReb,
                    time: event.t
                };
                teamStats[event.player1_team].push(stats);
            }
            if (event.etype === 5 && (event.emsg === "1" || event.emsg === "2") && event.player2_team) {
                let lastStats = getLastStats(event.player2_team);
                let stats = {
                    shotsMade: lastStats.shotsMade,
                    shotsAttempted: lastStats.shotsAttempted,
                    steals: lastStats.steals + 1,
                    blocks: lastStats.blocks,
                    OReb: lastStats.OReb,
                    time: event.t
                };
                teamStats[event.player2_team].push(stats);
            }
            if (event.etype === 2 && event.player3_team) {
                let lastStats = getLastStats(event.player3_team);
                let stats = {
                    shotsMade: lastStats.shotsMade,
                    shotsAttempted: lastStats.shotsAttempted + 1,
                    steals: lastStats.steals,
                    blocks: lastStats.blocks + 1,
                    OReb: lastStats.OReb,
                    time: event.t
                };
                teamStats[event.player3_team].push(stats);
            }

            if (i > 0 && event.etype === 4 && event.player1_team && events[i - 1].etype === 2 && events[i - 1].player1_team === event.player1_team) {
                let lastStats = getLastStats(event.player1_team);
                let stats = {
                    shotsMade: lastStats.shotsMade,
                    shotsAttempted: lastStats.shotsAttempted,
                    steals: lastStats.steals,
                    blocks: lastStats.blocks + 1,
                    OReb: lastStats.OReb + 1,
                    time: event.t
                };
                teamStats[event.player1_team].push(stats);
            }
        });

        let eventsInInterval = [];
        const homeTeamMambaE = [];
        const awayTeamMambaE = [];

        // Loop over teamStats
        for (let team in teamStats) {
            eventsInInterval = [];

            for (let statsIndex = 0; statsIndex < teamStats[team].length; statsIndex++) {
                const stats = teamStats[team][statsIndex];

                // Remove events from eventsInInterval until they match the window
                // Check to make sure eventsInInterval is not empty
                while (eventsInInterval.length > 0 && stats.time - eventsInInterval[0].time > maxInterval) {
                    eventsInInterval.shift();
                }

                eventsInInterval.push(stats);

                // Calculate differences in stats
                const shotsMade = stats.shotsMade - eventsInInterval[0].shotsMade;
                const shotsAttempted = stats.shotsAttempted - eventsInInterval[0].shotsAttempted;
                const steals = stats.steals - eventsInInterval[0].steals;
                const blocks = stats.blocks - eventsInInterval[0].blocks;
                const OReb = stats.OReb - eventsInInterval[0].OReb;

                // Calculate MAMBAe
                const MAMBAe = (shotsMade + 0.5 * steals + 0.5 * blocks + 0.5 * OReb) / (shotsAttempted + 1); // Avoid divide by 0

                // Check if NaN
                if (shotsAttempted + 1 == 0) {

                }

                if (team.toLowerCase() === homeTeam) {
                    homeTeamMambaE.push([MAMBAe, stats.time]);
                } else {
                    awayTeamMambaE.push([MAMBAe, stats.time]);
                }
            }
        }

        return [homeTeamMambaE, awayTeamMambaE];
    }

    let new_gameData = JSON.parse(JSON.stringify(gameData));
    const mambaS = calculateMAMBAsForTeam(new_gameData, Madj);


    const temp = calculateMAMBAeForTeam(new_gameData);

    const homeTeamMambaE = temp[0];
    const awayTeamMambaE = temp[1];

    let runningHomeMambaE = 0, runningAwayMambaE = 0;

    new_gameData.forEach((event, i) => {
        const time = event.t;

        // Sum both mambaS and mambaE if time matches
        // Reminder: both mambaS and mambaE are cumulative right now

        // Case 1: Beginning of game with no scoring
        if (i === 0) {
            event.MAMBAs = 0;
        }
        // Case 2: mambaS needs to be updated
        else if (mambaS.length > 0 && time === mambaS[0][1]) {
            event.MAMBAs = mambaS[0][0];
            mambaS.shift();
        }
        // Case 3: Not yet time to update
        else {
            event.MAMBAs = new_gameData[i - 1].MAMBAs;
        }

        // Case 1: Beginning of game with no events
        if (i === 0) {
            event.MAMBAe = 0;
        }
        // Case 2: mambaE needs to be updated for home
        else if (homeTeamMambaE.length > 0 && time === homeTeamMambaE[0][1]) {
            runningHomeMambaE = homeTeamMambaE[0][0];
            event.MAMBAe = runningHomeMambaE - runningAwayMambaE;
            homeTeamMambaE.shift();
        }
        // Case 3: mambaE needs to be updated for away
        else if (awayTeamMambaE.length > 0 && time === awayTeamMambaE[0][1]) {
            runningAwayMambaE = awayTeamMambaE[0][0];
            event.MAMBAe = runningHomeMambaE - runningAwayMambaE;
            awayTeamMambaE.shift();
        }
        // Case 4: Not yet time to update
        else {
            event.MAMBAe = new_gameData[i - 1].MAMBAe;
        }

        // Calculate total MAMBA
        event.totalMAMBA = event.MAMBAs + event.MAMBAe;
    });

    return new_gameData;
}

async function getPace(year) {
    //Make API call to /api/pace/:year
    const res = await fetch(`/api/pace/${year}`);
    return res.json();
}

async function getMomentum(gameData, year, method, homeTeam, awayTeam) {
    //const paceData = await getPace(year);
    paceData = 1.0

    homeTeam = homeTeam.toLowerCase();
    console.log(awayTeam)
    awayTeam = awayTeam.toLowerCase();

    // Grizzlies move from Vancouver to Memphis
    if (year <= 2001) {
        if (homeTeam === "grizzlies") homeTeam = "vancouver";
        if (awayTeam === "grizzlies") awayTeam = "vancouver";
    }

    // Nets move from New Jersey to Brooklyn
    if (year < 2012) {
        if (homeTeam === "nets") homeTeam = "jerseys";
        if (awayTeam === "nets") awayTeam = "jerseys";
    }

    // Bobcats change name to Hornets
    if (year < 2014) {
        if (homeTeam === "hornets") homeTeam = "bobcats";
        if (awayTeam === "hornets") awayTeam = "bobcats";
    }

    console.log(paceData);

    switch (method) {
        case "ScoreNormalizedMomentum":
            return ScoreNormalizedMomentum(gameData);
        case "PAPM":
            return PAPM(gameData, paceData, homeTeam, awayTeam);
        case "MAMBA":
            return MAMBA(gameData, paceData, homeTeam, awayTeam);
        default:
            return ScoreNormalizedMomentum(gameData);
    }
}


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
                    score_diff: row.SCOREMARGIN === "TIE" ? "0" : row.SCOREMARGIN,
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
            const seasonGameData = await readCsvFile(csvPath);
            allGamesData.push(...seasonGameData);
        }
        // console.log(allGamesData)
        return allGamesData
    } catch (error) {
        console.error('Failed to fetch or format NBA data:', error);
        return [];
    }
}


async function analyzeMomentum(gameData, year, method, end_period,  homeTeam, awayTeam) {
    // Validate method input and default to ScoreNormalizedMomentum if none specified
    const validMethods = ["PAPM", "MAMBA", "ScoreNormalizedMomentum"];
    if (!validMethods.includes(method)) {
        console.error("Invalid method specified. Defaulting to 'ScoreNormalizedMomentum'");
        method = "ScoreNormalizedMomentum";
    }

    // let momentum1 = await getMomentum(game_data, year, "ScoreNormalizedMomentum", home_team, away_team)
    // momentum1.pop()

    let momentum = await getMomentum(gameData, year, method, homeTeam, awayTeam);
    momentum.pop();  // Correct the pop method invocation with parentheses

    let homeMomentum = 0;
    let awayMomentum = 0;
    let lastEventPeriod3 = null;

    // Iterate through the momentum data to find the last event of period 3
    for (let event of momentum) {
        if (event.period === end_period) {
            homeMomentum = event.homeTeamMomentum;
            awayMomentum = event.awayTeamMomentum;
            lastEventPeriod3 = event;  // Keep updating to get the last event in period 3
        }
    }
    const lastEvent = momentum[momentum.length - 1];
    const homeTeamScore = parseInt(lastEvent.score.split('-')[1], 10);
    const awayTeamScore = parseInt(lastEvent.score.split('-')[0], 10);

    // Determine the winning team
    let winningTeam = "";
    if (homeTeamScore > awayTeamScore) {
        winningTeam = "home";
    } else if (awayTeamScore > homeTeamScore) {
        winningTeam = "away";
    }

    // Log final scores and momentum
    console.log(`Final event score - Home: ${homeTeamScore}, Away: ${awayTeamScore}`);
    if (winningTeam === "home") {
        console.log("Home team won.");
    } else if (winningTeam === "away") {
        console.log("Away team won.");
    } else {
        console.log("The last event ended in a tie based on the scores.");
    }

    if (lastEventPeriod3) {
        console.log(`Momentum just before period  ${end_period} - Home: ${homeMomentum}, Away: ${awayMomentum}`);
        if (homeMomentum > awayMomentum && winningTeam === "home" || awayMomentum > homeMomentum && winningTeam === "away") {
            console.log(`The team with higher momentum at the end of Period ${end_period} won the game.`);
            return 1;  // Return 1 if the team with higher momentum won
        } else {
            console.log(`The team with higher momentum at the end of Period ${end_period} did not win the game.`);
        }
    } else {
        console.log("No events recorded for Period 3.");
    }
    return 0;  // Return 0 if the conditions are not met
}

async function logSeasonData() {

    function getElapsed(per, clock) {
        let RegPeriod = 60 * 12
        let OTPeriod = 60 * 5

        let time = (per < 5) ? (per - 1) * RegPeriod : (RegPeriod * 4) + ((per - 5) * OTPeriod);

        if (clock) {
            let [min, sec] = clock.split(":")
            sec = (+sec) + ((+min) * 60);
            time += (per < 5) ? (RegPeriod - sec) : (OTPeriod - sec);
        }
        return time
    }

    try {
        const year = 2000
        const seasonData = await getFormattedNBAData([2000], 'nbastats', 'rg');

        
        let sum = 0
        
        for (let i = 1; i < seasonData.length; i++) {
            home_team = seasonData[i]["teams"][0]
            away_team = seasonData[i]["teams"][1]
        
            const gameData = seasonData[i]["events"]

            

            if (gameData.length > 0) {
                gameData[0].score_diff = "0";
                gameData[0].score = "0 - 0";
            }
            
            for (let i = 1; i < gameData.length; i++) {
                if (gameData[i].score_diff === "") {
                    gameData[i].score_diff = gameData[i - 1].score_diff;
                }
            
                if (gameData[i].score === "") {
                    gameData[i].score = gameData[i - 1].score;
                }
            
                // Convert score_diff to number
                gameData[i].score_diff = +gameData[i].score_diff;

                gameData[i].t = getElapsed(gameData[i].period, gameData[i].time_left);
            }

            gameData.forEach( event => {
                event.t = getElapsed(event.period, event.time_left);
            });


            sum +=  await analyzeMomentum(gameData, year, "ScoreNormalizedMomentum", 3, home_team, away_team)
            console.log(sum)
            // const SNM_result1 = analyzeMomentum(gameData, year, "ScoreNormalizedMomentum", 1, home_team, away_team)
        }

        let percentage = sum / seasonData.length
        console.log(percentage)
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

logSeasonData();
        // extract teams
