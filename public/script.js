import {ScoreNormalizedMomentum, MAMBA} from "./calculations.js";

document.addEventListener('DOMContentLoaded', function () {
    const selectYear = document.getElementById('yearSelect');
    for (let year = 2000; year <= 2023; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        selectYear.appendChild(option);
    }

    selectYear.addEventListener('change', async function () {
        const selectedYear = this.value;
        if (selectedYear) {
            try {
                console.log("getting info");

                const gameSelectLoadMessage = document.getElementById('gameSelectLoadMessage');
                gameSelectLoadMessage.style.display = 'block'; // Show loading message

                // Hide the game select dropdown
                document.getElementById('gameSelectContainer').style.display = 'none';

                // Clear graph
                document.getElementById('plotArea').innerHTML = '';

                document.getElementById('plotSkeleton').style.display = 'block'; // Show skeleton Loader

                const response = await fetch(`/fetch-nba-data/${selectedYear}`);
                const gamesData = await response.json();
                displayGames(gamesData, selectedYear); // Call to function that handles display
            } catch (error) {
                console.error('Failed to fetch games data:', error);
            }
        }
    });
});

// Function to display games data
function displayGames(gamesData, year) {
    const gameSelectContainer = document.getElementById('gameSelectContainer');
    gameSelectContainer.style.display = 'block'; // Show the game select dropdown

    const gameSelect = document.getElementById('gameSelect');
    gameSelect.innerHTML = '<option value="">--Please choose a game--</option>'; // Reset dropdown

    gamesData.forEach(game => {
        const option = document.createElement('option');
        option.value = game[0]; // Assuming game[0] is the gameID
        option.textContent = `${game[0]}: ${game[1]} vs ${game[2]}`; // Format: gameID: TEAM_1 vs TEAM_2
        gameSelect.appendChild(option);
    });

    const gameSelectLoadMessage = document.getElementById('gameSelectLoadMessage');
    gameSelectLoadMessage.style.display = 'none'; // Hide loading message

    gameSelect.onchange = function () {
        document.getElementById('plotSkeleton').style.display = 'block'; // Show the skeleton loader

        const selectedGameID = this.value;
        if (selectedGameID) {
            // Prepare the plot area for the new plot
            const plotArea = document.getElementById('plotArea');
            plotArea.innerHTML = ''; // Clear previous plot
            plotGameData(selectedGameID, year); // Use selected gameID and year
        }
    };
}

