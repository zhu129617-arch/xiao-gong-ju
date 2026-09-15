import home from './home.js';
import today from './today.js';
import media from './media.js';
import dev from './dev.js';
import consult from './consult.js';
import fitness from './fitness.js';
import diet from './diet.js';
import games from './games.js';
import settings from './settings.js';

export const VIEWS = { home, today, media, dev, consult, fitness, diet, games, settings };

export function viewFor(key) {
  return VIEWS[key] || VIEWS.home;
}
