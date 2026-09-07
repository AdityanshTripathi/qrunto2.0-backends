import type { Socket } from 'socket.io';
import { logSafeError } from './safe-error';

// Adapters may return a Promise. Observe rejection instead of leaving an
// authenticated socket connected without its authorized tenant room.
export async function joinTenantRoom(
  socket: Pick<Socket, 'id' | 'join' | 'disconnect'>, restaurantId: string,
): Promise<void> {
  try {
    await socket.join(restaurantId);
  } catch (error) {
    logSafeError('room.join', error, 'socket.io', { socketId: socket.id });
    socket.disconnect(true);
  }
}
