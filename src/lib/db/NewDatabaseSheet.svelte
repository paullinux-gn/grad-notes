<script lang="ts">
  /**
   * Starting a database: an empty one, a ready-made template (tasks,
   * reading list, habit tracker…), or a spreadsheet file brought in as is.
   */
  import PageIcon from '../components/PageIcon.svelte';
  import { untrack } from 'svelte';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';
  import { databases } from '../databases.svelte';
  import { ui } from '../ui.svelte';
  import { TEMPLATES, type Template } from './templates';
  import { typeInfo } from './schema';

  let { parentId: parentIn, onCreated: createdIn }: { parentId: string | null; onCreated?: (id: string) => void } = $props();
  // Read once: closing the sheet clears what the caller passed.
  const parentId = untrack(() => parentIn);
  const onCreated = untrack(() => createdIn);

  let busy = $state(false);
  let file: HTMLInputElement;

  function close() {
    ui.newDatabase = null;
  }

  async function choose(t: Template) {
    if (busy) return;
    busy = true;
    const page = await databases.create({ template: t, parentId, open: !onCreated });
    busy = false;
    if (!page) return;
    close();
    onCreated?.(page.id);
  }

  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = true;
    const page = await databases.importText(f.name.replace(/\.[^.]+$/, ''), await f.text(), { parentId, open: !onCreated });
    busy = false;
    if (!page) return;
    close();
    onCreated?.(page.id);
  }
</script>

<Modal onclose={close} width={780} label="New database" top="7vh">
  <div class="modal-head">
    <h2>New database</h2>
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
  </div>
  <div class="modal-body">
    <p class="lede">Rows you can sort, filter and see as a table, board, gallery, calendar or chart. Every row is a page too, with room for notes.</p>
    <div class="grid">
      {#each TEMPLATES as t (t.key)}
        <button class="tile" onclick={() => choose(t)} disabled={busy}>
          <span class="icon"><PageIcon icon={t.icon} /></span>
          <span class="name">{t.name}</span>
          <span class="desc">{t.description}</span>
          <span class="props">
            {#each t.properties.filter((p) => p.type !== 'title').slice(0, 5) as p (p.id)}
              <span class="prop"><Icon name={typeInfo(p.type).icon} size={11} /> {p.name}</span>
            {/each}
          </span>
        </button>
      {/each}
      <button class="tile import" onclick={() => file.click()} disabled={busy}>
        <span class="icon"><Icon name="upload" size={22} /></span>
        <span class="name">Import a spreadsheet</span>
        <span class="desc">A CSV from Excel, Google Sheets or Notion. Column types are worked out for you.</span>
      </button>
    </div>
    <input bind:this={file} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onchange={importFile} />
  </div>
  <div class="modal-foot">
    <span>Tip: paste rows from a spreadsheet straight into any table.</span>
  </div>
</Modal>

<style>
  .lede {
    margin: 0 0 16px;
    font-size: var(--fs-body-ui);
    line-height: 1.5;
    color: var(--text-2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-height: 132px;
    padding: 14px;
    border-radius: var(--r-lg);
    background: var(--bg-grouped);
    text-align: left;
    box-shadow: inset 0 0 0 0.5px var(--hairline);
    transition:
      background-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .tile:hover {
    background: var(--fill-2);
  }
  .tile:active {
    transform: scale(0.985);
  }
  .tile:disabled {
    opacity: 0.6;
  }
  .icon {
    display: grid;
    place-items: center;
    height: 30px;
    font-size: 24px;
    line-height: 1;
    color: var(--text-2);
  }
  .name {
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-600);
  }
  .desc {
    font-size: var(--fs-footnote);
    line-height: 1.4;
    color: var(--text-2);
  }
  .props {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: auto;
    padding-top: 6px;
  }
  .prop {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--fill);
    font-size: var(--fs-caption);
    color: var(--text-2);
  }
  .import {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--separator-strong);
  }
</style>
