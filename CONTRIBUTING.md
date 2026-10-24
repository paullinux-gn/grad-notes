# Contributing to Grad Notes

Thanks for helping. Bug reports, performance measurements, fixes, testing in
other languages and ideas are all welcome. You can also chat with us on
[Discord](https://discord.gg/JEaUHwz5bP).

## Before you start

- **Small fixes:** go ahead and open a pull request.
- **Bigger changes** (a new feature, a new dependency, changes to how data is
  stored): open an issue first, so we can agree on the approach before you
  spend time on it.
- **Security problems:** please don't open a public issue. Report them
  privately through GitHub's "Report a vulnerability" button on the Security
  tab.

## Setting up

See [Develop](README.md#develop) in the README. In short:

```bash
npm install
npm run app        # the desktop app with hot reload
npm run dev        # the interface in a browser, with a fake backend
```

## Before opening a pull request

Run the checks:

```bash
npm run check                  # type-check the interface
npm run e2e                    # interface tests
cd src-tauri && cargo test     # storage tests
```

The interface tests (`tests/e2e/`) open the app in Chromium against the fake
backend and use it like a person would: typing, clicking, dragging. The first
time, get the browser with `npx playwright install chromium`. To watch one
run step by step, use `npm run e2e -- --ui`. If you change how something
looks or behaves, add or update a test there.

If your change is about speed, include before and after numbers, and say how
you measured them (your machine, and which workspace). The heavy workspaces
and scripts the README's numbers come from are in the repo:

```bash
cd src-tauri && cargo test --release stress -- --ignored --nocapture   # storage benchmarks
```

`bench/` has scripts that drive the release build: start-up time, views,
big pages, a 49,000-row table and memory.

## Pull requests

- **One change per pull request.** Small, focused pull requests get reviewed
  and merged fastest.
- **Say what it fixes and how you checked it.** For changes you can see,
  add a screenshot or a short clip.
- **Match the code around it:** its naming, its comments (they explain *why*,
  not *what*), and its style.
- **Keep it light.** Grad Notes is meant to start fast and use little
  memory, so please discuss new dependencies first.
- **Data is precious.** Changes to the database schema need a migration and
  a test, and must never lose or rewrite what people already have.
- **AI-assisted contributions are fine,** as long as you understand the code,
  have tested it, and can answer questions about it.

## Contributor License Agreement

Before your first pull request can be merged, you'll be asked to sign the
[Contributor License Agreement](CLA.md) (once, through a bot on the pull
request). You keep the copyright to your work; the agreement lets the project
also offer it under other terms, for example in app stores whose rules don't
fit the AGPL, while promising it stays available as open source.

## Licence and name

Contributions are released under the project's
[GNU AGPL v3.0 or later](LICENSE). The licence covers the code, not the
Grad Notes name or logo: forks and redistributed versions need their own
name and logo.
