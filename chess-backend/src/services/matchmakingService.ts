import { prisma } from "../config/db";
import { gameEngineService } from "./gameEngineService";

export interface MatchmakeResult {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  timeControl: string;
}

class MatchmakingService {
  // Key: timeControl (e.g., "3+2", "10+0"). Value: Array of userIds.
  private queues = new Map<string, string[]>();

  public onMatchFound: ((match: MatchmakeResult) => void) | null = null;

  /**
   * Adds a user to the matchmaking queue for a specific time control.
   */
  public async joinQueue(userId: string, timeControl: string): Promise<boolean> {
    this.leaveAllQueues(userId);

    if (!this.queues.has(timeControl)) {
      this.queues.set(timeControl, []);
    }

    const queue = this.queues.get(timeControl)!;
    if (!queue.includes(userId)) {
      queue.push(userId);
    }

    await this.checkAndPair(timeControl);
    return true;
  }

  /**
   * Removes a user from all matchmaking queues.
   */
  public leaveQueue(userId: string): void {
    this.leaveAllQueues(userId);
  }

  /**
   * Private helper to remove user from all queues.
   */
  private leaveAllQueues(userId: string): void {
    for (const [timeControl, queue] of this.queues.entries()) {
      const index = queue.indexOf(userId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  }

  /**
   * Checks if there are enough players in a queue to form a match.
   */
  private async checkAndPair(timeControl: string): Promise<void> {
    const queue = this.queues.get(timeControl);
    if (!queue || queue.length < 2) return;

    // Retrieve first two players
    const playerAId = queue.shift()!;
    const playerBId = queue.shift()!;

    // Randomize colors (White / Black)
    const players = [playerAId, playerBId];
    const isRand = Math.random() < 0.5;
    const whitePlayerId = isRand ? players[0] : players[1];
    const blackPlayerId = isRand ? players[1] : players[0];

    try {
      const { initialTimeMs } = gameEngineService.parseTimeControl(timeControl);

      // Create game record in database
      const game = await prisma.game.create({
        data: {
          whitePlayerId,
          blackPlayerId,
          status: "IN_PROGRESS",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          timeControl,
          whiteTimeLeftMs: initialTimeMs,
          blackTimeLeftMs: initialTimeMs,
        },
      });

      // Initialize game in-memory clocks and validation state
      await gameEngineService.startGame(
        game.id,
        whitePlayerId,
        blackPlayerId,
        timeControl
      );

      // Trigger socket notification
      if (this.onMatchFound) {
        this.onMatchFound({
          gameId: game.id,
          whitePlayerId,
          blackPlayerId,
          timeControl,
        });
      }
    } catch (error) {
      console.error("Matchmaking creation error:", error);
      // Put players back in queue if game creation fails
      queue.unshift(playerBId);
      queue.unshift(playerAId);
    }
  }
}

export const matchmakingService = new MatchmakingService();
export default matchmakingService;
