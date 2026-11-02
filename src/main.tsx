import { render } from 'preact';
import { start } from './state/store';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import { initSound } from './ui/sound';
import './styles.css';

if (location.hash === '#art') {
  render(<ArtSheet />, document.getElementById('app')!);
} else {
  initSound();
  start();
  render(<App />, document.getElementById('app')!);
}
