<script lang="ts" module>
  import { databases, ACTION_TYPES } from '../databases.svelte';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import { option } from './schema';
  import type { ActionValue, DbAction } from '../types';

  /** An action in words: "set Status to Done", "add a row to Reading list". */
  export function describeAction(dbId: string, a: DbAction): string {
    switch (a.type) {
      case 'set': {
        const p = databases.prop(dbId, a.prop);
        if (!p) return 'set a property';
        return `set ${p.name} to ${describeValue(dbId, a.prop, a.value)}`;
      }
      case 'add':
        return `add a row to ${a.db === dbId ? 'this database' : store.byId.get(a.db)?.title || 'a database'}`;
      case 'open':
        return 'open the page';
      case 'url':
        return a.url ? `open ${a.url}` : 'open a link';
    }
  }

  export function describeValue(dbId: string, propId: string, v: ActionValue): string {
    const p = databases.prop(dbId, propId);
    switch (v.mode) {
      case 'clear':
        return p?.type === 'checkbox' ? 'unchecked' : 'empty';
      case 'today':
        return v.days ? (v.days === 1 ? 'tomorrow' : `today + ${v.days} days`) : 'today';
      case 'now':
        return 'now';
      case 'toggle':
        return 'the opposite';
      case 'add':
        return v.by < 0 ? `itself − ${-v.by}` : `itself + ${v.by}`;
      case 'value': {
        const x = v.value;
        if (p?.type === 'checkbox') return x ? 'checked' : 'unchecked';
        if (p && (p.type === 'select' || p.type === 'status')) return option(p, x)?.name ?? '?';
        if (p?.type === 'multiSelect') return (Array.isArray(x) ? x : []).map((id) => option(p, id)?.name ?? '?').join(', ');
        if (p?.type === 'course') return planner.courseById.get(String(x))?.name ?? '?';
        return `“${String(x ?? '')}”`;
      }
    }
  }
</script>

<script lang="ts">
  /**
   * Edits a list of actions (a button's, or an automation's "then"): set a
   * property, add a row somewhere, open the page, open a link.
   */
  import Icon from '../components/Icon.svelte';
  import { options } from './schema';
  import type { Property } from '../types';

  let {
    dbId,
    actions,
    onchange,
    button = false,
  }: {
    dbId: string;
    actions: DbAction[];
    onchange: (actions: DbAction[]) => void;
    /** A button's actions can also open things. */
    button?: boolean;
  } = $props();

  const settable = $derived(databases.props(dbId).filter((p) => ACTION_TYPES.has(p.type)));

  function update(i: number, a: DbAction) {
    onchange(actions.map((x, j) => (j === i ? a : x)));
  }

  function firstValue(p: Property | undefined): ActionValue {
    if (!p) return { mode: 'clear' };
    switch (p.type) {
      case 'checkbox':
        return { mode: 'value', value: true };
      case 'date':
        return { mode: 'today' };
      case 'number':
        return { mode: 'add', by: 1 };
      case 'select':
      case 'status': {
        const o = p.type === 'status' ? (options(p).find((x) => x.group === 'done') ?? options(p)[0]) : options(p)[0];
        return o ? { mode: 'value', value: o.id } : { mode: 'clear' };
      }
      case 'multiSelect':
        return options(p)[0] ? { mode: 'value', value: [options(p)[0].id] } : { mode: 'clear' };
      case 'course':
        return planner.courses[0] ? { mode: 'value', value: planner.courses[0].id } : { mode: 'clear' };
      default:
        return { mode: 'value', value: '' };
    }
  }

  function newAction(type: DbAction['type']): DbAction {
    switch (type) {
      case 'set': {
        const p = settable.find((x) => x.type !== 'title') ?? settable[0];
        return { type: 'set', prop: p?.id ?? '', value: firstValue(p) };
      }
      case 'add':
        return { type: 'add', db: dbId, title: '' };
      case 'open':
        return { type: 'open' };
      case 'url':
        return { type: 'url', url: '' };
    }
  }

  /** What a "set" action's value picker shows, as one key. */
  function valueKey(p: Property, v: ActionValue): string {
    if (v.mode === 'value') {
      if (p.type === 'checkbox') return v.value ? 'on' : 'off';
      if (p.type === 'multiSelect') return `o:${(v.value as string[])?.[0] ?? ''}`;
      if (p.type === 'select' || p.type === 'status' || p.type === 'course') return `o:${String(v.value ?? '')}`;
      return 'set';
    }
    if (v.mode === 'today') return `today:${v.days ?? 0}`;
    return v.mode;
  }

  function fromKey(p: Property, key: string, cur: ActionValue): ActionValue {
    if (key === 'clear' || key === 'now' || key === 'toggle') return { mode: key };
    if (key === 'on' || key === 'off') return { mode: 'value', value: key === 'on' };
    if (key.startsWith('today:')) return { mode: 'today', days: Number(key.slice(6)) };
    if (key === 'add') return { mode: 'add', by: cur.mode === 'add' ? cur.by : 1 };
    if (key === 'set') return { mode: 'value', value: cur.mode === 'value' ? cur.value : p.type === 'number' ? 0 : '' };
    const id = key.slice(2);
    return { mode: 'value', value: p.type === 'multiSelect' ? [id] : id };
  }

  const otherDbs = $derived(databases.list);
  /** Relations in database `db` that point back to this one (to link the new row). */
  const linksIn = (db: string) => databases.props(db).filter((p) => p.type === 'relation' && p.config.database === dbId);