function plotGameData(gid, year) {
    console.log(gid)
    console.log(year)
    // Ensure your path to the CSV is correct and accessible

    d3.csv(`data/nbastats_${year}/nbastats_${year}.csv`).then(data => {
        const margin = ({top: 30, right: 30, bottom: 30, left: 40})
        const height = 750
        const width = 1500

        const svg = d3.select("#plotArea").append("svg")
            .attr("id", "nba-plot")
            .attr("width", width)
            .attr("height", height);
        const game = data.filter(d => d["GAME_ID"] === gid);
        var periods = [
            {t: 0, label: "Q1"},
            {t: 720, label: "Q2"},
            {t: 1440, label: "Q3"},
            {t: 2160, label: "Q4"},
            {t: 2880, label: "OT1"},
            {t: 3180, label: "OT2"},
            {t: 3480, label: "OT3"},
            {t: 3780, label: "OT4"},
            {t: 4080, label: "OT5"},
            {t: 4380, label: "OT6"},
            {t: 4680, label: "OT7"},
            {t: 4980, label: "OT8"},
            {t: 5280, label: "OT9"},
            {t: 5580, label: "OT10"},
        ];

        var eventypes = [
            {type: 1, label: "Made Shot"},
            {type: 2, label: "Missed Shot"},
            {type: 3, label: "Free Throw"}, // the score will tell if it was made or not
            {type: 4, label: "Rebound"},
            {type: 5, label: "Turnover"},
            {type: 6, label: "Foul"},
            //{type: 7, label: "Violation"},
            {type: 8, label: "Substitution"},
            {type: 9, label: "Timeout"},
            //{type: 10, label: "Jumpball"},
            {type: 11, label: "Ejection"},
            //{type: 12, label: "Period Begin"},
            //{type: 13, label: "Period End"},
            //{type: 14, lable: "Hello"}
        ]

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

        function getPeriodLabel(p) {
            return (p < 5) ? `Q${p}` : `OT${p - 4}`
        }


        var game_data = game.map(function (d) {
            return {
                eventnum: +d.EVENTNUM,
                score: d.SCORE,
                score_diff: d.SCOREMARGIN,
                time_left: d.PCTIMESTRING,
                period: +d.PERIOD,
                etype: +d.EVENTMSGTYPE
            }
        });

        MAMBA(game_data);

        var teams = Array.from(new Set(game
            .filter(function (d) {
                return d.PLAYER1_TEAM_NICKNAME !== "";
            })
            .map(function (d) {
                return d.PLAYER1_TEAM_NICKNAME
            })))


        // sanity check to order all events
        game_data.sort(function (a, b) {
            return a.eventnum - b.eventnum
        });

        // format score difference correctly
        game_data.forEach(function (d) {
            d.score_diff = d.score_diff === "TIE" ? "0" : d.score_diff;
        });


        if (game_data.length > 0) {
            game_data[0].score_diff = "0"
            game_data[0].score = "0 - 0"
        }

        for (let i = 1; i < game_data.length; i++) {
            if (game_data[i].score_diff === "") {
                game_data[i].score_diff = game_data[i - 1].score_diff
            }

            if (game_data[i].score === "") {
                game_data[i].score = game_data[i - 1].score
            }
        }

        

        game_data.forEach(function (d) {
            d.score_diff = +d.score_diff
        })


        // extract teams
        var firstScore = game_data.findIndex(function (d) {
            return d.score_diff !== 0
        })

        var temp = game[firstScore]

        if (temp.SCOREMARGIN < 0) {
            var away_team = temp.PLAYER1_TEAM_NICKNAME
            if (teams[0] === away_team) {
                var home_team = teams[1];
            } else {
                var home_team = teams[0];
            }
        } else {
            var home_team = temp.PLAYER1_TEAM_NICKNAME
            if (teams[0] === home_team) {
                var away_team = teams[1];
            } else {
                var away_team = teams[0];
            }
        }

        // plot setup
        const maxScoreDiff = d3.max(game_data, d => Math.abs(d.score_diff));

        game_data.forEach(function (d) {
            d.t = getElapsed(d.period, d.time_left)
        })

        let lastPlay = game_data[game_data.length - 1]
        game_data.push({
            period: lastPlay.period,
            t: getElapsed(lastPlay.period, lastPlay.time_left),
            score_diff: 0
        })

        console.log(game_data)

        // get the momentum1:
        // Compared with game_data, momentum1 adds homeTeamMomentum and awayTeamMomentum attributes to each event.
        var momentum1 = ScoreNormalizedMomentum(game_data)
        console.log("momentum1", momentum1)

        const x = d3.scaleLinear()
            .domain([0, 2880])
            .range([margin.left, width - margin.right])

        const y = d3.scaleLinear()
            //.domain([-20, 20])
            .domain( [-maxScoreDiff*1.15, maxScoreDiff*1.15 ])
            .range([height - margin.bottom, margin.top])

        const line = d3.line()
            .curve(d3.curveStepAfter)
            .x(d => x(d.t))
            .y(d => y(d.score_diff))


        // plot
        svg.append("g")
            .append("path")
            .data([game_data])
            .attr("d", line)
            .attr("class", "lead-tracker")

        // x-Axis
        const xAxis = g => {
            g.append("g")
                .attr("transform", "translate(0," + (height - margin.bottom) + ")")
                .call(d3.axisBottom(x).tickSizeOuter(0).tickSize(-height + margin.top + margin.bottom).tickValues(periods.map(d => d.t)))
                .call(g => g.select(".domain").remove());

            g.selectAll("text")
                .data(periods)
                .text(d => d.label)
                .attr("text-anchor", "start");

            g.selectAll(".tick:last-of-type text")
                .attr("text-anchor", "end")
                .text("FINAL")
        }

        svg.append("g")
            .attr("class", "x-axis")
            .call(xAxis)


        // y-Axis
        const yAxis = g => {
            g.append("g")
                .attr("transform", "translate(" + margin.left + ",0)")
                .call(d3.axisLeft(y).tickSizeOuter(0).tickSize(-width + margin.left + margin.right).tickFormat(d => Math.abs(d)))
                .call(g => g.select(".domain").remove());

            g.select(".tick:last-of-type")
                .append("text")
                .attr("x", 5)
                .attr("dy", 12)
                .attr("fill", "black")
                .attr("text-anchor", "start")
                .text(home_team)

            g.select(".tick:first-of-type")
                .append("text")
                .attr("x", 5)
                .attr("dy", -5)
                .attr("fill", "black")
                .attr("text-anchor", "start")
                .text(away_team)
        }

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)


        // tooltip
        var tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .text("")
            .attr("opacity", 0)

        function mouseOut(d) {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0)
        }

        function mouseOver(d) {
            const circ = d3.select(this)
            const [x_, y_] = [parseFloat(circ.attr("cx")), parseFloat(circ.attr("cy"))];
            console.log(x_, y_)

            tooltip.transition()
                .duration(200)
                .style("opacity", .9)
            tooltip.html(d.etype)
                .style("left", (x_ + 15) + "px")
                .style("top", (y_ + 12) + "px")
                .style("display", "block");
        }

        // checkbox and events
        

        var selectedEventTypes = []

        var types = eventypes.map(function (d) {
            return d.type
        });
        types = types.filter(function (d, i, self) {
            return self.indexOf(d) === i;
        })

        var accent = d3.scaleOrdinal()
            .domain(types)
            .range(d3.schemeCategory10)

        const toggles = d3.select("#checkbox")
            .selectAll("label")
            .data(eventypes)
            .enter()
            .append("label")
            .classed("checkbox-label", true)
            .text(d => d.label)
            .append("input")
            .attr("type", "checkbox")
            .property("checked", false)
            .property("value", d => d.type)
            .on("change", checkboxChange);


        function checkboxChange() {
            selectedEventTypes = eventypes.filter(function (d, i) {
                return toggles.nodes()[i].checked;
            }).map(function (d) {
                return d.type
            })

            const event_data = game_data.filter(d => selectedEventTypes.includes(d.etype))

            let circles = svg.selectAll("circle").data(event_data);

            // Exit pattern: remove circles that no longer match the filtered data
            circles.exit().remove();

            circles.attr("cx", d => x(d.t))
           .attr("cy", d => y(d.score_diff))
           .attr("r", 5)
           .attr("fill", d => accent(d.etype))
           .on("mouseover", mouseOver)
           .on("mouseout", mouseOut);

           
            circles.enter()
                .append("circle")
                .attr("cx", d => x(d.t))
                .attr("cy", d => y(d.score_diff))
                .attr("r", 5)
                .attr("fill", d => accent(d.etype))
                .on("mouseover", mouseOver)
                .on("mouseout", mouseOut);
        }
        document.getElementById('plotSkeleton').style.display = 'none'; // Hide the skeleton loader
    });
}
