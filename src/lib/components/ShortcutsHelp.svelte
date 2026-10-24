<script lang="ts">
  /**
   * Every keyboard shortcut on one sheet (Ctrl+/). The app's own shortcuts
   * show the keys the user picked; "Change shortcuts" opens Settings there.
   */
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import { EDITOR_KEYS, MARKDOWN_KEYS, SHORTCUTS, comboKeys, shortcuts } from '../shortcuts.svelte';
  import { ui } from '../ui.svelte';

  const groups = (['General', 'Go To', 'Calendar'] as const).map((g) => ({ name: g, items: SHORTCUTS.filter((s) => s.group === g) }));
  const TABLE_KEYS: { label: string; keys: string[][] }[] = [
    { label: 'Save the cell', keys: [['Enter']] },
    { label: 'Next cell', keys: [['Tab']] },
    { label: 'New line in text', keys: [['Shift', 'Enter']] },
    { label: 'Cancel the edit', keys: [['Esc']] },
    { label: 'Undo a change', keys: [['Ctrl', 'Z']] },
  ];

  const close = () => (ui.shortcutsHelp = false);

  function customize() {
    close();
    ui.settingsSection = 'keyboard';
    ui.settingsOpen = true;
  }
</script>

<Modal onclose={close} label="Keyboard shortcuts" width={720} top="8vh">
  <header class="modal-head">
    <h2>Keyboard Shortcuts</h2>
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="modal-body fade">
    <div class="cols">
      <div class="col">
        {#each groups as g (g.name)}
          <h3 class="group-title">{g.name}</h3>
          <div class="list">
            {#each g.items as s (s.id)}
              {@const combos = shortcuts.combos(s.id)}
              <div class="row">
                <span class="what">{s.label}</span>
                {#if combos.length}
                  <span class="keys">
                    {#each combos.slice(0, 1) as combo (combo)}
                      {#each comboKeys(combo) as k}<kbd>{k}</kbd>{/each}
                    {/each}
                  </span>
                {:else}
                  <span class="none">None</span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>

      <div class="col">
        <h3 class="group-title">In a Page</h3>
        <div class="list">
          {#each EDITOR_KEYS as s (s.label)}
            <div class="row">
              <span class="what">{s.label}</span>
              <span class="keys">
                {#each s.keys as combo, i (i)}
                  {#if i > 0}<span class="or">·</span>{/if}
                  {#each combo as k}<kbd>{k}</kbd>{/each}
                {/each}
              </span>
            </div>
          {/each}
        </div>

        <h3 class="group-title">Type at the Start of a Line</h3>
        <div class="list">
          {#each MARKDOWN_KEYS as m (m.label)}
            <div class="row">
              <span class="what">{m.label}</span>
              <span class="keys"><kbd class="mono">{m.type}</kbd>{#if !m.now}<span class="or">then</span><kbd>Space</kbd>{/if}</span>
            </div>
          {/each}
        </div>

        <h3 class="group-title">In a Database Table</h3>
        <div class="list">
          {#each TABLE_KEYS as s (s.label)}
            <div class="row">
              <span class="what">{s.label}</span>
              <span class="keys">{#each s.keys as combo}{#each combo as k}<kbd>{k}</kbd>{/each}{/each}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="foot">
      <span>Open this sheet any time with <kbd>Ctrl</kbd><kbd>/</kbd></span>
      <button class="btn small raised" onclick={customize}><Icon name="settings" size={13} /> Change Shortcuts</button>
    </div>
  </div>
</Modal>

<style>
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 28px;
  }
  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
    padding: 0 4px;
    border-bottom: 1px solid var(--separator);
  }
  .row:last-child {
    border-bottom: none;
  }
  .what {
    min-width: 0;
    font-size: var(--fs-ui);
    color: var(--text);
  }
  .keys {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }
  kbd {
    min-width: 20px;
    justify-content: center;
    background: var(--raised);
    box-shadow:
      0 0 0 0.5px var(--hairline),
      0 1px 0 var(--hairline);
    color: var(--text-2);
  }
  kbd.mono {
    font-family: var(--font-mono);
  }
  .or,
  .none {
    font-size: var(--fs-caption);
    color: var(--text-3);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
    padding: 0 4px;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .foot kbd {
    margin: 0 1px;
  }
</style>
