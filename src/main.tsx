import { render } from 'preact';
import { start } from './state/store';
import { App } from './ui/App';
import './styles.css';

start();
render(<App />, document.getElementById('app')!);
