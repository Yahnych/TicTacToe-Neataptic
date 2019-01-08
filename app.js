//
// Imports
//
const express = require('express');
const neataptic = require('neataptic');
const log = require('logger');
const fs = require('fs');
const URL = require('url').URL;

//
// Globals
//
var app = express();


function randomInt(N)
{
    return Math.floor(Math.random() * N);
}


//
// TODO Move these into another file
//
class TicTacToe
{
    constructor(players)
    {
        this._players = players;
        this._winner = null;
        this._numRoundsPlayed = 0;
        this._firstPlayerIndex = randomInt(players.length);
        this._isGameOver = false;
        this._tokens = ['X', 'O', ' '];
        this._emptyId = players.length;
        this._board = [];
        for (var i=0; i<9; ++i)
        {
            this._board.push(this._emptyId);
        }
    }

    static maxRounds()
    {
        return 5;
    }

    getNumRoundsPlayed()
    {
        return this._numRoundsPlayed;
    }

    isWinner(player)
    {
        return (player.id == this._winner) ? true : false;
    }

    // Lost fast ... almost won... 0 (tie) ... barely won ... Won Fast
    // maxRounds == 5
    // numPlayed = 3, 4, or 5
    // winner: 3, 2, or 1
    // loser: -3, -2, or -1
    scorePlayer(player)
    {
        var isTie = (this._emptyId == this._winner) ? 0.0 : 1.0; // Score of 0 for ties!
        var roundFactor = TicTacToe.maxRounds() - this.getNumRoundsPlayed() + 1.0; // # rounds remaining plus 1
        var isWinner = (this._winner == player.id) ? 1.0 : -1.0; // positive score for winner, negative for loser
        return roundFactor * isTie * isWinner;
    }

    getWinner()
    {
        var b = this._board;
        if (b[0] !== this._emptyId && b[0] === b[1] && b[1] === b[2]) return b[0];
        if (b[3] !== this._emptyId && b[3] === b[4] && b[4] === b[5]) return b[3];
        if (b[6] !== this._emptyId && b[6] === b[7] && b[7] === b[8]) return b[6];
        if (b[0] !== this._emptyId && b[0] === b[3] && b[3] === b[6]) return b[0];
        if (b[1] !== this._emptyId && b[1] === b[4] && b[4] === b[7]) return b[1];
        if (b[2] !== this._emptyId && b[2] === b[5] && b[5] === b[8]) return b[2];
        if (b[0] !== this._emptyId && b[0] === b[4] && b[4] === b[8]) return b[0];
        if (b[2] !== this._emptyId && b[2] === b[4] && b[4] === b[6]) return b[2];

        return (b.filter(x => x === this._emptyId).length === 0) ? this._emptyId : null;
    }

    // Apply the player's move, and analyze the game state
    applyMove(playerIdx, move)
    {
        log.Log("[applyMove] playerIdx: %s, move: %s", playerIdx, move)
        var pid = this._players[playerIdx].id;
        this._board[move] = pid;
        var winner = this.getWinner();
        // If a winner has been determined:
        if (winner != null)
        {
            this._isGameOver = true;
            this._winner = winner;
        }
    }

    playRound()
    {
        log.Log("new round: %s", this._numRoundsPlayed);
        // let each player play their move, starting with the first player.
        for(var i=this._firstPlayerIndex; i<this._firstPlayerIndex + this._players.length; ++i)
        {
            var idx = i % this._players.length;
            var nextMove = this._players[idx].getNextMove(this);
            this.applyMove(idx, nextMove);
            if (this._isGameOver)
            {
                break;
            }
        }
    }

    play()
    {
        while (!this._isGameOver)
        {
            this.playRound();
            this._numRoundsPlayed++;
        }

        log.Log("Winner is \"%s\" [%s]", this._tokens[this._winner], this._winner)
        this.printBoard();
    }

    printBoard()
    {
        var b = this._board;
        var t = this._tokens;
        log.Log("%s|%s|%s\n-----\n%s|%s|%s\n-----\n%s|%s|%s",
            t[b[0]], t[b[1]], t[b[2]],
            t[b[3]], t[b[4]], t[b[5]],
            t[b[6]], t[b[7]], t[b[8]]);
    }
}

class Player
{
    constructor(id)
    {
        this._id = id;
    }

    set id (id)
    {
        this._id = id;
    }

    get id ()
    {
        return this._id;
    }
}

class NEATPlayer extends Player
{
    constructor(genome, id)
    {
        super(id);
        this._genome = genome;
    }

    static numInputs()
    {
        return 18;
    }

    static numOutputs()
    {
        return 9;
    }

    getNextMove(game)
    {
        var input = [];
        log.Log("[getNextMove] board [%O] %O", game._board.length, game._board);
        for (var i=0; i<game._board.length; ++i)
        {
            // Each board square gets two inputs. Inputs are encoded as:
            // 0,0 == Empty Space
            // 1,0 == We own it
            // 0,1 == Opponent owns it
            var id = game._board[i];
            input.push((id == this.id) ? 1.0 : 0.0);
            input.push((id != this.id && id != game._emptyId) ? 1.0 : 0.0);
        }
        var output = this._genome.activate(input);
        log.Log("[getNextMove] raw output: %O", output);
        output = output.map(x => Math.round(x));
        log.Log("[getNextMove] input [%O]: %O", input.length, input);
        log.Log("[getNextMove] output [%O]: %O", output.length, output);

        var validMoves = [];
        for (var j in game._board)
        {
            if (game._board[j] === game._emptyId)
            {
                validMoves.push(Number(j));
            }
        }

        log.Log("[getNextMove] valid moves: %O", validMoves);

        // Find the first activated neuron, taking into account valid moves
        var move = -1;
        for (var j in validMoves)
        {
            var k = validMoves[j];
            if (1 <= output[k])
            {
                move = k;
                log.Log("[getNextMove] network selected move: %O", move);
                break;
            }
        }

        // If no neurons were activated, just choose the first available move
        if (-1 == move)
        {
            move = validMoves[0];
            log.Log("[getNextMove] Using auto-selected move: %O", move);
        }

        return move;
    }
}

