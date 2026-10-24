<script lang="ts">
  /**
   * What a new row starts from: an empty row or one of the database's
   * templates. Click one to add a row from it; each template can be edited
   * (it's a page like any row), made the default, copied or deleted.
   */
  import PageIcon from '../components/PageIcon.svelte';
  import Icon from '../components/Icon.svelte';
  import { databases } from '../databases.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import type { DbRow, DbView } from '../types';

  let { dbId, view, onpick, onclose }: { dbId: string; view: DbView; onpick: (templateId: string) => void; onclose: () => void } = $props();

  const templates = $derived(databases.templatesOf(dbId));
  const current = $derived(view.config.template && templates.some((t) => t.id === view.config.template) ? view.config.template : '');

  function more(e: MouseEvent, t: DbRow | null) {
    e.stopPropagation();
    const id = t?.id ?? '';
    ui.openMenuAt(e.currentTarget as Element, [
      { label: 'Default for this view', icon: 'check', checked: current === id, action: () => databases.setDefaultTemplate(dbId, id, view.id) },
      { label: 'Default for every view', icon: 'layers', action: () => databases.setDefaultTemplate(dbId, id, null) },
      ...(t
        ? [
            { separator: true as const },
            {
              label: 'Edit',
              icon: 'pencil',
              action: () => {
                onclose();
                store.open(t.id);
              },
            },
            { label: 'Duplicate', icon: 'copy', action: () => void databases.duplicateRows([t.id]) },
            { label: 'Delete', icon: 'trash', danger: true, action: () => void databases.deleteRows([t.id]) },
          ]
        : []),
    ]);
  }
</script>

<div class="tp">
  <div class="pop-head">New row from</div>
  <div class="opt-row">
    <button class="pop-item" onclick={() => onpick('')}>
      <Icon name="page" size={14} />
      <span class="grow">Empty row</span>
      {#if current === ''}<span class="badge">Default</span>{/if}
    </button>
    <button class="more" onclick={(e) => more(e, null)} aria-label="Options for an empty row" data-tip="Make the default"><Icon name="more" size={14} /></button>
  </div>
  {#each templates as t (t.id)}
    {@const page = store.byId.get(t.id)}
    <div class="opt-row">
      <button class="pop-item" onclick={() => onpick(t.id)}>
        {#if page?.icon}<span class="emoji"><PageIcon icon={page.icon} /></span>{:else}<Icon name="template" size={14} />{/if}
        <span class="grow name">{page?.title || 'Untitled template'}</span>
        {#if current === t.id}<span class="badge">Default</span>{/if}
      </button>
      <button
        class="more"
        onclick={() => {
          onclose();
          store.open(t.id);
        }}
        aria-label="Edit {page?.title || 'template'}"
        data-tip="Edit"><Icon name="pencil" size={13} /></button
      >
      <button class="more" onclick={(e) => more(e, t)} aria-label="More for {page?.title || 'template'}" data-tip="More"><Icon name="more" size={14} /></button>
    </div>
  {/each}
  <div class="pop-sep"></div>
  <button
    class="pop-item"
    onclick={() => {
      onclose();
      void databases.newTemplate(dbId);
    }}
  >
    <Icon name="plus" size={14} /><span class="grow">New template</span>
  </button>
  {#if !templates.length}
    <p class="tip">A template is a row to start from: its values and its page (a checklist, headings, notes) are copied into each new row.</p>
  {/if}
</div>

<style>
  .tp {
    display: flex;
    flex-direction: column;
  }
  .opt-row {
    display: flex;
    align-items: center;
    border-radius: var(--r-sm);
  }
  .opt-row:hover {
    background: var(--fill);
  }
  .opt-row .pop-item {
    flex: 1;
    min-width: 0;
    background: none;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .emoji {
    flex: none;
    width: 16px;
    text-align: center;
    font-size: 14px;
  }
  .badge {
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--fill-2);
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    color: var(--text-2);
  }
  .more {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    margin-right: 2px;
    border-radius: var(--r-xs);
    color: var(--text-3);
    opacity: 0;
  }
  .opt-row:hover .more {
    opacity: 1;
  }
  .more:hover {
    background: var(--fill-3);
    color: var(--text);
  }
  .tip {
    margin: 6px 8px 4px;
    font-size: var(--fs-footnote);
    line-height: 1.4;
    color: var(--text-3);
  }
</style>
