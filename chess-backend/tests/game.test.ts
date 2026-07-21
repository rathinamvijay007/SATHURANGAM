import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/db";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let adminToken: string;
let playerOneToken: string;
let playerOneId: string;
let playerTwoId: string;

const adminUser = { username: "admin_user", email: "admin@chess.com", password: "adminpass123" };
const playerOne = { username: "player_one", email: "player1@chess.com", password: "playerpass123" };
const playerTwo = { username: "player_two", email: "player2@chess.com", password: "playerpass123" };

beforeAll(async () => {
  await prisma.chatMessage.deleteMany({});
  await prisma.move.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.user.deleteMany({});

  // Register admin
  await request(app).post("/api/auth/register").send(adminUser);
  await prisma.user.updateMany({ where: { email: adminUser.email }, data: { role: "ADMIN" } });
  const adminLogin = await request(app)
    .post("/api/auth/login")
    .send({ loginId: adminUser.email, password: adminUser.password });
  adminToken = adminLogin.body.data.accessToken;

  // Register player 1
  const p1Reg = await request(app).post("/api/auth/register").send(playerOne);
  playerOneId = p1Reg.body.data.user.id;
  const p1Login = await request(app)
    .post("/api/auth/login")
    .send({ loginId: playerOne.email, password: playerOne.password });
  playerOneToken = p1Login.body.data.accessToken;

  // Register player 2
  const p2Reg = await request(app).post("/api/auth/register").send(playerTwo);
  playerTwoId = p2Reg.body.data.user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/games
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/games", () => {
  it("should return paginated game history", async () => {
    const res = await request(app)
      .get("/api/games")
      .set("Authorization", `Bearer ${playerOneToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.games)).toBe(true);
    expect(res.body.data).toHaveProperty("pagination");
  });

  it("should require authentication", async () => {
    const res = await request(app).get("/api/games");
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games (admin only)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/games", () => {
  let gameId: string;

  it("should create a game as admin", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerTwoId, timeControl: "5+3" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.game).toHaveProperty("id");
    expect(res.body.data.game.status).toBe("WAITING");
    gameId = res.body.data.game.id;
  });

  it("should return 403 for non-admin creating a game", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${playerOneToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerTwoId, timeControl: "5+3" });

    expect(res.status).toBe(403);
  });

  it("should validate the time control format", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerTwoId, timeControl: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it("should reject games where both players are the same", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerOneId, timeControl: "5+3" });

    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/games/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/games/:id", () => {
  let gameId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerTwoId, timeControl: "10+0" });
    gameId = res.body.data.game.id;
  });

  it("should retrieve game details", async () => {
    const res = await request(app)
      .get(`/api/games/${gameId}`)
      .set("Authorization", `Bearer ${playerOneToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.game.id).toBe(gameId);
    expect(res.body.data.game).toHaveProperty("whitePlayer");
    expect(res.body.data.game).toHaveProperty("blackPlayer");
    expect(res.body.data.game).toHaveProperty("moves");
  });

  it("should return 404 for non-existent game", async () => {
    const res = await request(app)
      .get("/api/games/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${playerOneToken}`);

    expect(res.status).toBe(404);
  });

  it("should return 400 for invalid UUID param", async () => {
    const res = await request(app)
      .get("/api/games/not-a-uuid")
      .set("Authorization", `Bearer ${playerOneToken}`);

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/games/:id (admin only)
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/games/:id", () => {
  let deleteGameId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ whitePlayerId: playerOneId, blackPlayerId: playerTwoId, timeControl: "3+2" });
    deleteGameId = res.body.data.game.id;
  });

  it("should return 403 if non-admin tries to delete", async () => {
    const res = await request(app)
      .delete(`/api/games/${deleteGameId}`)
      .set("Authorization", `Bearer ${playerOneToken}`);
    expect(res.status).toBe(403);
  });

  it("should delete a game as admin", async () => {
    const res = await request(app)
      .delete(`/api/games/${deleteGameId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
