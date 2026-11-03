import { render } from 'preact';
import { start } from './state/store';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import { initSound } from './ui/sound';
// Self-hosted fonts, so they work offline and on GitHub Pages, declared at build time with matched line
// metrics; the Chinese one is cut down to the characters the game uses (scripts/cjk-font.ts)
import './generated/cjk-font/fonts.css';
import './styles.css';

if (location.hash === '#art') {
  render(<ArtSheet />, document.getElementById('app')!);
} else {
  initSound();
  start();
  render(<App />, document.getElementById('app')!);
}
