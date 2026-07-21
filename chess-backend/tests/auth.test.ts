import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/db";

// ─────────────────────────────────────────────────────────────────────────────
// Test setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await prisma.chatMessage.deleteMany({});
  await prisma.move.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────

const testUser = {
  username: "chessmaster2026",
  email: "master@chess.com",
  password: "password123secure",
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("should register a new user and return access + refresh tokens", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.user.username).toBe(testUser.username);
    expect(res.body.data.user.rating).toBe(1200);
    // Never expose password hash
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(res.body.data.user).not.toHaveProperty("refreshTokenHash");
  });

  it("should reject duplicate username/email with 409", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for short password (< 8 chars)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "newuser", email: "new@chess.com", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it("should return 400 for invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "newuser2", email: "not-an-email", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.some((e: any) => e.field === "email")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  let accessToken: string;
  let refreshToken: string;

  it("should login with email and return tokens", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.user.username).toBe(testUser.username);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("should login with username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: testUser.username, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should return 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: testUser.email, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 when loginId is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "somepassword" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  // ── Token refresh ──

  it("should exchange a valid refresh token for new tokens", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
  });

  it("should return 401 for an invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "invalid.token.here" });
    expect(res.status).toBe(401);
  });

  // ── Get Me ──

  it("should retrieve own profile via GET /api/auth/me", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe(testUser.username);
    expect(res.body.data.user.email).toBe(testUser.email);
  });

  it("should return 401 for GET /api/auth/me without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// USER PROFILE
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/profile", () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: testUser.email, password: testUser.password });
    token = res.body.data.accessToken;
  });

  it("should return user profile", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(testUser.username);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/leaderboard", () => {
  it("should return paginated leaderboard without auth", async () => {
    const res = await request(app).get("/api/users/leaderboard");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.leaderboard)).toBe(true);
    expect(res.body.data).toHaveProperty("pagination");
    expect(res.body.data.leaderboard.length).toBeGreaterThan(0);
    expect(res.body.data.leaderboard[0]).toHaveProperty("rank");
  });
});
