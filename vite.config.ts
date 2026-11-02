import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Game data, simulation and the store hold module-level state and constants that
 * other modules capture at import time, so hot-swapping them leaves stale copies
 * (or a second game loop). Reload the page instead; the game saves on unload.
 */
function fullReloadGameLogic(): Plugin {
  return {
    name: 'full-reload-game-logic',
    handleHotUpdate({ file, server }) {
      if (/[\\/]src[\\/](data|sim|state)[\\/]/.test(file)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [fullReloadGameLogic(), preact()],
  server: { port: 5173 },
});
