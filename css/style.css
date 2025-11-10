:root {
  --bg: #edf0f6;
  --sidebar: #1b2430;
  --card: #fff;
  --text: #111;
  --muted: #6a6a6a;
  --accent: #2b6cb0;
  --danger: #e53e3e;
  --border: #dcdfe5;
}

[data-theme="dark"] {
  --bg: #15171a;
  --sidebar: #0f1113;
  --card: #1e2024;
  --text: #f9fafb;
  --muted: #9ca3af;
  --accent: #60a5fa;
  --border: #2d2f32;
}

* {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

/* LOGIN */
.login-screen {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top, #e2e8f0, #edf0f6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  background: #fff;
  width: 380px;
  border-radius: 14px;
  padding: 1.8rem 1.6rem 2rem;
  box-shadow: 0 18px 50px rgba(0,0,0,0.1);
}

.login-logo-row {
  display: flex;
  align-items: center;
  gap: .6rem;
  margin-bottom: 1rem;
}

.login-title {
  margin: 0 0 .7rem;
  font-size: 1.1rem;
}

.login-hint {
  margin: 0 0 1rem;
  font-size: .78rem;
}

.login-label {
  display: block;
  margin-top: .5rem;
  font-size: .75rem;
}

.login-input {
  width: 100%;
  padding: .45rem .5rem;
  border: 1px solid #ccd0d7;
  border-radius: .4rem;
  margin-top: .3rem;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: .4rem;
  padding: .45rem .9rem;
  margin-top: 1rem;
  cursor: pointer;
}

.btn-primary:hover {
  filter: brightness(.97);
}

.login-error {
  color: #b91c1c;
  font-size: .75rem;
  margin-top: .5rem;
}

.hidden {
  display: none !important;
}

/* APP */
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  background: var(--sidebar);
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 1rem .8rem;
  gap: 1rem;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: .6rem;
}

.side-logo {
  width: 36px;
  height: 36px;
  background: #60a5fa;
  border-radius: .7rem;
  display: grid;
  place-items: center;
  font-weight: 700;
}
.side-logo.small {
  width: 30px;
  height: 30px;
}

.side-name {
  font-size: .8rem;
}
.side-sub {
  font-size: .7rem;
  opacity: .7;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: .3rem;
}

.nav-link {
  background: transparent;
  border: none;
  color: #fff;
  text-align: left;
  padding: .4rem .4rem;
  border-radius: .4rem;
  cursor: pointer;
  font-size: .78rem;
}
.nav-link.active, .nav-link:hover {
  background: rgba(255,255,255,.12);
}

.btn-ghost {
  margin-top: auto;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.03);
  color: #fff;
  border-radius: .4rem;
  padding: .4rem .5rem;
  cursor: pointer;
  font-size: .75rem;
}

.main {
  flex: 1;
  padding: 1.3rem 1.4rem 2.5rem;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: .7rem;
  padding: .8rem .9rem 1rem;
  flex: 1;
  min-width: 210px;
}

.card.small {
  max-width: 220px;
}

.muted {
  font-size: .7rem;
  color: var(--muted);
}

.table-wrapper {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: .6rem;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .75rem;
}

.data-table thead {
  background: rgba(0,0,0,.03);
}

.data-table th,
.data-table td {
  padding: .45rem .5rem;
  border-bottom: 1px solid var(--border);
}

.status-pill {
  display: inline-block;
  padding: .15rem .45rem;
  border-radius: 999px;
  font-size: .65rem;
}
.status-unassigned { background: #fee2e2; color: #991b1b; }
.status-staging { background: #e0f2fe; color: #075985; }
.status-staged { background: #dcfce7; color: #166534; }

.metric {
  font-size: 1.3rem;
  font-weight: 600;
}

/* calendar */
.calendar-wrapper {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: .7rem;
  padding: .8rem .9rem 1rem;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(70px, 1fr));
  gap: .5rem;
  margin-top: .7rem;
}

.calendar-day {
  background: rgba(99,102,241,.05);
  border: 1px solid rgba(99,102,241,.07);
  border-radius: .5rem;
  text-align: center;
  padding: .35rem .2rem .5rem;
  cursor: pointer;
  font-size: .7rem;
}
.calendar-day:hover {
  background: rgba(99,102,241,.12);
}

.calendar-detail {
  margin-top: 1rem;
  background: rgba(0,0,0,.02);
  border-radius: .5rem;
  padding: .5rem .6rem;
  font-size: .7rem;
}

/* filters */
.filters-card label {
  font-size: .7rem;
}

.filter-dates {
  display: flex;
  gap: .5rem;
  margin-top: .5rem;
}

.filter-actions {
  margin-top: .45rem;
  display: flex;
  gap: .5rem;
}

.btn-secondary {
  background: rgba(0,0,0,.03);
  border: 1px solid var(--border);
  border-radius: .4rem;
  padding: .45rem .7rem;
  cursor: pointer;
}

.toggle {
  display: flex;
  gap: .4rem;
  align-items: center;
  font-size: .75rem;
}

/* tabs */
.tab {
  display: none;
}
.tab.active {
  display: block;
}
