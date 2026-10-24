<script lang="ts">
  import PageIcon from './PageIcon.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import FileTile from '../ui/FileTile.svelte';
  import SearchField from '../ui/SearchField.svelte';
  import { TABLE_LABELS, deleteItem, emptyTrash, restoreItem, trashItems } from '../trash.svelte';
  import { ui } from '../ui.svelte';
  import { relativeTime } from '../time';
  import { Progressive } from '../progressive.svelte';
  import type { TrashTable } from '../types';

  let filter = $state('');
  let kind = $state<TrashTable | 'all'>('all');

  const all = $derived(trashItems());
  const counts = $derived(
    all.reduce<Record<string, number>>((c, it) => ((c[it.table] = (c[it.table] ?? 0) + 1), c), {}),
  );
  const items = $derived(
    all.filter(
      (it) => (kind === 'all' || it.table === kind) && it.title.toLowerCase().includes(filter.trim().toLowerCase()),
    ),
  );
  const tables: TrashTable[] = ['pages', 'assignments', 'events', 'files'];

  // A big trash renders as you scroll; a new filter starts at the top.
  const lazy = new Progressive();
  $effect(() => {
    void [filter, kind];
    lazy.reset();
  });
  const shown = $derived(items.length > lazy.limit ? items.slice(0, lazy.limit) : items);

  // Don't strand the user on an empty filter after restoring its last item.
  $effect(() => {
    if (kind !== 'all' && !counts[kind]) kind = 'all';
  });
</script>

<Modal onclose={() => (ui.trashOpen = false)} label="Trash">
  <header class="modal-head">
    <h2>Trash</h2>
    <button class="icon-btn" onclick={() => (ui.trashOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="modal-body fade">
    {#if all.length}
      <div class="tools">
        <div class="kinds" role="radiogroup" aria-label="Kind">
          <button class="chip" class:on={kind === 'all'} role="radio" aria-checked={kind === 'all'} onclick={() => (kind = 'all')}>
            All <span class="n">{all.length}</span>
          </button>
          {#each tables as t (t)}
            {#if counts[t]}
              <button class="chip" class:on={kind === t} role="radio" aria-checked={kind === t} onclick={() => (kind = t)}>
                {TABLE_LABELS[t].many} <span class="n">{counts[t]}</span>
              </button>
            {/if}
          {/each}
        </div>
        <SearchField bind:value={filter} placeholder="Filter" width={180} small />
      </div>
    {/if}

    {#if items.length}
      <div class="group">
        {#each shown as it (`${it.table}:${it.id}`)}
          <div class="group-row item">
            <span class="icon" style:color={it.color}>
              {#if it.file}<FileTile file={it.file} size={28} />
              {:else if it.emoji}<span class="emoji"><PageIcon icon={it.emoji} /></span>
              {:else}<Icon name={it.icon} size={17} />{/if}
            </span>
            <div class="main">
              <span class="title">{it.title}</span>
              <span class="meta">
                {TABLE_LABELS[it.table].one} · Deleted {relativeTime(it.deletedAt)}{it.origin ? ` from ${it.origin}` : ''}
              </span>
            </div>
            <div class="actions">
              <button class="btn small raised" onclick={() => restoreItem(it)}>Restore</button>
              <button class="icon-btn" onclick={() => deleteItem(it)} data-tip="Delete permanently" aria-label="Delete permanently"><Icon name="trash" /></button>
            </div>
          </div>
        {/each}
      </div>
      {#if shown.length < items.length}<div {@attach lazy.more}></div>{/if}
    {:else}
      <EmptyState
        icon="trash"
        title={filter ? 'No matches' : 'Trash is empty'}
        text={filter ? 'Try a different name.' : 'Pages, assignments, events and files you delete stay here until you remove them for good.'}
      />
    {/if}
  </div>

  {#if all.length}
    <footer class="modal-foot">
      <span>Restoring a page brings back the sub-pages deleted with it.</span>
      <button class="btn small" onclick={() => emptyTrash(all.length)}>Empty Trash</button>
    </footer>
  {/if}
</Modal>

<style>
  .tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 4px 0 16px;
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .n {
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }
  .item {
    gap: 12px;
    min-height: 56px;
  }
  .item + :global(.item)::before {
    left: 56px;
  }
  .icon {
    flex: none;
    width: 28px;
    display: grid;
    place-items: center;
    color: var(--text-3);
  }
  .emoji {
    font-size: 18px;
    line-height: 1;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .title {
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .item:hover .actions,
  .actions:focus-within {
    opacity: 1;
  }
</style>
