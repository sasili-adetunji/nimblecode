import React, { PropTypes, Component } from 'react';
import CodeEditorMulti from './CodeEditorMulti';
import CodePromptMulti from '../components/CodePromptMulti';
import TimerMulti from './TimerMulti';
import MultiplayerInfo from '../components/MultiplayerInfo';
import levenshtein from './../lib/levenshtein';
import ProgressBarMulti from './ProgressBarMulti';
import { connect } from 'react-redux';
import { startGame, endGame, stopTimer, storeGameId, syncMultiplayerStatuses, startCountdown, getUsername, leavePage } from '../actions/index';
import { bindActionCreators } from 'redux';
import LevelDisplay from '../components/LevelDisplay';
import underscore from 'underscore';
import AllMiniViews from './AllMiniViews';

class Multiplayer extends Component {

  static contextTypes = {
    router: PropTypes.object
  }

  constructor() {
    super();

    this.state = {
      puzzleName: 'LOADING...',
      currentPuzzle: 'N/A',
      minifiedPuzzle: 'N/A'
    };

  };

  componentWillMount() {
    this.username = this.props.getUsername().payload;
  };

  componentDidMount() {
    this.socket = io();

    if(this.props.params.gameId){
      this.props.storeGameId(this.props.params.gameId);

      this.socket.emit('create new game', {roomcode:this.props.params.gameId, username: this.username, privacySetting: this.props.location.query.status});
    }

    // listen
    this.socket.on('player joined', function(players) {
      this.props.syncMultiplayerStatuses(players);
    }.bind(this));

    // listen
    this.socket.on('here is your prompt', function(prompt) {
      var promptCode = prompt.promptCode;
      var promptName = prompt.promptName;
      var minifiedPuzzle = promptCode.replace(/\s/g,'');

      this.setState({
        currentPuzzle: promptCode,
        minifiedPuzzle: minifiedPuzzle,
        puzzleName: promptName
      });

    }.bind(this));

    // listening for a 'all players progress' socket event and
    // collects all players' code from socket
    this.socket.on('all players progress', function(players) {
      if (this.props.multiGameState === 'STARTED_GAME') {
        underscore.map(players, function(obj, key){
          var playerPercent = this.calculatePercent(players[key][2]);
          players[key][1] = playerPercent;
        }.bind(this));
      }
      this.props.syncMultiplayerStatuses(players);

    }.bind(this));

    // listening for a 'game over' socket event to capture and stop time
    this.socket.on('game over', function(value) {
      var time = this.props.gameTime;
      underscore.once(this.saveTimeElapsed(time.tenthSeconds, time.seconds, time.minutes, value.username));

      this.props.stopTimer();
    }.bind(this));
  };

  componentWillUnmount() {
    this.socket.emit('disconnected',{roomcode:this.props.params.gameId, username: this.username})
    this.socket.disconnect();
    this.props.leavePage();
  };

  componentDidUpdate() {
    // if player finishes the puzzle, ENDED_GAME action is sent, and 'game won' socket emitted
    if (this.props.multiGameState === 'ENDED_GAME') {
      var socketInfo = {
        gameId: this.props.params.gameId,
        username: this.username,
        id: this.socket.id,
        hasWon: true
      };
      underscore.once(this.socket.emit('game won', socketInfo));
    }
  };

  sendToMultiplayerLandingPage() {
    this.context.router.push('multiplayer');
  };

  isCurrentPlayer(username) {
    if(username === this.username) {
      return 'You';
    } else {
      return username;
    }
  };

