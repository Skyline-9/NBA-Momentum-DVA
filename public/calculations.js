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

function ScoreNormalizedMomentum(gameData, interval=10, scaling=60) {
    // if use points/timeDiff, the value is higher, the momentum is higher
    function calMomentum(teamQueue){
        let sumNormalizedTime = 0;
        // calculate for 5 events
        if (teamQueue.length < interval){
            return 0;
        }
        // loop the queue
        for (let i = 1; i < teamQueue.length; i++) {
            const scoreChange = teamQueue[i].score - teamQueue[i-1].score;
            const timeDiff = teamQueue[i].time_s - teamQueue[i-1].time_s;
            // make sure that the time changed
            if (timeDiff !== 0) {

                sumNormalizedTime += scaling * scoreChange / timeDiff;
            }
            else{
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
        if (event.period != cur_period){
            cur_period = event.period;
            homeTeamQueue = [{ time_s: event.t, score: homeTeamScore }];
            awayTeamQueue = [{ time_s: event.t, score: awayTeamScore }];
            homeTeamMomentum = 0;
            awayTeamMomentum = 0;
        }else{

            homeTeamQueue.push({time_s: event.t, score: homeTeamScore});
            awayTeamQueue.push({time_s: event.t, score: awayTeamScore});

            // if the length >5, remove the oldest one
            if (homeTeamQueue.length > interval) {
                homeTeamQueue.shift();
            };
            homeTeamMomentum = calMomentum(homeTeamQueue);

            // if the length >5, remove the oldest one
            if (awayTeamQueue.length > interval) {
                awayTeamQueue.shift();
            };
            awayTeamMomentum = calMomentum(awayTeamQueue);
        };

        // add 2 momentum to the object
        event.homeTeamMomentum = homeTeamMomentum;
        event.awayTeamMomentum = awayTeamMomentum
    });
    // console.log(new_gameData)
    return new_gameData
}

function PAPM(gameData, homeTeam, awayTeam) {
    const relevantPaceData = {};
    getPace(gameData).then(pace => {
        relevantPaceData["league"] = pace["League Average"];
        relevantPaceData["homeTeam"] = pace[TEAM_TO_FULL_NAME[homeTeam]];
        relevantPaceData["awayTeam"] = pace[TEAM_TO_FULL_NAME[awayTeam]];
    }).catch(err => {
        console.error(err);
    });
    console.log(relevantPaceData);

    let currentPeriod = 0;
    let windowEvents = [];
    let homePaceAdjusted = relevantPaceData["homeTeam"] / relevantPaceData["league"];
    let awayPaceAdjusted = relevantPaceData["awayTeam"] / relevantPaceData["league"];

    // Iterate over the gameData to calculate PAPM for each event
    for (let event of gameData) {
        const [homeScore, awayScore] = event.score.split('-').map(Number);

        if (event.period !== currentPeriod) {
            // When the period changes, reset windowEvents
            currentPeriod = event.period;
            windowEvents = [];
        }

        // Add current event to the window
        windowEvents.push({ time: event.t, homeScore, awayScore });

        // Remove events outside the window (3-minute window)
        while (windowEvents.length > 0 && event.t - windowEvents[0].time > 180) {
            windowEvents.shift();
        }

        const windowStart = windowEvents[0];
        const windowEnd = windowEvents[windowEvents.length - 1];
        const pointsScored = windowEnd.homeScore - windowStart.homeScore;
        const pointsGivenUp = windowEnd.awayScore - windowStart.awayScore;

        // Calculate PAPM for home and away teams
        event.homePAPM = (1 / homePaceAdjusted) * (pointsScored - pointsGivenUp);
        event.awayPAPM = (1 / awayPaceAdjusted) * (pointsGivenUp - pointsScored);
    }

    return gameData;
}

function MAMBA(gameData, MAdj, multiplier = 1.1) {


    // Helper function to calculate MAMBA for each team
    function calculateMAMBAsForTeam(events) {
        let momentum = 0;
        let mult = 1.1;
        events.forEach(event => {
            momentum += event.points * mult;
            mult *= 1.1; // Accumulating multiplier
        });
        return momentum; 
    }

    function calculateMAMBAeForTeam(events) {
        let momentum = 0;
        let mult = 1.1;
        events.forEach(event => {
            momentum += event.points * mult;
            mult *= 1.1; // Accumulating multiplier
        });
        return momentum; 
    }

    let homeTeamQueue = [];
    let awayTeamQueue = [];
    let lastScoringTeam = null;

    console.log("calculating MAMBA")
    
    let new_gameData = JSON.parse(JSON.stringify(gameData));

    new_gameData.forEach(event => {
        if (!event.score) return;

        // Parse the current scores from the event
        const homeTeamScore = parseInt(event.score.split('-')[1], 10);
        const awayTeamScore = parseInt(event.score.split('-')[0], 10);

        // Determine points scored in this event
        let homePoints = homeTeamQueue.length > 0 ? homeTeamScore - homeTeamQueue[homeTeamQueue.length - 1].score : homeTeamScore;
        let awayPoints = awayTeamQueue.length > 0 ? awayTeamScore - awayTeamQueue[awayTeamQueue.length - 1].score : awayTeamScore;

        // Check if this is a scoring event for the home or away team
        if ((event.etype === 1 || event.etype === 3) && homePoints > 0) {
            homeTeamQueue.push({ score: homeTeamScore, points: homePoints, team: 'home' });
            lastScoringTeam = 'home';
        } else if ((event.etype === 1 || event.etype === 3) && awayPoints > 0) {
            awayTeamQueue.push({ score: awayTeamScore, points: awayPoints, team: 'away' });
            lastScoringTeam = 'away';
        }

        // If there is a change in possession, clear the queue of the team that just lost the ball
        if ((event.etype === 4 || event.etype === 5 || event.etype === 10) && lastScoringTeam) {
            if (lastScoringTeam === 'home' && event.team === 'away') {
                awayTeamQueue = []; // Reset away team queue since they now have possession
            } else if (lastScoringTeam === 'away' && event.team === 'home') {
                homeTeamQueue = []; // Reset home team queue since they now have possession
            }
        }

        // Calculate the MAMBA momentum after each event
        // event.homeTeamMomentum = calculateMAMBAForTeam(homeTeamQueue);
        //event.awayTeamMomentum = calculateMAMBAForTeam(awayTeamQueue);
        event.MAMBAs = calculateMAMBAsForTeam(homeTeamQueue) - calculateMAMBAsForTeam(awayTeamQueue)
        event.MAMBAe = 0 //may have to part event description to be able to calcuate stuff like this or find out 
        // how to parse EVENTMSGACTIONTYPE
        event.totalMAMBA = event.MAMBAs + event.MAMBAe
    });

    console.log(new_gameData)
    return new_gameData;
}

async function getPace(year) {
    //Make API call to /api/pace/:year
    const res = await fetch(`/api/pace/${year}`);
    return await res.json();
}

function getMomentum(gameData, year, method) {

    // TOOD get pace data
    //let Madj = getPace(year)

    switch (method) {
        case "ScoreNormalizedMomentum":
            return ScoreNormalizedMomentum(gameData);
        case "PAPM":
            return PAPM(gameData);
        case "MAMBA":
            return MAMBA(gameData, 1.0);
        default:
            return ScoreNormalizedMomentum(gameData);
    }
}

export { getMomentum };