class RandomPlayer extends Player
{
    constructor(id)
    {
        super(id);
    }

    getNextMove(game)
    {
        // random move
        var moves = [];
        for (var i in game._board)
        {
            if (game._board[i] === game._emptyId)
            {
                moves.push(Number(i));
            }
        }
        log.Log("[Player::getNextMove] moves: %O", moves);
        return moves[randomInt(moves.length)];
    }
}



//
// Returns the score for both genomeA and genomeB
function playGame(config, genomes)
{
    var players = [];
    for (var id in genomes)
    {
        players.push(new config.player(genomes[id], Number(id)));
    }
    var game = new config.game(players);
    game.play();
    return players.map(player => game.scorePlayer(player));
}


//
// Evalulate the genome population. Each genome will be used to play several games.
// The score from each game will be added up and returned as the score for the genome.
//
// @Note: Input is the entire genome population. We're responsible for updating each genome's
// score.
function evaluatePopulation(config, population)
{
    // reset all scores
    for (var i in population)
    {
        population[i].score = 0;
    }

    for (var i in population)
    {
        i = Number(i);
        var genome = population[i];
        var score = 0;
        // Each genome will play the game against every other genome in the population
        // for `config.rounds` number of games
        for (var j=i+1; j<population.length; ++j)
        {
            log.Log("i: %s, j: %s, length: %s", i, j, population.length);
            var players = [genome, population[j]];
            for (var k=0; k<config.rounds; ++k)
            {
                var scores = playGame(config, players);
                log.Log("player scores: %O", scores);
                for (var l in scores)
                {
                    players[l].score += scores[l];
                    log.Log("Player %s new score: %s (%s)", l, players[l].score, scores[l]);
                }
            }
        }
    }

    neat.sort();
    log.Log("Tournament complete. Highest: %O, Avg: %O", neat.getFittest().score, neat.getAverage());


}

// Pass in a simulation options object. It'll package up the neat options, as well as
// any options required for the games. For example, the inputs/outputs for the network
// are actually properties of the player, and should be passed-in to here.
function initialize_neataptic(config)
{
    log.Instrument("initialize_neataptic");
    var numInputs = config.player.numInputs();
    var numOutputs = config.player.numOutputs();
    var fitnessFunction = function(population) { return evaluatePopulation(config, population); };
    var numHidden = randomInt(4);
    var options = {
        //clear: true, // recommended for recurrent networks
        elitism: Math.round(config.populationSize * .2), // 20% elitism
        fitnessPopulation: true, // true == passes entire population array to fitness func, else individual genomes
        mutation: neataptic.methods.mutation.ALL,
        mutationRate: 0.3,
        //mutationAmount: 1,
        popsize: config.populationSize,
        //provenance: Math.round(config.populationSize * .02), // 2% provenance -- copies of the initial random network below:
        //network: new neataptic.architect.Random (
        //    numInputs,
        //    numHidden,
        //    numOutputs
        //)
        //selection: methods.selection.POWER,
        //equal: false, // stimulates more diverse network architectures
    };

    var neat = new neataptic.Neat(
        numInputs,
        numOutputs,
        fitnessFunction,
        options);

    log.InstrumentEnd("initialize_neataptic");//, neat);
    return neat;
}


app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});


var config = {
    player: NEATPlayer,
    game: TicTacToe,
    rounds: 3,
    populationSize: 300,
    evolutionCycles: 100000
}
log.setEnabled(false);
var neat = initialize_neataptic(config);

var PLAY_GENOME;// = "file:///home/ajperez/projects/neataptic/generated/TTO-NN-9900-524.json";

if (PLAY_GENOME)
{
    console.log("Playing genome: %O", PLAY_GENOME);
    var json = fs.readFileSync(new URL(PLAY_GENOME));
    var genome = JSON.parse(json);
    log.setEnabled(true);
    var players = [new RandomPlayer(0), new NEATPlayer(neataptic.Network.fromJSON(genome), 1)];
    var game = new TicTacToe(players);
    game.play();
}
else
{
    if (USE_POPULATION)
    {
        console.log("Starting from assigned population: %O", USE_POPULATION);
        var json = fs.readFileSync(new URL(USE_POPULATION));
        var population = JSON.parse(json);
        neat.population = population;
    }

    var exportFittest = Math.round(config.evolutionCycles * .01);
    var exportPopulation = Math.round(config.evolutionCycles * .05);
    for (var i=1; i<=config.evolutionCycles; ++i)
    {
        neat.evolve();
        var fittest = neat.getFittest();
        console.log("After Evolution Cycle %O -- fittest: %O", i, fittest.score);
        if (i % (exportFittest) == 0)
        {
            var json = JSON.stringify(fittest.toJSON());
            var filename = "generated/fittest-"+i+".json";
            console.log("Exporting to file: %O", filename);
            fs.writeFileSync(filename, json, 'utf8');
        }

        if (i % (exportPopulation) == 0)
        {
            console.log("Exporting population");
            var json = JSON.stringify(neat.export());
            var filename = "generated/population-"+i+".json";
            fs.writeFileSync(filename, json, 'utf8');
        }
    }
    console.log("Done evolving!");
}


