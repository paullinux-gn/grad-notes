/** To-dos written in pages, rolled up into one list. */

import { api } from './api';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import type { Todo } from './types';

const keyOf = (t: Todo) => `${t.pageId}:${t.index}`;

class Todos {
  // Replaced on every load, never edited in place: no per-item tracking.
  items = $state.raw<Todo[]>([]);
  loaded = $state(false);
  /** Checked off here since the last refresh; they stay visible, struck through. */
  done = $state<Record<string, boolean>>({});

  async load() {
    try {
      // Make sure the page being left has its latest checkboxes saved.
      window.dispatchEvent(new Event('td:flush'));
      await store.flush();
      this.items = await api.listTodos();
      this.done = {};
      this.loaded = true;
    } catch (e) {
      ui.error(e);
    }
  }

  isDone(t: Todo) {
    return !!this.done[keyOf(t)];
  }

  async toggle(t: Todo) {
    const checked = !this.isDone(t);
    this.done[keyOf(t)] = checked;
    try {
      const updatedAt = await api.setTodo(t.pageId, t.index, t.key, checked);
      if (store.byId.has(t.pageId)) store.editOne(t.pageId, { updatedAt });
    } catch (e) {
      ui.error(e);
      await this.load();
    }
  }
}

export const todos = new Todos();