</script>

<div class="actions">
  {#each actions as a, i (i)}
    <div class="action">
      <div class="line">
        <select
          class="pop-input small kind"
          value={a.type}
          onchange={(e) => update(i, newAction((e.currentTarget as HTMLSelectElement).value as DbAction['type']))}
          aria-label="Action"
        >
          <option value="set">Set a property</option>
          <option value="add">Add a row</option>
          {#if button || a.type === 'open'}<option value="open">Open the page</option>{/if}
          {#if button || a.type === 'url'}<option value="url">Open a link</option>{/if}
        </select>
        <button class="icon-btn" onclick={() => onchange(actions.filter((_, j) => j !== i))} aria-label="Remove action" data-tip="Remove"><Icon name="x" size={13} /></button>
      </div>

      {#if a.type === 'set'}
        {@const p = databases.prop(dbId, a.prop)}
        <div class="line">
          <select
            class="pop-input small"
            value={a.prop}
            onchange={(e) => {
              const id = (e.currentTarget as HTMLSelectElement).value;
              update(i, { type: 'set', prop: id, value: firstValue(databases.prop(dbId, id)) });
            }}
            aria-label="Property"
          >
            {#each settable as q (q.id)}<option value={q.id}>{q.name}</option>{/each}
          </select>
          {#if p}
            <span class="to">to</span>
            <select class="pop-input small" value={valueKey(p, a.value)} onchange={(e) => update(i, { ...a, value: fromKey(p, (e.currentTarget as HTMLSelectElement).value, a.value) })} aria-label="Value">
              {#if p.type === 'checkbox'}
                <option value="on">Checked</option>
                <option value="off">Unchecked</option>
                <option value="toggle">The opposite</option>
              {:else if p.type === 'date'}
                <option value="today:0">Today</option>
                <option value="today:1">Tomorrow</option>
                <option value="today:7">In a week</option>
                <option value="now">Now (with the time)</option>
                <option value="clear">Empty</option>
              {:else if p.type === 'select' || p.type === 'status' || p.type === 'multiSelect'}
                {#each options(p) as o (o.id)}<option value="o:{o.id}">{o.name}</option>{/each}
                <option value="clear">Empty</option>
              {:else if p.type === 'course'}
                {#each planner.courses as course (course.id)}<option value="o:{course.id}">{course.name || 'Untitled'}</option>{/each}
                <option value="clear">Empty</option>
              {:else if p.type === 'number'}
                <option value="add">Itself plus…</option>
                <option value="set">A number…</option>
                <option value="clear">Empty</option>
              {:else}
                <option value="set">Text…</option>
                <option value="clear">Empty</option>
              {/if}
            </select>
          {/if}
        </div>
        {#if p && p.type === 'number' && (a.value.mode === 'add' || a.value.mode === 'value')}
          <input
            class="pop-input small"
            type="number"
            value={a.value.mode === 'add' ? a.value.by : Number(a.value.value ?? 0)}
            oninput={(e) => {
              const n = Number((e.currentTarget as HTMLInputElement).value) || 0;
              update(i, { ...a, value: a.value.mode === 'add' ? { mode: 'add', by: n } : { mode: 'value', value: n } });
            }}
            aria-label="Number"
          />
        {:else if p && !['checkbox', 'date', 'select', 'status', 'multiSelect', 'course', 'number'].includes(p.type) && a.value.mode === 'value'}
          <input
            class="pop-input small"
            value={String(a.value.value ?? '')}
            placeholder="Text (use {'{'}Name{'}'} for this row's values)"
            oninput={(e) => update(i, { ...a, value: { mode: 'value', value: (e.currentTarget as HTMLInputElement).value } })}
            aria-label="Text"
          />
        {/if}
      {:else if a.type === 'add'}
        <div class="line">
          <span class="to">in</span>
          <select class="pop-input small" value={a.db} onchange={(e) => update(i, { ...a, db: (e.currentTarget as HTMLSelectElement).value, link: null })} aria-label="Database">
            {#each otherDbs as d (d.id)}<option value={d.id}>{d.id === dbId ? `${d.title || 'Untitled'} (this one)` : d.title || 'Untitled'}</option>{/each}
          </select>
        </div>
        <input class="pop-input small" value={a.title ?? ''} placeholder="Its title, e.g. Review of {'{'}Name{'}'}" oninput={(e) => update(i, { ...a, title: (e.currentTarget as HTMLInputElement).value })} aria-label="Title" />
        {#if linksIn(a.db).length}
          <div class="line">
            <span class="to">link</span>
            <select class="pop-input small" value={a.link ?? ''} onchange={(e) => update(i, { ...a, link: (e.currentTarget as HTMLSelectElement).value || null })} aria-label="Link back">
              <option value="">Don’t link it</option>
              {#each linksIn(a.db) as q (q.id)}<option value={q.id}>{q.config.parent ? 'As a sub-item of this row' : `To this row, through ${q.name}`}</option>{/each}
            </select>
          </div>
        {/if}
        {#if button}
          <label class="check"><input type="checkbox" checked={!!a.open} onchange={(e) => update(i, { ...a, open: (e.currentTarget as HTMLInputElement).checked })} /> Open it</label>
        {/if}
      {:else if a.type === 'url'}
        <input class="pop-input small" value={a.url} placeholder="https://… (use {'{'}URL{'}'} for a property)" oninput={(e) => update(i, { ...a, url: (e.currentTarget as HTMLInputElement).value })} aria-label="Link" />
      {/if}
    </div>
  {/each}
  <button class="pop-item add" onclick={() => onchange([...actions, newAction('set')])}><Icon name="plus" size={14} /><span class="grow">Add an action</span></button>
</div>

<style>
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .action {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    border-radius: var(--r-sm);
    background: var(--fill);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .line select {
    flex: 1;
    min-width: 0;
  }
  .kind {
    font-weight: var(--fw-600);
  }
  .to {
    flex: none;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .icon-btn {
    flex: none;
    width: 24px;
    height: 24px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-footnote);
    color: var(--text-2);
  }
  .add {
    color: var(--text-2);
  }
</style>
