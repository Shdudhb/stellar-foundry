import { render } from 'preact';
import { start } from './state/store';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import { initSound } from './ui/sound';
// Self-hosted fonts, so they work offline and on GitHub Pages. The Chinese one is cut down at build time
// to the characters the game uses (scripts/cjk-font.ts).
import '@fontsource-variable/oxanium';
import './generated/cjk-font/cjk-font.css';
import './styles.css';

if (location.hash === '#art') {
  render(<ArtSheet />, document.getElementById('app')!);
} else {
  initSound();
  start();
  render(<App />, document.getElementById('app')!);
}
