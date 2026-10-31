import { h } from '../ui.js';
import { EXERCISES, AREAS, REGIONS, doseText } from '../data.js';
import { createFigure } from '../figure.js';

let filter = 'all';

export function libraryView() {
  const grid = h('div', { class: 'grid' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '部位で絞り込み' });

  const draw = () => {
    chips.replaceChildren(...[['all', 'すべて'], ['upper', REGIONS.upper], ['lower', REGIONS.lower]].map(([k, label]) =>
      h('button', { class: 'chip' + (filter === k ? ' on' : ''), 'aria-pressed': String(filter === k), onclick: () => { filter = k; draw(); } }, label)));
    grid.replaceChildren(...EXERCISES.filter((e) => filter === 'all' || e.region === filter).map((ex) =>
      h('a', { class: 'card ex-card', href: `#/ex/${ex.id}` },
        createFigure(ex, { still: true }).el,
        h('strong', {}, ex.name),
        h('span', { class: 'tag' }, AREAS[ex.area]),
        h('span', { class: 'muted small-text' }, doseText(ex)))));
  };
  draw();

  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '体操をえらぶ'),
    h('p', { class: 'muted' }, '動きのアニメーションと手順を見ながら行えます。'),
    chips, grid);
}
