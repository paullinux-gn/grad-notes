<script lang="ts">
  /** Type something, pick what it is, press Enter. Used on Home and in the capture sheet. */
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from './Segmented.svelte';
  import { capture, type CaptureKind } from '../capture';
  import { clock } from '../clock.svelte';

  let {
    text = $bindable(''),
    autofocus = false,
    inline = false,
    onsaved,
  }: { text?: string; autofocus?: boolean; inline?: boolean; onsaved?: () => void } = $props();

  let kind = $state<CaptureKind>('todo');
  let date = $state('');
  let time = $state('');
  let saving = $state(false);
  let input = $state<HTMLTextAreaElement>();

  const kinds: { value: CaptureKind; label: string; icon: string }[] = [
    { value: 'todo', label: 'To-do', icon: 'todo' },
    { value: 'note', label: 'Note', icon: 'note' },
    { value: 'assignment', label: 'Assignment', icon: 'assignment' },
    { value: 'event', label: 'Event', icon: 'calendar' },
  ];
  const placeholders: Record<CaptureKind, string> = {
    todo: 'Something to do…',
    note: 'A thought — the first line becomes the title',
    assignment: 'What’s due?',
    event: 'What’s happening?',
  };

  onMount(() => {
    if (autofocus) input?.focus();
  });

  // Grow with the text, up to a few lines.
  $effect(() => {
    void text;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  });

  export async function save() {
    if (saving || !text.trim()) return;
    saving = true;
    const ok = await capture(kind, text, { date: date || (kind === 'event' ? clock.today : ''), time });
    saving = false;
    if (ok) {
      text = '';
      date = '';
      time = '';
      onsaved?.();
      input?.focus();
    }
  }

  function onKey(e: KeyboardEvent) {
    // Notes can span lines; everything else saves on Enter.
    if (e.key === 'Enter' && !(e.shiftKey && kind === 'note')) {
      e.preventDefault();
      void save();
    }
  }
</script>

<div class="capture" class:inline>
  <div class="top">
    <Segmented
      options={kinds}
      value={kind}
      onchange={(v) => {
        kind = v;
        // Keep typing where you were after picking a type.
        input?.focus();
      }}
      label="Capture as"
    />
    {#if kind === 'assignment' || kind === 'event'}
      <div class="when">
        <label class="field date" data-tip={kind === 'event' ? 'Date (today if empty)' : 'Due date'}>
          <input type="date" bind:value={date} aria-label="Date" />
        </label>
        <label class="field time" data-tip="Time (optional)">
          <input type="time" bind:value={time} aria-label="Time" />
        </label>
      </div>
    {/if}
  </div>
  <div class="entry">
    <textarea bind:this={input} bind:value={text} rows="1" placeholder={placeholders[kind]} spellcheck="true" onkeydown={onKey}></textarea>
    {#if inline}
      <button class="btn small primary" onclick={save} disabled={!text.trim() || saving}>Save</button>
    {/if}
  </div>
  {#if inline}
    <p class="hint">
      <Icon name="bolt" size={12} stroke={2} />
      Press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd> anywhere to capture without opening the app first.
    </p>
  {/if}
</div>

<style>
  .capture {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .when {
    display: flex;
    gap: 6px;
  }
  .field.date {
    width: 148px;
  }
  .field.time {
    width: 120px;
  }
  .entry {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  textarea {
    flex: 1;
    min-width: 0;
    /* 12 + 20 + 12 = 44px for one line, matching the Save button. */
    min-height: 44px;
    padding: 12px;
    border: none;
    border-radius: var(--r-md);
    background: var(--raised);
    box-shadow: 0 0 0 1px var(--hairline);
    font-size: var(--fs-callout);
    line-height: 20px;
    resize: none;
    transition: box-shadow var(--dur-fast) var(--ease);
  }
  textarea:focus {
    box-shadow: 0 0 0 1.5px var(--focus);
  }
  .inline .entry .btn {
    height: 44px;
    border-radius: var(--r-md);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .hint kbd + kbd {
    margin-left: -3px;
  }
</style>
