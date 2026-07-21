import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Sathurangam Chess API",
      version: "2.0.0",
      description:
        "Production-ready REST API for the Sathurangam chess platform. " +
        "Supports real-time multiplayer via Socket.IO and full ELO matchmaking.",
      contact: { name: "Sathurangam Team" },
    },
    servers: [
      { url: `http://localhost:${env.PORT}`, description: "Development server" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your access token (not the refresh token)",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Operation successful" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "An error occurred" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            username: { type: "string", example: "chessmaster" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["USER", "ADMIN"] },
            avatar: { type: "string", nullable: true },
            rating: { type: "integer", example: 1200 },
            wins: { type: "integer", example: 10 },
            losses: { type: "integer", example: 5 },
            draws: { type: "integer", example: 2 },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Game: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["WAITING", "IN_PROGRESS", "WHITE_WON", "BLACK_WON", "DRAW"],
            },
            outcome: {
              type: "string",
              nullable: true,
              enum: [
                "CHECKMATE", "RESIGNATION", "TIMEOUT", "STALEMATE",
                "DRAW_AGREEMENT", "INSUFFICIENT_MATERIAL", "FIFTY_MOVES",
                "THREEFOLD_REPETITION",
              ],
            },
            fen: { type: "string" },
            pgn: { type: "string" },
            timeControl: { type: "string", example: "5+3" },
            whiteTimeLeftMs: { type: "integer" },
            blackTimeLeftMs: { type: "integer" },
            startedAt: { type: "string", format: "date-time", nullable: true },
            finishedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
