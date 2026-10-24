<script lang="ts">
  /**
   * How a view looks: its layout, grouping, which properties show, card
   * size and cover, the calendar's date, the chart's numbers; plus export,
   * duplicate and delete.
   */
  import Icon from '../components/Icon.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Switch from '../ui/Switch.svelte';
  import { databases, VIEW_NAMES } from '../databases.svelte';
  import { canGroup } from './query';
  import { typeInfo } from './schema';
  import { store } from '../store.svelte';
  import type { DbView, ViewType } from '../types';

  let { dbId, view, onclose, onswitch }: { dbId: string; view: DbView; onclose: () => void; onswitch: (viewId: string) => void } = $props();

  const LAYOUTS: { type: ViewType; icon: string; hint: string }[] = [
    { type: 'table', icon: 'table', hint: 'Rows and columns' },
    { type: 'board', icon: 'board', hint: 'Cards in columns' },
    { type: 'gallery', icon: 'grid', hint: 'Cards in a grid' },
    { type: 'list', icon: 'list', hint: 'A tidy list' },
    { type: 'calendar', icon: 'calendar', hint: 'By date' },
    { type: 'chart', icon: 'chart', hint: 'Totals at a glance' },
    { type: 'timeline', icon: 'timeline', hint: 'Dates as bars' },
    { type: 'form', icon: 'form', hint: 'Add rows by filling in' },
  ];

  const allProps = $derived(databases.props(dbId));
  const subs = $derived(databases.subItems(dbId));
  const templates = $derived(databases.templatesOf(dbId));
  const c = $derived(view.config);
  const cards = $derived(view.type === 'board' || view.type === 'gallery' || view.type === 'list');
  const groupable = $derived(allProps.filter(canGroup));
  const dates = $derived(allProps.filter((p) => p.type === 'date' || p.type === 'created' || p.type === 'edited'));
  const numbers = $derived(allProps.filter((p) => p.type === 'number' || ((p.type === 'formula' || p.type === 'rollup') && databases.kind(dbId, p) === 'number')));

  function set(patch: Partial<DbView['config']>) {
    databases.updateView(dbId, view.id, patch);
  }

  /** Whether a property shows: tables hide some, cards show some. */
  function visible(id: string): boolean {
    if (view.type === 'table') return !(c.hidden ?? []).includes(id);
    return c.shown ? c.shown.includes(id) : false;
  }

  function toggle(id: string) {
    if (view.type === 'table') {
      const hidden = c.hidden ?? [];
      set({ hidden: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });
    } else {
      const shown = c.shown ?? [];
      set({ shown: shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id] });
    }
  }
</script>