  saveTimeElapsed(tenthSeconds, seconds, minutes, winner) {
    var title, html;

    let yourTime = (minutes*60 + seconds + tenthSeconds/10).toFixed(1);

    var finalStats = this.props.multiplayerStatuses.store;

    var finalTimes = [];
    for (var key in finalStats) {
      var nameAndFinalTimeArray = [finalStats[key][1], key]
      finalTimes.push(nameAndFinalTimeArray);
    }

    finalTimes.sort(function(a, b) {
      return b[0] - a[0];
    });

    // if playing multiplayer alone
    if (finalTimes.length === 1) {
      title = "Nice! You've won!";
      html  = '<div>'
            + '<p> <b>1st Place:</b> You (' + yourTime + ' seconds)</p><br>'
            + '</div>';
    } else if (finalTimes.length === 2) {
      // if there are only two players
      if (this.username === winner) {
        title = "Nice! You've won!";
        html  = '<div>'
              + '<p> <b>1st Place:</b> You (' + yourTime + ' seconds)</p><br>'
              + '<p> <b>2nd Place:</b> ' + finalTimes[1][1] + '</p>'
              + '</div>';
      } else {
        title = "Too bad!";
        html  = '<div>'
              + '<p> <b>1st Place:</b> ' + finalTimes[0][1] + ' (' + yourTime + ' seconds)</p><br>'
              + '<p> <b>2nd Place:</b> ' + this.isCurrentPlayer(finalTimes[1][1]) + '</p>'
              + '</div>';
      }
    } else {
      if (this.username === winner) {
        title = "Nice! You've won!";
        html  = '<div>'
              + '<p> <b>1st Place:</b> You (' + yourTime + ' seconds)</p><br>'
              + '<p> <b>2nd Place:</b> ' + finalTimes[1][1] + '</p><br>'
              + '<p> <b>3rd Place:</b> ' + finalTimes[2][1] + '</p>'
              + '</div>';
      } else {
        title = "Too bad!";
        html  = '<div>'
              + '<p> <b>1st Place:</b> ' + finalTimes[0][1] + ' (' + yourTime + ' seconds)</p><br>'
              + '<p> <b>2nd Place:</b> ' + this.isCurrentPlayer(finalTimes[1][1]) + '</p><br>'
              + '<p> <b>3rd Place:</b> ' + this.isCurrentPlayer(finalTimes[2][1]) + '</p>'
              + '</div>';
      }
    }

    swal({
      title: title,
      html: html,
      showCancelButton: true,
      confirmButtonText: 'Go Home',
      cancelButtonText: 'New Game',
      confirmButtonClass: 'teal-btn btn',
      cancelButtonClass: 'oj-btn btn',
      allowOutsideClick: false,
      allowEscapeKey: false,
      buttonsStyling: false,
      closeOnConfirm: true,
      closeOnCancel: true
    }, function(isConfirm) {
      if (isConfirm === true) {
        this.context.router.push('/');
      } else if (isConfirm === false) {
        this.context.router.push('multiplayer');
      } else {
        // TODO: have some message that says, sending to multiplayer
        this.context.router.push('multiplayer');
      }
    }.bind(this));
  };

  calculatePercent(playerCode) {
    // typed code is passed in, and percent completed is calculated and returned
    var miniCode = playerCode.replace(/\s/g,'');
    var totalChars = this.state.minifiedPuzzle.length;
    var distance = levenshtein(this.state.minifiedPuzzle, miniCode);

    var percentCompleted = Math.floor(((totalChars - distance) / totalChars) * 99);
    return percentCompleted;
  };

  // sends current player's code to the socket to broadcast
  sendProgressToSockets(code, roomcode) {
    var data = {
      roomcode: roomcode,
      username: this.username,
      code: code
    }

    this.socket.emit('player progress', data);
  };

  render() {
    var privateRoomMsg = "Your friends can enter the room ID above to join this room. When you're all ready, click the start button to begin the countdown! Let it rip!";
    var publicRoomMsg = "This is a public random room. Wait for other players to join then click the start button to begin the countdown."

    if (this.props.params.gameId.charAt(0) === 'P') {
      var welcomeMsg = privateRoomMsg;
    } else {
      var welcomeMsg = publicRoomMsg;
    }


    return (
      <div className="footer">
        <MultiplayerInfo gameId={ this.props.params.gameId.charAt(0) === "P" ? ( "- Private ID:" + this.props.params.gameId.slice(1) ) : ( "- Public") } />
        <TimerMulti
          saveTimeElapsed={this.saveTimeElapsed.bind(this)}
          socket={this.socket} />
        <div className="col-sm-10 col-sm-offset-1 no-padding text-center"> {welcomeMsg} </div>
        <div className="col-sm-10 col-sm-offset-1 no-padding">
          <div className="col-sm-6"><h5><b>Copy this...</b></h5></div>
          <div className="col-sm-6"><h5><b>Type here...</b></h5></div>
          <CodePromptMulti
            puzzle={this.state.currentPuzzle}
            countingDownState={this.props.countingDown} />
          <CodeEditorMulti
            puzzle={this.state.currentPuzzle}
            minifiedPuzzle={this.state.minifiedPuzzle}
            sendProgressToSockets={this.sendProgressToSockets.bind(this)} />
        </div>

        <div className="col-sm-10 col-sm-offset-1 no-padding">
          <ProgressBarMulti socket={this.socket} />
        </div>

        <div className="col-sm-10 col-sm-offset-1 no-padding" id="allMiniViewsWrapper">
          <AllMiniViews />
        </div>
        <div className="footer"></div>
      </div>
    )
  };
};

function mapStateToProps(state) {
  return {
    multiGameState: state.multiGameState,
    countingDown: state.countingDown,
    gameTime: state.gameTime,
    savedGame: state.savedGame,
    multiplayerStatuses: state.multiplayerStatuses,
    SavedUsername: state.SavedUsername,
  }
};

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    startGame: startGame,
    storeGameId: storeGameId,
    endGame: endGame,
    stopTimer: stopTimer,
    syncMultiplayerStatuses: syncMultiplayerStatuses,
    startCountdown: startCountdown,
    getUsername: getUsername,
    leavePage: leavePage
  }, dispatch);
};

export default connect(mapStateToProps, mapDispatchToProps)(Multiplayer);
