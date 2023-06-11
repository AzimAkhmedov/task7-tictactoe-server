import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
const app = express();

const httpServer = createServer(app);

app.use(cors());
const socketServer = new Server(httpServer, {
  cors: {
    origin: "https://6485a42eb6fff37c822efefc--statuesque-rabanadas-4e0d08.netlify.app/",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});
import { Board } from "./board.mjs";
import { randPiece, randRoom } from "./utils.js";
import { Player } from "./player.mjs";
const rooms = new Map();

const makeRoom = (resolve) => {
  var newRoom = randRoom();
  while (rooms.has(newRoom)) {
    newRoom = randRoom();
  }
  rooms.set(newRoom, { roomId: newRoom, players: [], board: null });
  resolve(newRoom);
};
const joinRoom = (player, room) => {
  let currentRoom = rooms.get(room);
  let updatedPlayerList = currentRoom.players.push(player);
  let updatedRoom = { ...currentRoom, players: updatedPlayerList };
};
function kick(room) {
  let currentRoom = rooms.get(room);
  currentRoom.players.pop();
}
function getRoomPlayersNum(room) {
  return rooms.get(room).players.length;
}
function pieceAssignment(room) {
  const firstPiece = randPiece();
  const lastPiece = firstPiece === "X" ? "O" : "X";

  let currentRoom = rooms.get(room);
  currentRoom.players[0].piece = firstPiece;
  currentRoom.players[1].piece = lastPiece;
}
function newGame(room) {
 let currentRoom = rooms.get(room);
  const board = new Board();
  currentRoom.board = board;
}

const handleConnect = (socket) => {
  console.log("Connected");
  socket.on("newGame", () => {
    console.log("Emited newGame");
    new Promise(makeRoom).then((room) => {
      socket.emit("newGameCreated", room);
    });
  });

  socket.on("joining", ({ room }) => {
    console.log("emited joininig");
    if (rooms.has(room)) {
      socket.emit("joinConfirmed");
    } else {
      socket.emit("errorMessage", "No room with that id found");
    }
  });

  socket.on("newRoomJoin", ({ room, name }) => {
    console.log("emited newRoomJoin");
    if (room === "" || name === "") {
      socketServer.to(socket.id).emit("joinError");
    }
    socket.join(room);
    const id = socket.id;
    const newPlayer = new Player(name, room, id);
    joinRoom(newPlayer, room);
    const peopleInRoom = getRoomPlayersNum(room);

    if (peopleInRoom === 1) {
      socketServer.to(room).emit("waiting");
    }

    if (peopleInRoom === 2) {
      pieceAssignment(room);
     let currentPlayers = rooms.get(room).players;
      for (const player of currentPlayers) {
        socketServer.to(player.id).emit("pieceAssignment", {
          piece: player.piece,
          id: player.id,
        });
      }
      newGame(room);

      const currentRoom = rooms.get(room);
      const gameState = currentRoom.board.game;
      const turn = currentRoom.board.turn;
      const players = currentRoom.players.map((player) => [
        player.id,
        player.name,
      ]);
      socketServer.to(room).emit("starting", { gameState, players, turn });
    }

    if (peopleInRoom === 3) {
      socket.leave(room);
      kick(room);
      socketServer.to(socket.id).emit("joinError");
    }
  });

  socket.on("move", ({ room, piece, index }) => {
    let currentBoard = rooms.get(room)?.board;
    currentBoard?.move(index, piece);

    if (currentBoard?.checkWinner(piece)) {
      socketServer.to(room).emit("winner", {
        gameState: currentBoard.game,
        id: socket.id,
      });
    } else if (currentBoard?.checkDraw()) {
      socketServer.to(room).emit("draw", { gameState: currentBoard.game });
    } else {
      currentBoard?.switchTurn();
      socketServer.to(room).emit("update", {
        gameState: currentBoard.game,
        turn: currentBoard.turn,  
      });
    }
  });

  socket.on("playAgainRequest", (room) => {
   let currentRoom = rooms.get(room);
    currentRoom.board.reset();
    pieceAssignment(room);
    let currentPlayers = currentRoom.players;
    for (const player of currentPlayers) {
      socketServer.to(player.id).emit("pieceAssignment", {
        piece: player.piece,
        id: player.id,
      });
    }

    socketServer.to(room).emit("restart", {
      gameState: currentRoom.board.game,
      turn: currentRoom.board.turn,
    });
  });

  socket.on("disconnecting", () => {
    const currentRooms = Object.keys(socket.rooms);
    if (currentRooms.length === 2) {
      const room = currentRooms[1];
      const num = getRoomPlayersNum(room);
      if (num === 1) {
        rooms.delete(room);
      }
      if (num === 2) {
       let currentRoom = rooms.get(room);
        currentRoom.players = currentRoom.players.filter(
          (player) => player.id !== socket.id
        );
        io.to(room).emit("waiting");
      }
    }
  });
};

socketServer.on("connection", handleConnect);

httpServer.listen(5000, () => {
  console.log("App is running in 5000");
});
