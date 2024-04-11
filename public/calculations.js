/**
 * File: calculations.js
 * Description: Various calculation methods for calculating momentum.
 */

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
        const homeTeamScore = parseInt(event.score.split('-')[0]);
        const awayTeamScore = parseInt(event.score.split('-')[1]);

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

    return new_gameData
}

function MAMBA(gameData) {
    //TODO
}

export { ScoreNormalizedMomentum, MAMBA };
