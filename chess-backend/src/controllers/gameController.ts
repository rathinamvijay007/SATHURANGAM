import { Response } from "express";
import { prisma } from "../config/db";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

export const getGameHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    const games = await prisma.game.findMany({
      where: {
        OR: [
          { whitePlayerId: userId },
          { blackPlayerId: userId }
        ]
      },
      include: {
        whitePlayer: {
          select: { id: true, username: true, rating: true }
        },
        blackPlayer: {
          select: { id: true, username: true, rating: true }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.status(200).json(games);
  } catch (error) {
    console.error("Get game history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGameDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        whitePlayer: {
          select: { id: true, username: true, rating: true }
        },
        blackPlayer: {
          select: { id: true, username: true, rating: true }
        },
        moves: {
          orderBy: { moveNumber: "asc" }
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });

    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    res.status(200).json(game);
  } catch (error) {
    console.error("Get game details error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