<div class="settings">
  <input class="pop-input name" value={view.name} oninput={(e) => databases.renameView(dbId, view.id, (e.currentTarget as HTMLInputElement).value)} aria-label="View name" />
  <div class="pop-head">Layout</div>
  <div class="layouts">
    {#each LAYOUTS as l (l.type)}
      <button class="layout" class:on={view.type === l.type} onclick={() => void databases.changeViewType(dbId, view.id, l.type)} data-tip={l.hint}>
        <Icon name={l.icon} size={18} />
        <span>{VIEW_NAMES[l.type]}</span>
      </button>
    {/each}
  </div>

  {#if view.type === 'table' || view.type === 'board' || view.type === 'list'}
    <div class="pop-row">
      <span class="label">{view.type === 'board' ? 'Columns from' : 'Group by'}</span>
      <select class="pop-input small" value={c.group ?? ''} onchange={(e) => set({ group: (e.currentTarget as HTMLSelectElement).value || null })}>
        {#if view.type !== 'board'}<option value="">None</option>{/if}
        {#each groupable as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    {#if c.group}
      <div class="pop-row">
        <span class="label">Hide empty groups</span>
        <Switch on={!!c.hideEmptyGroups} label="Hide empty groups" onchange={() => set({ hideEmptyGroups: !c.hideEmptyGroups })} />
      </div>
    {/if}
  {/if}

  {#if view.type === 'calendar' || view.type === 'timeline'}
    <div class="pop-row">
      <span class="label">{view.type === 'timeline' ? 'Starts on' : 'Show by'}</span>
      <select class="pop-input small" value={c.dateProp ?? ''} onchange={(e) => set({ dateProp: (e.currentTarget as HTMLSelectElement).value })}>
        {#each dates as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
  {/if}
  {#if view.type === 'timeline'}
    <div class="pop-row">
      <span class="label">Ends on</span>
      <select class="pop-input small" value={c.endProp ?? ''} onchange={(e) => set({ endProp: (e.currentTarget as HTMLSelectElement).value || null })}>
        <option value="">Its own end date</option>
        {#each dates.filter((p) => p.id !== c.dateProp) as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    <div class="pop-row">
      <span class="label">List of titles</span>
      <Switch on={c.showTable !== false} label="List of titles" onchange={() => set({ showTable: c.showTable === false })} />
    </div>
  {/if}

  {#if view.type === 'table' || view.type === 'list'}
    <div class="pop-row">
      <span class="label">Sub-items</span>
      {#if subs}
        <select class="pop-input small" value={c.subItems ?? 'nested'} onchange={(e) => set({ subItems: (e.currentTarget as HTMLSelectElement).value as 'nested' | 'flat' })}>
          <option value="nested">Under their parent</option>
          <option value="flat">As plain rows</option>
        </select>
      {:else}
        <button class="btn small raised" onclick={() => void databases.enableSubItems(dbId)}><Icon name="list-tree" size={13} /> Turn on</button>
      {/if}
    </div>
    {#if subs}
      <button class="pop-item" onclick={() => void databases.disableSubItems(dbId)}><Icon name="x" size={14} /><span class="grow">Turn off sub-items</span></button>
    {/if}
  {/if}

  {#if view.type !== 'chart' && templates.length}
    <div class="pop-row">
      <span class="label">New rows start from</span>
      <select class="pop-input small" value={templates.some((t) => t.id === c.template) ? c.template : ''} onchange={(e) => set({ template: (e.currentTarget as HTMLSelectElement).value })}>
        <option value="">An empty row</option>
        {#each templates as t (t.id)}<option value={t.id}>{store.byId.get(t.id)?.title || 'Untitled template'}</option>{/each}
      </select>
    </div>
  {/if}

  {#if view.type === 'chart' && c.chart}
    {@const chart = c.chart}
    <div class="pop-row">
      <span class="label">Chart</span>
      <Segmented
        label="Chart type"
        iconOnly
        value={chart.kind}
        options={[
          { value: 'bar', label: 'Bars', icon: 'chart' },
          { value: 'donut', label: 'Donut', icon: 'donut' },
          { value: 'line', label: 'Line', icon: 'line-chart' },
        ]}
        onchange={(k) => set({ chart: { ...chart, kind: k as 'bar' | 'donut' | 'line' } })}
      />
    </div>
    <div class="pop-row">
      <span class="label">{chart.kind === 'donut' ? 'Slices' : 'Along the bottom'}</span>
      <select class="pop-input small" value={chart.x} onchange={(e) => set({ chart: { ...chart, x: (e.currentTarget as HTMLSelectElement).value } })}>
        {#each [...groupable, ...dates.filter((d) => !groupable.includes(d))] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    <div class="pop-row">
      <span class="label">Measure</span>
      <select
        class="pop-input small"
        value={chart.agg === 'count' ? 'count' : `${chart.agg}:${chart.y}`}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          if (v === 'count') set({ chart: { ...chart, agg: 'count', y: undefined } });
          else {
            const [agg, y] = v.split(':');
            set({ chart: { ...chart, agg: agg as 'sum' | 'average', y } });
          }
        }}
      >
        <option value="count">Count of rows</option>
        {#each numbers as p (p.id)}
          <option value="sum:{p.id}">Sum of {p.name}</option>
          <option value="average:{p.id}">Average of {p.name}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if view.type === 'gallery' || view.type === 'board'}
    <div class="pop-row">
      <span class="label">Card size</span>
      <Segmented
        label="Card size"
        value={c.cardSize ?? 'medium'}
        options={[
          { value: 'small', label: 'S' },
          { value: 'medium', label: 'M' },
          { value: 'large', label: 'L' },
        ]}
        onchange={(v) => set({ cardSize: v as 'small' | 'medium' | 'large' })}
      />
    </div>
  {/if}
  {#if view.type === 'gallery' || view.type === 'board'}
    <div class="pop-row">
      <span class="label">Card picture</span>
      <select class="pop-input small" value={c.cover ?? (view.type === 'gallery' ? 'page' : 'none')} onchange={(e) => set({ cover: (e.currentTarget as HTMLSelectElement).value })}>
        <option value="none">None</option>
        <option value="page">First image in the page</option>
        {#each allProps.filter((p) => p.type === 'files') as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
  {/if}
  {#if view.type === 'table'}
    <div class="pop-row">
      <span class="label">Wrap long text</span>
      <Switch on={!!c.wrap} label="Wrap long text" onchange={() => set({ wrap: !c.wrap })} />
    </div>
  {/if}

  {#if view.type !== 'chart' && view.type !== 'form' && view.type !== 'timeline'}
    <div class="pop-head">
      <span>{view.type === 'table' ? 'Columns' : 'On each card'}</span>
      {#if cards && c.shown}<button class="link" onclick={() => set({ shown: undefined })}>Automatic</button>{/if}
    </div>
    {#if cards && !c.shown}<p class="note">Showing whatever each row has filled in. Pick properties to choose exactly.</p>{/if}
    {#each allProps as p (p.id)}
      {#if p.type !== 'title'}
        <button class="pop-item" onclick={() => toggle(p.id)}>
          <Icon name={typeInfo(p.type).icon} size={14} />
          <span class="grow">{p.name}</span>
          <Icon name={visible(p.id) ? 'eye' : 'eye-off'} size={14} />
        </button>
      {/if}
    {/each}
  {/if}

  <div class="pop-sep"></div>
  <button
    class="pop-item"
    onclick={() => {
      void databases.exportCsv(dbId, view.id);
      onclose();
    }}
  >
    <Icon name="download" size={15} /><span class="grow">Export as CSV</span><span class="hint">opens in Excel</span>
  </button>
  <button
    class="pop-item"
    onclick={async () => {
      const v = await databases.duplicateView(dbId, view.id);
      if (v) onswitch(v.id);
      onclose();
    }}
  >
    <Icon name="copy" size={15} /><span class="grow">Duplicate view</span>
  </button>
  <button
    class="pop-item danger"
    disabled={databases.views(dbId).length < 2}
    onclick={() => {
      void databases.deleteView(dbId, view.id);
      onclose();
    }}
  >
    <Icon name="trash" size={15} /><span class="grow">Delete view</span>
  </button>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
  }
  .name {
    margin-bottom: 2px;
  }
  .layouts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 0 4px 6px;
  }
  .layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px 6px;
    border-radius: var(--r-sm);
    font-size: var(--fs-footnote);
    color: var(--text-2);
    box-shadow: inset 0 0 0 1px var(--hairline);
    transition:
      background-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .layout:hover {
    background: var(--fill);
  }
  .layout.on {
    color: var(--text);
    background: var(--fill);
    box-shadow: inset 0 0 0 1.5px var(--accent);
    font-weight: var(--fw-550);
  }
  .pop-input.small {
    width: 150px;
    height: 26px;
    flex: none;
    font-size: var(--fs-ui);
  }
  .note {
    margin: 0 8px 4px;
    font-size: var(--fs-footnote);
    line-height: 1.4;
    color: var(--text-3);
  }
  .link {
    font-size: var(--fs-caption);
    color: var(--text-2);
  }
  .link:hover {
    color: var(--text);
  }
</style>
