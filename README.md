# NBA Momentum Visualizer

## Description
This package offers a powerful solution for extracting NBA game data from stats.nba.com and fetching pace data from basketball-reference.com. With a focus on data visualization, it provides capabilities to create insightful visualizations for each game. The included `calculation.js` module features three distinct calculations for momentum analysis: ScoreNormalizedTime, PAPM, and MAMBA. Utilizing the d3.js library, the `script.js` file enables the creation of dynamic and interactive game and momentum visualizations, enhancing understanding and analysis of NBA game dynamics, and `experiments.js` calculates each momentum value for NBA games given the year(s) of the season start to see how predictive each metric is of which team wins.

## Installation
### Prerequisites
- Node
- Web Browser
- _(Optional)_ [pnpm](https://pnpm.io/installation)

### Setup

1. Navigate to current directory in terminal
```zsh
cd path/to/nba-momentum-visualizer
```

2. Install dependencies

For npm
```zsh
npm install
```

*(Optional)* If you have pnpm installed, you can use it instead of npm
```zsh
pnpm install
```

## Execution

Start the server by running the following command in the same directory as installation.

```zsh
npm start
```

Navigate to http://localhost:3000/ in your browser. API documentation is up at [http:/localhost:3000/doc]()

_Note:_ Nodemon will automatically refresh the node environment if you make any local changes.
