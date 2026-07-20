import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/db";

beforeAll(async () => {
  // Clear the database before tests run
  await prisma.chatMessage.deleteMany({});
  await prisma.move.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Authentication & User API Endpoints", () => {
  let token: string;
  const testUser = {
    username: "chessmaster2026",
    email: "master@chess.com",
    password: "password123",
  };

  it("should register a new user successfully", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.username).toBe(testUser.username);
    expect(res.body.user.rating).toBe(1200);
    
    // Store token for subsequent tests
    token = res.body.token;
  });

  it("should fail to register user with same username/email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("should login successfully with registered credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        loginId: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.username).toBe(testUser.username);
  });

  it("should retrieve user profile successfully using JWT", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(testUser.username);
    expect(res.body.email).toBe(testUser.email);
  });

  it("should retrieve leaderboard successfully", async () => {
    const res = await request(app)
      .get("/api/users/leaderboard");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].username).toBe(testUser.username);
  });
});
