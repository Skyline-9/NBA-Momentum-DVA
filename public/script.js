import { getMomentum } from "./calculations.js";

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
                document.getElementById("graph-card").style.display = "none";

                // Hide the game select dropdown
                document.getElementById('gameSelectContainer').style.display = 'none';

                // Clear graph
                document.getElementById('plotArea').innerHTML = '';

                document.getElementById('plotSkeleton').style.display = 'block'; // Show skeleton Loader

                const response = await fetch(`/api/nba_season/${selectedYear}`);
                const gamesData = await response.json();
                displayGames(gamesData, selectedYear); // Call to function that handles display
            } catch (error) {
                console.error('Failed to fetch games data:', error);
            }
        }
    });
    initCheckboxes();
});


var eventypes = [{ type: 1, label: "Made Shot" }, { type: 2, label: "Missed Shot" }, { type: 3, label: "Free Throw" }, // the score will tell if it was made or not
{ type: 4, label: "Rebound" }, { type: 5, label: "Turnover" }, {
    type: 6,
    label: "Foul"
}, //{type: 7, label: "Violation"},
{ type: 8, label: "Substitution" }, { type: 9, label: "Timeout" }, //{type: 10, label: "Jumpball"},
{ type: 11, label: "Ejection" }, //{type: 12, label: "Period Begin"},
    //{type: 13, label: "Period End"},
    //{type: 14, lable: "Hello"}
]
let svg

function checkboxChange(checkbox, game_data, mouseOver, mouseOut, x, y, accent) {
    let selectedEventTypes = eventypes.filter(function (d, i) {
        return document.querySelectorAll("#checkbox input[type='checkbox']")[i].checked;
    }).map(function (d) {
        return d.type;
    });

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

function initCheckboxes() {
    const checkboxes = document.querySelectorAll("#checkbox input[type='checkbox']");
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', checkboxChange);
    });
}

function resetCheckboxes() {
    // Reset the checkboxes state here if needed
    const checkboxes = document.querySelectorAll("#checkbox input[type='checkbox']");
    checkboxes.forEach(checkbox => {
        checkbox.checked = false; // Uncheck all checkboxes
    });
}

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

        console.log("changing game")
        document.getElementById('plotSkeleton').style.display = 'block'; // Show the skeleton loader
        document.getElementById("graph-card").style.display = "none";

        const selectedGameID = this.value;
        if (selectedGameID) {
            // Prepare the plot area for the new plot
            const plotArea = document.getElementById('plotArea');
            plotArea.innerHTML = ''; // Clear previous plot
            resetCheckboxes(); // Clear the checkboxes state
            plotGameData(this.value, year); // Use selected gameID and year
            initMomentumSelector();
            //plotGameData(selectedGameID, year); // Use selected gameID and year
        }
        //initCheckboxes();
        // game_data = []; // Assuming game_data is defined in the wider scope

    };
}

function initMomentumSelector() {
    const momentumContainer = document.getElementById('momentumSelectContainer');
    momentumContainer.style.display = 'block'; // Show momentum select container

    const momentumSelect = document.getElementById('momentumSelect');
    momentumSelect.innerHTML = ''; // Clear previous options

    const momentumTypes = [
        { value: '', text: '--Select Momentum Type--' }, // default no selection
        { value: 'ScoreNormalizedMomentum', text: 'Score Normalized Momentum' },
        { value: 'PAPM', text: 'PAPM' },
        { value: 'MAMBA', text: 'MAMBA' },
        { value: 'all momentum', text: 'ALL Momentum'},
    ];

    momentumTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.text;
        momentumSelect.appendChild(option);
    });

    momentumSelect.onchange = function () {
        updateMomentumVisualization(this.value);
    };
}

function updateMomentumVisualization(selectedMomentumType) {
    const momentumSelectors = {
        'ScoreNormalizedMomentum': ['#homeMomentum', '#awayMomentum'],
        'MAMBA': ['#MAMBA'],
        'PAPM': ['#PAPM']
    };

    // Hide all momentum visualizations first
    Object.keys(momentumSelectors).forEach(type => {
        momentumSelectors[type].forEach(selector => {
            d3.select(selector).style('display', 'none');
        });
    });

    if (selectedMomentumType === 'all momentum') {
        // Show all momentum visualizations
        Object.keys(momentumSelectors).forEach(type => {
            momentumSelectors[type].forEach(selector => {
                d3.select(selector).style('display', 'block');
            });
        });
    } else if (selectedMomentumType !== '') {
        // Show only the selected momentum visualization
        momentumSelectors[selectedMomentumType].forEach(selector => {
            d3.select(selector).style('display', 'block');
        });
    }
    // If selectedMomentumType === '', do nothing (all are hidden)
}

