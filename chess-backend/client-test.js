const http = require("http");
const { io } = require("socket.io-client");

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper to make POST request
function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(data);
    const options = {
      hostname: "localhost",
      port: PORT,
      path: urlPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": dataString.length,
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP error ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(dataString);
    req.end();
  });
}

async function runSimulation() {
  console.log("=== CHESS BACKEND SOCKET PLAY SIMULATION ===");

  try {
    // 1. Register players
    console.log("\n[1/5] Registering simulated players...");
    const suffix = Math.floor(Math.random() * 10000);
    const playerAData = await postJson("/api/auth/register", {
      username: `player_A_${suffix}`,
      email: `player_A_${suffix}@chess.com`,
      password: "password123",
    });
    console.log(`- Registered Player A: ${playerAData.user.username}`);

    const playerBData = await postJson("/api/auth/register", {
      username: `player_B_${suffix}`,
      email: `player_B_${suffix}@chess.com`,
      password: "password123",
    });
    console.log(`- Registered Player B: ${playerBData.user.username}`);

    const tokenA = playerAData.token;
    const tokenB = playerBData.token;

    // 2. Connect via Sockets
    console.log("\n[2/5] Connecting to WebSocket server...");
    const socketA = io(BASE_URL, { auth: { token: tokenA } });
    const socketB = io(BASE_URL, { auth: { token: tokenB } });

    let gameId = null;
    let socketWhite = null;
    let socketBlack = null;

    // Wait for sockets to connect
    await Promise.all([
      new Promise((res) => socketA.on("connect", res)),
      new Promise((res) => socketB.on("connect", res)),
    ]);
    console.log("- Both players connected successfully via authenticated WebSocket handshakes!");

    // 3. Join Matchmaking Queue
    console.log("\n[3/5] Players joining matchmaking queue (Blitz 3+2)...");
    socketA.emit("joinQueue", { timeControl: "3+2" });
    socketB.emit("joinQueue", { timeControl: "3+2" });

    // Handle match found
    const matchFoundPromise = new Promise((resolve) => {
      let matchCount = 0;
      
      socketA.on("matchFound", (data) => {
        console.log(`- Player A received matchFound: Game ID is ${data.gameId}, playing as ${data.color}`);
        gameId = data.gameId;
        if (data.color === "white") {
          socketWhite = socketA;
        } else {
          socketBlack = socketA;
        }
        matchCount++;
        if (matchCount === 2) resolve();
      });

      socketB.on("matchFound", (data) => {
        console.log(`- Player B received matchFound: Game ID is ${data.gameId}, playing as ${data.color}`);
        if (data.color === "white") {
          socketWhite = socketB;
        } else {
          socketBlack = socketB;
        }
        matchCount++;
        if (matchCount === 2) resolve();
      });
    });

    await matchFoundPromise;

    // 4. Join Game Room
    console.log("\n[4/5] Syncing and entering game room...");
    socketA.emit("joinGame", { gameId });
    socketB.emit("joinGame", { gameId });

    await new Promise((res) => socketA.once("gameSynced", res));
    await new Promise((res) => socketB.once("gameSynced", res));
    console.log("- Both players synced game state successfully.");

    // Setup move listeners
    socketWhite.on("moveMade", (data) => {
      console.log(`- White socket received moveMade. Move notation: ${data.move.notation}. FEN: ${data.fen}`);
    });
    socketBlack.on("moveMade", (data) => {
      console.log(`- Black socket received moveMade. Move notation: ${data.move.notation}. FEN: ${data.fen}`);
    });

    // 5. Playing Chess Moves
    console.log("\n[5/5] Simulating moves...");
    
    // Move 1: White plays e2-e4
    console.log("-> White playing e2-e4...");
    socketWhite.emit("makeMove", { gameId, from: "e2", to: "e4" });
    await new Promise((res) => socketBlack.once("moveMade", res));

    // Move 2: Black plays e7-e5
    console.log("-> Black playing e7-e5...");
    socketBlack.emit("makeMove", { gameId, from: "e7", to: "e5" });
    await new Promise((res) => socketWhite.once("moveMade", res));

    // Move 3: White plays g1-f3
    console.log("-> White playing g1-f3...");
    socketWhite.emit("makeMove", { gameId, from: "g1", to: "f3" });
    await new Promise((res) => socketBlack.once("moveMade", res));

    // Send a chat message
    console.log("-> Sending chat message...");
    socketWhite.emit("sendChatMessage", { gameId, content: "Good luck, have fun!" });
    
    await new Promise((resolve) => {
      socketBlack.once("chatMessage", (msg) => {
        console.log(`- Chat received: [${msg.senderUsername}]: ${msg.content}`);
        resolve();
      });
    });

    // Resign game
    console.log("\n-> Black resigns the match...");
    socketBlack.emit("resign", { gameId });

    const gameOverData = await new Promise((resolve) => {
      socketWhite.once("gameOver", (data) => {
        console.log(`- White socket received gameOver. Outcome: ${data.outcome}, Winner: ${data.winner}`);
        resolve(data);
      });
      socketBlack.once("gameOver", () => {});
    });

    console.log("\n=== SIMULATION RESULTS ===");
    console.log(`Winner ID: ${gameOverData.winner}`);
    console.log(`Elo Changes:`, gameOverData.ratingChanges);

    // Disconnect sockets
    socketA.disconnect();
    socketB.disconnect();
    console.log("\nSimulation finished successfully!");
    process.exit(0);

  } catch (err) {
    console.error("Simulation failed:", err);
    process.exit(1);
  }
}

runSimulation();
