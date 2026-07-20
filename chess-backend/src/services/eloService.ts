import { prisma } from "../config/db";

const K_FACTOR = 32;

/**
 * Calculates new Elo ratings for two players.
 * 
 * @param ratingA Current rating of Player A
 * @param ratingB Current rating of Player B
 * @param scoreA Score of Player A (1 for win, 0.5 for draw, 0 for loss)
 * @returns Array containing [newRatingA, newRatingB]
 */
export const calculateElo = (ratingA: number, ratingB: number, scoreA: number): [number, number] => {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));

  return [newRatingA, newRatingB];
};

/**
 * Updates player Elo ratings in the database after a game finishes.
 * 
 * @param gameId The finished game ID
 * @param outcome "WHITE_WON" | "BLACK_WON" | "DRAW"
 */
export const updatePlayerRatings = async (
  gameId: string,
  outcome: "WHITE_WON" | "BLACK_WON" | "DRAW"
): Promise<{ whiteChange: number; blackChange: number } | null> => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        whitePlayer: true,
        blackPlayer: true,
      },
    });

    if (!game) return null;

    const currentWhiteRating = game.whitePlayer.rating;
    const currentBlackRating = game.blackPlayer.rating;

    let scoreWhite = 0.5;
    if (outcome === "WHITE_WON") {
      scoreWhite = 1;
    } else if (outcome === "BLACK_WON") {
      scoreWhite = 0;
    }

    const [newWhiteRating, newBlackRating] = calculateElo(
      currentWhiteRating,
      currentBlackRating,
      scoreWhite
    );

    // Update users in database
    await prisma.$transaction([
      prisma.user.update({
        where: { id: game.whitePlayerId },
        data: { rating: newWhiteRating },
      }),
      prisma.user.update({
        where: { id: game.blackPlayerId },
        data: { rating: newBlackRating },
      }),
    ]);

    return {
      whiteChange: newWhiteRating - currentWhiteRating,
      blackChange: newBlackRating - currentBlackRating,
    };
  } catch (error) {
    console.error("Error updating player ratings:", error);
    return null;
  }
};