function plotGameData(gid, year) {
    console.log(gid)
    console.log(year)
    // Ensure your path to the CSV is correct and accessible

    d3.csv(`data/nbastats_${year}/nbastats_${year}.csv`).then(async data => {
        const margin = ({top: 50, right: 30, bottom: 30, left: 150})
        const height = 750;
        const width = 1250;

        svg = d3.select("#plotArea").append("svg")
            .attr("id", "nba-plot")
            .attr("width", width)
            .attr("height", height);


        const game = data.filter(d => d["GAME_ID"] === gid);
        var periods = [{t: 0, label: "Q1"}, {t: 720, label: "Q2"}, {t: 1440, label: "Q3"}, {
            t: 2160,
            label: "Q4"
        }, {t: 2880, label: "OT1"}, {t: 3180, label: "OT2"}, {t: 3480, label: "OT3"}, {t: 3780, label: "OT4"}, {
            t: 4080,
            label: "OT5"
        }, {t: 4380, label: "OT6"}, {t: 4680, label: "OT7"}, {t: 4980, label: "OT8"}, {t: 5280, label: "OT9"}, {
            t: 5580,
            label: "OT10"
        },];


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
                etype: +d.EVENTMSGTYPE,
                description: d.HOMEDESCRIPTION + d.NEUTRALDESCRIPTION + d.VISITORDESCRIPTION,
                player1_team: d.PLAYER1_TEAM_NICKNAME,
                player2_team: d.PLAYER2_TEAM_NICKNAME,
                player3_team: d.PLAYER3_TEAM_NICKNAME,
                emsg: d.EVENTMSGACTIONTYPE
            }
        });

        var teams = Array.from(new Set(game
            .filter(function (d) {
                return d.PLAYER1_TEAM_NICKNAME !== "";
            })
            .map(function (d) {
                return d.PLAYER1_TEAM_NICKNAME
            })))

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

        let logo_1_url = `logos/${home_team.replace(/\s/g, '')}.png`.toLowerCase()
        let logo_2_url = `logos/${away_team.replace(/\s/g, '')}.png`.toLowerCase()

        svg.append('image')
            .attr('xlink:href', logo_1_url)
            .attr('x', 25)
            .attr('y', 50)
            .attr('width', 75)
            .attr('height', 75);

        svg.append('image')
            .attr('xlink:href', logo_2_url)
            .attr('x', 25)
            .attr('y', height - margin.bottom - 100)
            .attr('width', 75)
            .attr('height', 75);


        // plot setup
        const maxScoreDiff = d3.max(game_data, d => Math.abs(d.score_diff));

        game_data.forEach(function (d) {
            d.t = getElapsed(d.period, d.time_left)
        })

        let lastPlay = game_data[game_data.length - 1]
        game_data.push({
            period: lastPlay.period,
            t: getElapsed(lastPlay.period, lastPlay.time_left),
            score_diff: 0,
        })

        let gameLength = game_data[game_data.length - 1].t

        const x = d3.scaleLinear()
            .domain([0, gameLength])
            .range([margin.left, width - margin.right])

        const y = d3.scaleLinear()
            //.domain([-20, 20])
            .domain([-maxScoreDiff * 1.15, maxScoreDiff * 1.15])
            .range([height - margin.bottom, margin.top])

        const line_score_diff = d3.line()
            .curve(d3.curveStepAfter)
            .x(d => x(d.t))
            .y(d => y(d.score_diff))

        const areaNeg = d3.area()
            .curve(d3.curveStepAfter)
            .x(d => x(d.t))
            .y0(y(0.0))
            .y1(d => y(Math.min(0.0, d.score_diff)));

        const areaPos = d3.area()
            .curve(d3.curveStepAfter)
            .x(d => x(d.t))
            .y0(y(0.0))
            .y1(d => y(Math.max(0.0, d.score_diff)));

        // plot
        svg.append("g")
            .append("path")
            .data([game_data])
            .attr("d", line_score_diff)
            .attr("class", "lead-tracker")
        // .attr("fill", "none");

        svg.append("g")
            .append("path")
            .data([game_data])
            .attr("fill", "rgba(49, 207, 255, 0.6)")
            .attr("d", areaPos);

        svg.append("g")
            .append("path")
            .data([game_data])
            .attr("fill", "rgba(216, 137, 137, 0.6)")
            .attr("d", areaNeg);


        // momentum plots
        let momentum1 = await getMomentum(game_data, year, "ScoreNormalizedMomentum", home_team, away_team)
        momentum1.pop()

        const maxHomeMomentum = d3.max(momentum1, d => Math.abs(d.homeTeamMomentum));
        const maxAwayMomentum = d3.max(momentum1, d => Math.abs(d.awayTeamMomentum))
        var maxMomentum1 = Math.max(maxHomeMomentum, maxAwayMomentum)

        const line_home = d3.line()
            .x(d => x(d.t))
            .y(d => y((d.homeTeamMomentum / maxMomentum1) * maxScoreDiff))

        svg.append("g")
            .attr("id", "homeMomentum")
            .append("path")
            .data([momentum1])
            .attr("fill", "none")
            .attr("stroke", "blue")
            .attr("stroke-width", 2)
            .attr("d", line_home);

        const line_away = d3.line()
            .x(d => x(d.t))
            .y(d => y(-(d.awayTeamMomentum / maxMomentum1) * maxScoreDiff))

        svg.append("g")
            .attr("id", "awayMomentum")
            .append("path")
            .data([momentum1])
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", 2)
            .attr("d", line_away)


        let momentum2 = await getMomentum(game_data, year, "MAMBA", home_team, away_team)
        momentum2.pop()

        var maxMomentum2 = d3.max(momentum2, d => Math.abs(d.totalMAMBA))
        const line_MAMBA = d3.line()
            .x(d => x(d.t))
            .y(d => y((d.totalMAMBA / maxMomentum2) * maxScoreDiff))

        svg.append("g")
            .attr("id", "MAMBA")
            .append("path")
            .data([momentum2])
            .attr("fill", "none")
            .attr("stroke", "green")
            .attr("stroke-width", 2)
            .attr("d", line_MAMBA);


        let momentum3 = await getMomentum(game_data, year, "PAPM", home_team, away_team);
        momentum3.pop();

        var maxPAPM = d3.max(momentum3, d => Math.abs(d.PAPM));
        const line_PAPM = d3.line()
            .x(d => x(d.t))
            .y(d => y((d.PAPM / maxPAPM) * maxScoreDiff));

        svg.append("g")
            .attr("id", "PAPM")
            .append("path")
            .data([momentum3])
            .attr("fill", "none")
            .attr("stroke", "orange")
            .attr("stroke-width", 2)
            .attr("d", line_PAPM);


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
            const data_circ = d3.select(this).datum()
            const [x_, y_] = [parseFloat(circ.attr("cx")), parseFloat(circ.attr("cy"))];

            tooltip.transition()
                .duration(200)
                .style("opacity", .9)
            tooltip.html(data_circ.description)
                .style("left", (x_ + 95) + "px")
                .style("top", (y_ + 175) + "px")
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


        let toggles = d3.select("#checkbox").selectAll("input[type='checkbox']")
            .data(eventypes)
            .join(
                enter => enter.append("input")
                    .attr("type", "checkbox")
                    .property("checked", false)
                    .on("change", function () {
                        checkboxChange(this, game_data, mouseOver, mouseOut, x, y, accent);
                    }),


                update => update
                    .property("checked", false)
                    .on("change", function () {
                        checkboxChange(this, game_data, mouseOver, mouseOut, x, y, accent);
                    }),
                exit => exit.remove()
            );

        /*
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
             .on("change", function() { checkboxChange(toggles, game_data, mouseOver, mouseOut, x, y, accent); });
         */

        document.getElementById("graph-card").style.display = "block";
        document.getElementById('plotSkeleton').style.display = 'none'; // Hide the skeleton loader
    });
}
