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
    "hornets": "Charlotte Hornets",
    "bulls": "Chicago Bulls",
    "cavaliers": "Cleveland Cavaliers",
    "pistons": "Detroit Pistons",
    "pacers": "Indiana Pacers",
    "heat": "Miami Heat",
    "bucks": "Milwaukee Bucks",
    "knicks": "New York Knicks",
    "magic": "Orlando Magic",
    "sixers": "Philadelphia 76ers",
    "raptors": "Toronto Raptors",
    "wizards": "Washington Wizards"
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
    };

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
    });
    // console.log(new_gameData)
    return new_gameData
}


function PAPM(gameData, Madj, windowSize = 180) {
    let new_gameData = JSON.parse(JSON.stringify(gameData));

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

function MAMBA(gameData, MAdj, multiplier = 1.1) {

    // Helper function to calculate MAMBA for each team
    function calculateMAMBAsForTeam(teamQueue, team) {
        let momentum = 0;
        let mult = 1; // Start with a multiplier of 1
        let windowStartIndex = 0; // Start of the 3-minute window
        let lastScoringTeam = null; // Track the last team that scored

        for (let i = 0; i < teamQueue.length; i++) {
            let currentEvent = teamQueue[i];

            // Check if the last scoring event was by the opposing team to reset the multiplier
            if (lastScoringTeam && lastScoringTeam !== team) {
                mult = 1;
            }

            // Calculate momentum for events within the window
            if (currentEvent.dt % 3 === 0) {
                momentum += currentEvent.points * mult;
                mult *= multiplier; // Increase multiplier
            }

            // Update last scoring team
            lastScoringTeam = team;
        }

        return momentum;
    }

    function calculateMAMBAeForTeam(events) {
        let teamStats = {};

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

        const maxInterval = 180;
        const eventsInInterval = [];
        const homeTeamMambaE = [];

        for (team in teamStats) {
            for (stats in teamStats[team]) {
                // leave for complete
            }
        }

        let MAMBAe = (shotsMade + 0.5 * (steals + blocks + OReb)) / shotsAttempted;
        return MAMBAe;
    }


    const maxInterval = 180;
    const eventsInInterval = [];
    const homeTeamMambaE = [];


    let homeTeamQueue = [];
    let awayTeamQueue = [];
    let lastScoringTeam = null;

    let new_gameData = JSON.parse(JSON.stringify(gameData));

    new_gameData.forEach(event => {
        if (!event.score) return;
        let time_elapsed = convertToSeconds(event.time_left) // in minuts
        console.log(time_elapsed)

        // Parse the current scores from the event
        const homeTeamScore = parseInt(event.score.split('-')[1], 10);
        const awayTeamScore = parseInt(event.score.split('-')[0], 10);

        // Determine points scored in this event
        let homePoints = homeTeamQueue.length > 0 ? homeTeamScore - homeTeamQueue[homeTeamQueue.length - 1].score : homeTeamScore;
        let awayPoints = awayTeamQueue.length > 0 ? awayTeamScore - awayTeamQueue[awayTeamQueue.length - 1].score : awayTeamScore;

        // Check if this is a scoring event for the home or away team
        if ((event.etype === 1 || event.etype === 3) && homePoints > 0) {
            homeTeamQueue.push({score: homeTeamScore, points: homePoints, team: 'home', dt: time_elapsed});
            lastScoringTeam = 'home';
        } else if ((event.etype === 1 || event.etype === 3) && awayPoints > 0) {
            awayTeamQueue.push({score: awayTeamScore, points: awayPoints, team: 'away', dt: time_elapsed});
            lastScoringTeam = 'away';
        }

        // Calculate the MAMBA momentum after each event
        // event.homeTeamMomentum = calculateMAMBAForTeam(homeTeamQueue);
        //event.awayTeamMomentum = calculateMAMBAForTeam(awayTeamQueue);
        event.MAMBAs = (calculateMAMBAsForTeam(homeTeamQueue, 'home', multiplier) - calculateMAMBAsForTeam(awayTeamQueue, 'away', multiplier))
        // event.home_MAMBAe = calculateMAMBAeForTeam(homeTeamQueue) //may have to part event description to be able to calcuate stuff like this or find out
        // event.away_MAMBAe = calculateMAMBAeForTeam(awayTeamQueue)
        // how to parse EVENTMSGACTIONTYPE
        event.totalMAMBA = event.MAMBAs
    });

    // console.log(new_gameData)
    return new_gameData;
}

async function getPace(year) {
    //Make API call to /api/pace/:year
    const res = await fetch(`/api/pace/${year}`);
    return await res.json();
}

function getMomentum(gameData, year, method) {
    // TOOD get pace data
    let Madj = getPace(year);
    console.log(Madj);

    switch (method) {
        case "ScoreNormalizedMomentum":
            return ScoreNormalizedMomentum(gameData);
        case "PAPM":
            return PAPM(gameData, Madj);
        case "MAMBA":
            return MAMBA(gameData, Madj);
        default:
            return ScoreNormalizedMomentum(gameData);
    }
}

export {getMomentum};
