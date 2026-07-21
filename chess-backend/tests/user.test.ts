import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/db";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let userToken: string;
let userId: string;

const testUser = {
  username: "usertest_player",
  email: "usertest@chess.com",
  password: "securepass123",
};

beforeAll(async () => {
  await prisma.chatMessage.deleteMany({});
  await prisma.move.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.user.deleteMany({});

  const reg = await request(app).post("/api/auth/register").send(testUser);
  userId = reg.body.data.user.id;

  const login = await request(app)
    .post("/api/auth/login")
    .send({ loginId: testUser.email, password: testUser.password });
  userToken = login.body.data.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/profile
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/profile", () => {
  it("should return full user profile for authenticated user", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(testUser.username);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.rating).toBe(1200);
    expect(res.body.data.user).toHaveProperty("wins");
    expect(res.body.data.user).toHaveProperty("losses");
    expect(res.body.data.user).toHaveProperty("draws");
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/users/profile");
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/profile
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/users/profile", () => {
  it("should update username successfully", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ username: "updated_player" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe("updated_player");
  });

  it("should update avatar URL", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ avatar: "https://example.com/avatar.png" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toBe("https://example.com/avatar.png");
  });

  it("should reject invalid avatar URL", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ avatar: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it("should return 401 without token", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .send({ username: "hacker" });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/password
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/users/password", () => {
  it("should change password with correct current password", async () => {
    const res = await request(app)
      .patch("/api/users/password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        currentPassword: testUser.password,
        newPassword: "newSecurePass456",
        confirmPassword: "newSecurePass456",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should return 401 for wrong current password", async () => {
    const res = await request(app)
      .patch("/api/users/password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        currentPassword: "wrongpassword",
        newPassword: "anotherPass789",
        confirmPassword: "anotherPass789",
      });

    expect(res.status).toBe(401);
  });

  it("should return 400 when passwords do not match", async () => {
    const res = await request(app)
      .patch("/api/users/password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        currentPassword: testUser.password,
        newPassword: "newpass123",
        confirmPassword: "mismatch456",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.some((e: any) => e.field === "confirmPassword")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/leaderboard
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/leaderboard", () => {
  it("should return leaderboard without auth", async () => {
    const res = await request(app).get("/api/users/leaderboard");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.leaderboard)).toBe(true);
    expect(res.body.data.pagination).toHaveProperty("total");
    expect(res.body.data.pagination).toHaveProperty("totalPages");
  });

  it("should support pagination via query params", async () => {
    const res = await request(app).get("/api/users/leaderboard?page=1&limit=5");

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(5);
  });

  it("should return 400 for invalid limit", async () => {
    const res = await request(app).get("/api/users/leaderboard?limit=999");
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/stats
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/:id/stats", () => {
  it("should return stats for a valid user ID", async () => {
    const res = await request(app).get(`/api/users/${userId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data).toHaveProperty("stats");
    expect(res.body.data.stats).toHaveProperty("totalGames");
    expect(res.body.data.stats).toHaveProperty("winRate");
  });

  it("should return 404 for unknown user ID", async () => {
    const res = await request(app).get(
      "/api/users/00000000-0000-0000-0000-000000000000/stats"
    );
    expect(res.status).toBe(404);
  });

  it("should return 400 for invalid UUID", async () => {
    const res = await request(app).get("/api/users/not-a-uuid/stats");
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/matches
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/:id/matches", () => {
  it("should return empty paginated match history", async () => {
    const res = await request(app).get(`/api/users/${userId}/matches`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.games)).toBe(true);
    expect(res.body.data.pagination).toHaveProperty("total");
  });

  it("should return 404 for unknown user", async () => {
    const res = await request(app).get(
      "/api/users/00000000-0000-0000-0000-000000000000/matches"
    );
    expect(res.status).toBe(404);
  });
});
