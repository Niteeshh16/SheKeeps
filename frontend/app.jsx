import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const TODAY = () => new Date().toISOString().slice(0, 10);
const fmtDate = (value, options = { month: 'short', day: 'numeric' }) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, options) : 'No due date';
const fullDate = value => new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const cx = (...values) => values.filter(Boolean).join(' ');

async function api(path, options = {}) {
  const init = { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
  let response = await fetch(`/api${path}`, init);
  if (response.status === 401 && !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path)) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (refreshed.ok) response = await fetch(`/api${path}`, init);
  }
  const responseText = await response.text();
  let body;
  try { body = responseText ? JSON.parse(responseText) : {}; }
  catch { body = {}; }
  if (!response.ok) throw new Error(body.message || `Request failed (HTTP ${response.status}).`);
  if (!body || typeof body !== 'object') throw new Error('The server returned an invalid response.');
  return body.data;
}

function App() {
  const [user, setUser] = useState(null);
  const [bypass, setBypass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [view, setView] = useState('home');
  const [notes, setNotes] = useState([]);
  const [todos, setTodos] = useState([]);
  const [journal, setJournal] = useState([]);
  const [diary, setDiary] = useState([]);
  const [noteFilter, setNoteFilter] = useState('All');
  const [todoFilter, setTodoFilter] = useState('All');
  const [editor, setEditor] = useState(null);
  const [journalDraft, setJournalDraft] = useState(null);
  const [diaryDraft, setDiaryDraft] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const loadWorkspace = useCallback(async () => {
    const [n, t, j, d] = await Promise.all([api('/notes'), api('/tasks'), api('/journal'), api('/diary')]);
    setNotes(n); setTodos(t); setJournal(j); setDiary(d);
  }, []);

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get('oauthError');
    if (oauthError) { setAuthError(oauthError); window.history.replaceState({}, '', window.location.pathname); }
    (async () => {
      try {
        const me = await api('/auth/me');
        setUser(me.user); setBypass(Boolean(me.authBypass));
        await loadWorkspace();
      } catch { setUser(null); }
      finally { setLoading(false); }
    })();
  }, [loadWorkspace]);

  const changeView = next => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const saveItem = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = form.get('kind');
    const id = form.get('id');
    const value = name => form.get(name) || '';
    const method = id ? 'PUT' : 'POST';
    const path = kind === 'note' ? `/notes${id ? `/${id}` : ''}` : kind === 'todo' ? `/tasks${id ? `/${id}` : ''}` : `/journal${id ? `/${id}` : ''}`;
    let data;
    if (kind === 'note') data = { title: value('title'), content: value('content'), category: value('category'), color: value('color') || 'lavender' };
    else if (kind === 'todo') data = { title: value('title'), details: value('details'), dueDate: value('dueDate') || null, priority: value('priority'), completed: value('completed') === 'true' };
    else data = { entryDate: value('entryDate') || TODAY(), title: value('title'), content: value('content'), mood: value('mood') };
    try {
      await api(path, { method, body: JSON.stringify(data) });
      setEditor(null); await loadWorkspace();
      notify(kind === 'note' ? 'Note saved' : kind === 'todo' ? (id ? 'Todo updated' : 'Todo added') : 'Journal entry saved');
    } catch (error) { notify(error.message); }
  };

  const toggleTodo = async todo => {
    try { await api(`/tasks/${todo.id}/complete`, { method: 'PATCH', body: JSON.stringify({ completed: !todo.completed }) }); await loadWorkspace(); }
    catch (error) { notify(error.message); }
  };
  const deleteItem = async (kind, item) => {
    if (!window.confirm(`Delete this ${kind === 'todo' ? 'todo' : kind}? This cannot be undone.`)) return;
    const route = kind === 'todo' ? 'tasks' : kind === 'note' ? 'notes' : kind === 'diary' ? 'diary' : 'journal';
    try { await api(`/${route}/${item.id}`, { method: 'DELETE' }); setEditor(null); setJournalDraft(null); await loadWorkspace(); notify('Deleted'); }
    catch (error) { notify(error.message); }
  };
  const saveJournal = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = form.get('id');
    const data = { entryDate: form.get('entryDate') || TODAY(), title: form.get('title') || '', content: form.get('content') || '', mood: form.get('mood') || 'Calm', status: form.get('status') || 'Completed', remarks: form.get('remarks') || '' };
    if (!data.title.trim() && !data.content.trim()) { notify('Write a few words before saving.'); return; }
    try {
      await api(`/journal${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      setJournalDraft(null);
      notify('Journal entry saved');
      try { await loadWorkspace(); }
      catch { notify('Activity saved, but the list could not refresh. Reload the page to see it.'); }
    }
    catch (error) { notify(error.message); }
  };
  const saveDiary = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = form.get('id');
    const data = { entryDate: form.get('entryDate') || TODAY(), title: form.get('title') || '', content: form.get('content') || '', mood: form.get('mood') || 'Calm' };
    if (!data.title.trim() && !data.content.trim()) { notify('Write a few words before saving.'); return; }
    try {
      await api(`/diary${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      setDiaryDraft(null);
      notify('Journal entry saved');
      await loadWorkspace();
    } catch (error) { notify(error.message); }
  };
  const signOut = async () => {
    if (bypass) { notify('Guest access is enabled for local development.'); return; }
    try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* Local session can still be cleared. */ }
    setUser(null); setNotes([]); setTodos([]); setJournal([]); setDiary([]);
  };

  const openEditor = (kind, item = null) => setEditor({ kind, item });
  const openDiary = item => { setDiaryDraft(item || { entryDate: TODAY(), title: '', content: '', mood: 'Calm' }); changeView('diary'); };
  const todayEntry = diary.find(entry => String(entry.entryDate).slice(0, 10) === TODAY());
  const pendingTodos = todos.filter(todo => !todo.completed);
  const filteredNotes = noteFilter === 'All' ? notes : notes.filter(note => note.category === noteFilter);
  const filteredTodos = todos.filter(todo => todoFilter === 'All' || (todoFilter === 'Done' ? todo.completed : !todo.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return [
      ...notes.map(item => ({ ...item, kind: 'note', label: 'Note', text: item.content })),
      ...todos.map(item => ({ ...item, kind: 'todo', label: 'Todo', text: item.details })),
      ...journal.map(item => ({ ...item, kind: 'journal', label: 'Daily activity', text: item.content })),
      ...diary.map(item => ({ ...item, kind: 'diary', label: 'Journal', text: item.content }))
    ].filter(item => `${item.title} ${item.text || ''}`.toLowerCase().includes(term)).slice(0, 12);
  }, [query, notes, todos, journal, diary]);

  if (loading) return <div className="loading-screen"><span className="brand-mark">s.</span><p>Opening your space…</p></div>;
  if (!user) return <AuthScreen error={authError} />;

  const firstName = user.name?.split(' ')[0] || 'there';
  const pageNames = { home: 'Today', notes: 'Notes', todos: 'Todo list', journal: 'Daily activities', diary: 'Journal' };
  return <>
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={event => { event.preventDefault(); changeView('home'); }}><span className="brand-mark">s.</span><span>SheKeeps</span></a>
        <div className="side-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <NavButton current={view} id="home" icon="⌂" onClick={changeView}>Today</NavButton>
          <NavButton current={view} id="notes" icon="▤" count={notes.length} onClick={changeView}>Notes</NavButton>
          <NavButton current={view} id="todos" icon="☑" count={pendingTodos.length} onClick={changeView}>Todo list</NavButton>
          <NavButton current={view} id="diary" icon="✎" onClick={changeView}>Journal</NavButton>
          <NavButton current={view} id="journal" icon="◷" onClick={changeView}>Daily activities</NavButton>
        </nav>
        <div className="side-spacer" />
        <div className="sidebar-quote"><span>“</span><p>Almost everything will work again if you unplug it for a few minutes, including you.</p><small>ANNE LAMOTT</small></div>
        <button className="profile-button"><span className="avatar">{(user.name || 'S').trim().charAt(0).toUpperCase()}</span><span className="profile-meta"><strong>{user.name}</strong><small>{bypass ? 'Local guest workspace' : 'Personal workspace'}</small></span><span className="profile-menu">···</span></button>
        {!bypass && <button className="logout-button" onClick={signOut}>Sign out</button>}
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>MY WORKSPACE</span><b>/</b><strong>{pageNames[view]}</strong></div><div className="topbar-actions"><span className="today-date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className="icon-button search-button" aria-label="Search" onClick={() => { setSearchOpen(true); setQuery(''); }}>⌕</button><button className="button button-dark create-button" onClick={() => view === 'journal' ? setJournalDraft({ entryDate: TODAY(), title: '', content: '', status: 'Completed', remarks: '' }) : view === 'diary' ? openDiary(null) : openEditor(view === 'todos' ? 'todo' : 'note')}>＋ <span>Create new</span></button></div></header>
        <div className="view-root">
          {view === 'home' && <HomeView firstName={firstName} notes={notes} todos={pendingTodos} entry={todayEntry} onView={changeView} onCreate={openEditor} onEdit={openEditor} onToggle={toggleTodo} onWrite={() => openDiary(todayEntry || null)} />}
          {view === 'notes' && <NotesView notes={filteredNotes} filter={noteFilter} setFilter={setNoteFilter} onCreate={() => openEditor('note')} onEdit={item => openEditor('note', item)} />}
          {view === 'todos' && <TodosView todos={filteredTodos} filter={todoFilter} setFilter={setTodoFilter} onCreate={() => openEditor('todo')} onEdit={item => openEditor('todo', item)} onToggle={toggleTodo} />}
          {view === 'journal' && <JournalView entries={journal} draft={journalDraft} setDraft={setJournalDraft} onSave={saveJournal} onDelete={item => deleteItem('journal', item)} />}
          {view === 'diary' && <DiaryView entries={diary} draft={diaryDraft} setDraft={setDiaryDraft} onSave={saveDiary} onDelete={item => deleteItem('diary', item)} />}
        </div>
        <footer className="app-footer"><span>Made for the life you’re living.</span><span>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></footer>
      </main>
    </div>
    {editor && <Editor key={`${editor.kind}-${editor.item?.id || 'new'}`} editor={editor} onSave={saveItem} onClose={() => setEditor(null)} onDelete={() => deleteItem(editor.kind, editor.item)} />}
    {searchOpen && <SearchDialog query={query} setQuery={setQuery} results={searchResults} onClose={() => setSearchOpen(false)} onSelect={item => { setSearchOpen(false); if (item.kind === 'journal') { changeView('journal'); setJournalDraft(item); } else if (item.kind === 'diary') { changeView('diary'); setDiaryDraft(item); } else { changeView(item.kind === 'todo' ? 'todos' : 'notes'); openEditor(item.kind, item); } }} />}
    <div className={cx('toast', toast && 'show')} role="status" aria-live="polite">{toast}</div>
  </>;
}

function NavButton({ current, id, icon, count, onClick, children }) {
  return <button className={cx('nav-item', current === id && 'active')} onClick={() => onClick(id)}><span className="nav-icon">{icon}</span>{children}{count !== undefined && <span className="nav-count">{count}</span>}</button>;
}

function AuthScreen({ error }) {
  return <main className="auth-screen"><section className="auth-art"><div className="brand brand-light"><span className="brand-mark">s.</span><span>SheKeeps</span></div><div className="art-copy"><span className="eyebrow">A LITTLE SPACE FOR YOU</span><h1>Make room for<br /><em>what matters.</em></h1><p>Gather your thoughts, make gentle plans, and remember the days as they happen.</p></div><div className="art-note"><span>✦</span> “The secret of getting ahead is getting started.”<small>— Mark Twain</small></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /></section><section className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">YOUR PRIVATE SPACE</span><h2>Sign in securely.</h2><p className="muted">Use your Google account to access your notes, plans, and journal.</p><a className="button button-google button-wide" href="/api/auth/google">Continue with Google</a>{error && <p className="auth-error">{error}</p>}</div><div className="auth-footer">A quieter way to get things done.</div></section></main>;
}
function Empty({ title, children, action, onClick }) {
  return <div className="empty-state"><strong>{title}</strong>{children}{action && <><br /><button className="link-button" onClick={onClick}>＋ {action}</button></>}</div>;
}
function SectionHeading({ eyebrow, title, subtitle, action, onClick }) {
  return <section className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action && <button className="button button-dark" onClick={onClick}>＋ {action}</button>}</section>;
}
function NoteCard({ note, onClick }) {
  const colors = ['lavender', 'sage', 'peach', 'blue'];
  return <article className={`note-card ${colors.includes(note.color) ? note.color : 'lavender'}`} onClick={onClick} role="button" tabIndex="0" onKeyDown={event => event.key === 'Enter' && onClick()}><span className="note-category">{note.category || 'Personal'}</span><h3>{note.title}</h3><p>{note.content || 'A fresh page, ready for your thoughts.'}</p><time>{fmtDate(note.updatedAt)}</time></article>;
}
function TodoRow({ todo, onToggle, onEdit }) {
  return <div className="task-row"><button className={cx('check-button', todo.completed && 'checked')} aria-label={todo.completed ? 'Mark not done' : 'Mark done'} onClick={() => onToggle(todo)}>{todo.completed ? '✓' : ''}</button><div className={cx('task-copy', todo.completed && 'done')}><strong>{todo.title}</strong>{todo.details && <p>{todo.details}</p>}</div><span className="task-meta"><i className={cx('priority-dot', todo.priority !== 'normal' && todo.priority)} />{todo.dueDate ? fmtDate(todo.dueDate) : todo.priority}</span><button className="icon-button" aria-label="Edit todo" onClick={() => onEdit(todo)}>···</button></div>;
}
function HomeView({ firstName, notes, todos, entry, onView, onCreate, onEdit, onToggle, onWrite }) {
  const hour = new Date().getHours();
  return <><section className="greeting-row"><div><span className="eyebrow">{fullDate(new Date())}</span><h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {firstName}.</h1><p>A clear mind makes space for good things. What’s on yours today?</p></div><button className="button button-dark" onClick={() => onCreate('note')}><span>＋</span> Capture a thought</button></section><section className="overview-grid"><article className="panel"><div className="panel-heading"><div><h2 className="panel-title">A few things to remember</h2><p className="panel-sub">Your recent notes, all in one place.</p></div><button className="link-button" onClick={() => onView('notes')}>See all →</button></div>{notes.length ? <div className="notes-grid">{notes.slice(0, 4).map(note => <NoteCard key={note.id} note={note} onClick={() => onEdit('note', note)} />)}</div> : <Empty title="Start with a thought" action="Write your first note" onClick={() => onCreate('note')}>Save ideas, plans, or anything you want to remember.</Empty>}</article><article className="panel"><div className="panel-heading"><div><h2 className="panel-title">On your todo list</h2><p className="panel-sub">Small steps add up.</p></div><button className="link-button" onClick={() => onView('todos')}>See todos →</button></div>{todos.length ? <div className="task-list">{todos.slice(0, 4).map(todo => <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onEdit={item => onEdit('todo', item)} />)}</div> : <Empty title="Nothing pressing" action="Add a todo" onClick={() => onCreate('todo')}>Your todo list is clear for now.</Empty>}</article></section><section className="panel journal-panel"><div className="journal-date"><small>TODAY’S JOURNAL</small>{fmtDate(TODAY(), { month: 'long', day: 'numeric' })}</div><div className="journal-prompt">{entry ? (entry.title || 'A page from today') : 'What’s one thing you want to remember about today?'}<small>{entry ? (entry.content?.slice(0, 90) || 'Open your entry to keep writing.') : 'A few words are enough.'}</small></div><button className="button button-dark" onClick={onWrite}><span>↗</span> Write a little</button></section></>;
}
function NotesView({ notes, filter, setFilter, onCreate, onEdit }) {
  return <><SectionHeading eyebrow="YOUR THOUGHTS, KEPT" title="Notes" subtitle="A home for the things worth remembering." action="New note" onClick={onCreate} /><div className="filter-row">{['All', 'Personal', 'Work', 'Ideas', 'Reading'].map(value => <button key={value} className={cx('filter-chip', filter === value && 'active')} onClick={() => setFilter(value)}>{value}{value === 'All' ? ` · ${notes.length}` : ''}</button>)}</div>{notes.length ? <div className="notes-page-grid">{notes.map(note => <NoteCard key={note.id} note={note} onClick={() => onEdit(note)} />)}</div> : <Empty title="A clean page" action="Create a note" onClick={onCreate}>Write down an idea before it wanders off.</Empty>}</>;
}
function TodosView({ todos, filter, setFilter, onCreate, onEdit, onToggle }) {
  return <><SectionHeading eyebrow="ONE THING AT A TIME" title="Todo list" subtitle="Keep your plans kind, clear, and doable." action="Add a todo" onClick={onCreate} /><div className="filter-row"><div className="task-filters">{['All', 'Not done', 'Done'].map(value => <button key={value} className={cx('filter-chip', filter === value && 'active')} onClick={() => setFilter(value)}>{value}{value === 'All' ? ` · ${todos.length}` : ''}</button>)}</div></div><article className="panel task-page"><div className="task-list">{todos.length ? todos.map(todo => <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onEdit={onEdit} />) : <Empty title={filter === 'Done' ? 'No completed todos yet' : 'Your list is clear'} action="Add a todo" onClick={onCreate}>Add a task and check it off when you’re done.</Empty>}</div></article></>;
}
function DiaryView({ entries, draft, setDraft, onSave, onDelete }) {
  const current = draft || { entryDate: TODAY(), title: '', content: '', mood: 'Calm' };
  return <div className="journal-experience"><div className="journal-intro"><div><span className="eyebrow">PERSONAL REFLECTIONS</span><h1>Journal</h1><p>A private place for your thoughts, feelings, and moments worth remembering.</p></div></div><div className="journal-layout"><form className="journal-editor journal-writing-card" onSubmit={onSave}><input type="hidden" name="id" value={current.id || ''} /><div className="journal-editor-top"><label className="eyebrow">DATE<input type="date" name="entryDate" value={String(current.entryDate || TODAY()).slice(0, 10)} onChange={event => setDraft({ ...current, entryDate: event.target.value })} /></label><span className="draft-status">{current.id ? 'Editing journal entry' : 'New journal entry'}</span></div><label className="field">Title<input className="activity-title" name="title" maxLength="200" placeholder="Give today a title (optional)" value={current.title || ''} onChange={event => setDraft({ ...current, title: event.target.value })} /></label><label className="field">How are you feeling?<select name="mood" value={current.mood || 'Calm'} onChange={event => setDraft({ ...current, mood: event.target.value })}>{['Calm', 'Happy', 'Grateful', 'Focused', 'Tired', 'Thoughtful', 'Anxious'].map(value => <option key={value}>{value}</option>)}</select></label><label className="field">Your thoughts<textarea name="content" rows="12" placeholder="What would you like to remember about today?" value={current.content || ''} onChange={event => setDraft({ ...current, content: event.target.value })} /></label><div className="journal-editor-bottom"><small>{(current.content || '').trim() ? current.content.trim().split(/\s+/).length : 0} words</small><div>{current.id && <button type="button" className="button button-quiet" onClick={() => onDelete(current)}>Delete entry</button>}<button className="button button-dark">{current.id ? 'Update entry' : 'Save entry'}</button></div></div></form><aside className="journal-side"><section className="panel journal-list-panel activity-list-panel"><div className="panel-heading"><div><h2 className="panel-title">Journal entries</h2><p className="panel-sub">{entries.length} saved {entries.length === 1 ? 'entry' : 'entries'}</p></div><button type="button" className="link-button" onClick={() => setDraft({ entryDate: TODAY(), title: '', content: '', mood: 'Calm' })}>＋ New</button></div><div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Date</th><th>Title</th><th>Mood</th><th>Action</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className={draft?.id === entry.id ? 'selected' : ''} onClick={() => setDraft(entry)}><td>{fmtDate(entry.entryDate, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{entry.title || entry.content?.slice(0, 80) || 'Untitled'}</td><td>{entry.mood}</td><td><button type="button" className="activity-delete" aria-label={`Delete journal entry: ${entry.title || entry.entryDate}`} onClick={event => { event.stopPropagation(); onDelete(entry); }}>Delete</button></td></tr>)}</tbody></table>{!entries.length && <p className="muted activity-empty">Your journal starts with a few words.</p>}</div></section></aside></div></div>;
}

function JournalView({ entries, draft, setDraft, onSave, onDelete }) {
  const current = draft || { entryDate: TODAY(), title: '', content: '', mood: 'Calm', status: 'Completed', remarks: '' };
  const prompts = ['What felt like you today?', 'What is taking up space in your mind?', 'What are three small things you’re grateful for?', 'What would make tomorrow feel gentler?', 'When did you feel most present today?'];
  const moods = [{ name: 'Calm', face: '☁️' }, { name: 'Happy', face: '☀️' }, { name: 'Grateful', face: '💛' }, { name: 'Focused', face: '🌿' }, { name: 'Tired', face: '🌙' }, { name: 'Thoughtful', face: '🍃' }, { name: 'Anxious', face: '🌧️' }];
  const [promptIndex, setPromptIndex] = useState(0);
  const [focus, setFocus] = useState(false);
  const textRef = React.useRef(null);
  const content = current.content || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const [activityMonth, setActivityMonth] = useState(TODAY().slice(0, 7));
  const monthEntries = entries.filter(entry => String(entry.entryDate).slice(0, 7) === activityMonth).sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)));
  const exportMonth = () => {
    const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = monthEntries.map(entry => `<tr><td>${esc(entry.entryDate)}</td><td>${esc(entry.title)}</td><td>${esc(entry.status || 'Completed')}</td><td>${esc(entry.content)}</td><td>${esc(entry.remarks)}</td></tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr><th>Date</th><th>Task / Work Description</th><th>Status</th><th>Work Details / Outcome</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `daily-activities-${activityMonth}.xls`; link.click(); URL.revokeObjectURL(url);
  };
  const insertText = (before, after = '') => {
    const field = textRef.current;
    if (!field) return;
    const start = field.selectionStart, end = field.selectionEnd;
    const selection = content.slice(start, end) || 'your words';
    const next = `${content.slice(0, start)}${before}${selection}${after}${content.slice(end)}`;
    setDraft({ ...current, content: next });
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + before.length, start + before.length + selection.length); });
  };
  const setPrompt = () => {
    const prompt = prompts[promptIndex];
    setDraft({ ...current, content: `${content}${content.trim() ? '\n\n' : ''}${prompt}\n` });
    setPromptIndex((promptIndex + 1) % prompts.length);
    requestAnimationFrame(() => textRef.current?.focus());
  };
  return <div className={cx('journal-experience', focus && 'journal-focus')}><div className="journal-intro"><div><span className="eyebrow">DAILY WORK LOG</span><h1>Daily activities</h1><p>Record your work, outcomes, and notes for each day.</p></div></div><div className="journal-layout"><form className="journal-editor journal-writing-card" onSubmit={onSave}><input type="hidden" name="id" value={current.id || ''} /><div className="journal-editor-top"><label className="eyebrow">DATE<input type="date" name="entryDate" value={String(current.entryDate || TODAY()).slice(0, 10)} onChange={event => setDraft({ ...current, entryDate: event.target.value })} /></label><span className="draft-status">{current.id ? 'Editing saved activity' : 'New activity'}</span></div><label className="field">Task / work description<input className="activity-title" name="title" maxLength="200" placeholder="What did you work on?" value={current.title || ''} onChange={event => setDraft({ ...current, title: event.target.value })} /></label><label className="field">Status<select name="status" value={current.status || 'Completed'} onChange={event => setDraft({ ...current, status: event.target.value })}>{['Completed', 'In progress', 'Pending', 'Blocked'].map(value => <option key={value}>{value}</option>)}</select></label><label className="field">Work details / outcome<textarea name="content" rows="5" placeholder="What did you complete or achieve?" value={content} onChange={event => setDraft({ ...current, content: event.target.value })} /></label><label className="field">Remarks<textarea name="remarks" rows="3" placeholder="Additional notes (optional)" value={current.remarks || ''} onChange={event => setDraft({ ...current, remarks: event.target.value })} /></label><input type="hidden" name="mood" value={current.mood || 'Calm'} /><div className="journal-editor-bottom"><small>{words} {words === 1 ? 'word' : 'words'}</small><div>{current.id && <button type="button" className="button button-quiet" onClick={() => onDelete(current)}>Delete activity</button>}<button className="button button-dark">{current.id ? 'Update activity' : 'Save activity'}</button></div></div></form><aside className="journal-side"><section className="panel journal-list-panel activity-list-panel"><div className="panel-heading"><div><h2 className="panel-title">Activity list</h2><p className="panel-sub">{entries.length} saved {entries.length === 1 ? 'activity' : 'activities'}</p></div><button type="button" className="link-button" onClick={() => setDraft({ entryDate: TODAY(), title: '', content: '', mood: 'Calm', status: 'Completed', remarks: '' })}>＋ New</button></div><div className="activity-export"><input aria-label="Export month" type="month" value={activityMonth} onChange={event => setActivityMonth(event.target.value)} /><button type="button" className="button button-dark" disabled={!monthEntries.length} onClick={exportMonth}>Export month to Excel</button></div><div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Date</th><th>Task / work description</th><th>Status</th><th>Work details / outcome</th><th>Remarks</th><th>Action</th></tr></thead><tbody>{monthEntries.map(entry => <tr key={entry.id} className={draft?.id === entry.id ? 'selected' : ''} onClick={() => setDraft(entry)}><td>{fmtDate(entry.entryDate, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{entry.title || '—'}</td><td>{entry.status || 'Completed'}</td><td>{entry.content || '—'}</td><td>{entry.remarks || '—'}</td><td><button type="button" className="activity-delete" aria-label={`Delete activity: ${entry.title || entry.entryDate}`} onClick={event => { event.stopPropagation(); onDelete(entry); }}>Delete</button></td></tr>)}</tbody></table>{!monthEntries.length && <p className="muted activity-empty">No activities saved for this month yet.</p>}</div></section></aside></div></div>;
}

function Editor({ editor, onSave, onClose, onDelete }) {
  const { kind, item } = editor;
  const isNote = kind === 'note', isTodo = kind === 'todo';
  if (isNote) return <NoteComposer item={item} onSave={onSave} onClose={onClose} onDelete={onDelete} />;
  const title = isNote ? 'Put it into words.' : isTodo ? 'Add to your todo list.' : 'What do you want to remember?';
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="editor-dialog editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><form onSubmit={onSave}><div className="dialog-top"><span className="eyebrow">{isNote ? 'A NOTE' : isTodo ? 'A NEW TODO' : 'JOURNAL ENTRY'}</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button></div><h2 id="editor-title">{title}</h2><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item?.id || ''} /><input type="hidden" name="color" value={item?.color || ['lavender', 'sage', 'peach', 'blue'][Math.floor(Math.random() * 4)]} />
    <label className="field">Title<input name="title" maxLength="200" defaultValue={item?.title || ''} placeholder={isTodo ? 'What needs doing?' : 'Give it a name'} required autoFocus /></label>
    {isNote && <label className="field">Category<select name="category" defaultValue={item?.category || 'Personal'}>{['Personal', 'Work', 'Ideas', 'Reading'].map(value => <option key={value}>{value}</option>)}</select></label>}
    {isTodo && <><label className="field">Due date<input name="dueDate" type="date" defaultValue={item?.dueDate || ''} /></label><label className="field">Priority<select name="priority" defaultValue={item?.priority || 'normal'}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><input type="hidden" name="completed" value={item?.completed ? 'true' : 'false'} /><label className="field">Details<textarea name="details" rows="3" defaultValue={item?.details || ''} placeholder="Add a little context (optional)" /></label></>}
    {!isTodo && <label className="field">{isNote ? 'Your thoughts' : 'Your entry'}<textarea name="content" rows="6" defaultValue={item?.content || ''} placeholder="Start wherever you are…" /></label>}
    {!isNote && !isTodo && <><input type="hidden" name="entryDate" value={item?.entryDate || TODAY()} /><label className="field">How are you feeling?<select name="mood" defaultValue={item?.mood || 'Calm'}>{['Calm', 'Happy', 'Grateful', 'Focused', 'Tired', 'Thoughtful', 'Anxious'].map(mood => <option key={mood}>{mood}</option>)}</select></label></>}
    <div className="dialog-actions">{item?.id && <button className="button button-quiet" type="button" onClick={onDelete}>Delete</button>}<button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-dark">Save</button></div></form></section></div>;
}

function NoteComposer({ item, onSave, onClose, onDelete }) {
  const [content, setContent] = useState(item?.content || '');
  const textRef = React.useRef(null);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const addAtCursor = (text, wrap = false) => {
    const field = textRef.current;
    if (!field) return;
    const start = field.selectionStart, end = field.selectionEnd;
    const selected = content.slice(start, end);
    const addition = wrap && selected ? `${text}${selected}` : text;
    const next = `${content.slice(0, start)}${addition}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => { field.focus(); const cursor = start + addition.length; field.setSelectionRange(cursor, cursor); });
  };
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return <div className="modal-backdrop note-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="editor-dialog editor-card note-composer" role="dialog" aria-modal="true" aria-labelledby="note-editor-title"><form onSubmit={onSave}>
    <div className="note-composer-top"><div className="note-brand-mark">✳</div><span className="note-composer-kicker">{item ? 'A NOTE TO KEEP' : 'QUICK CAPTURE'}</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close note editor">×</button></div>
    <div className="note-composer-heading"><h2 id="note-editor-title">{item ? 'Keep shaping this thought.' : 'What’s on your mind?'}</h2><p>Ideas, lists, plans, little things to remember — let them land here.</p></div>
    <input type="hidden" name="kind" value="note" /><input type="hidden" name="id" value={item?.id || ''} /><input type="hidden" name="color" value={item?.color || 'lavender'} />
    <div className="note-meta-row"><label className="note-title-field"><span className="sr-only">Title</span><input name="title" maxLength="200" defaultValue={item?.title || ''} placeholder="Give this note a title…" required autoFocus /></label><label className="note-category-field"><span className="sr-only">Category</span><select name="category" defaultValue={item?.category || 'Personal'} aria-label="Note category">{['Personal', 'Work', 'Ideas', 'Reading'].map(value => <option key={value}>{value}</option>)}</select></label></div>
    <div className="note-writing-surface"><div className="note-toolbar"><span>MAKE YOURSELF AT HOME</span><div><button type="button" title="Add a heading" onClick={() => addAtCursor('## ')}>H<small>2</small></button><button type="button" title="Add a bullet" onClick={() => addAtCursor('\n• ')}>• <span>List</span></button><button type="button" title="Add a checkbox" onClick={() => addAtCursor('\n☐ ')}>☐ <span>Task</span></button><button type="button" title="Add a quote" onClick={() => addAtCursor('\n> ')}><span>❝ Quote</span></button></div></div><textarea ref={textRef} name="content" maxLength="20000" value={content} onChange={event => setContent(event.target.value)} placeholder="Start anywhere. Add a list, a plan, or a passing thought…" /></div>
    <div className="note-composer-footer"><span>{words} {words === 1 ? 'word' : 'words'} <i>·</i> Ready when you are</span><div className="dialog-actions">{item?.id && <button className="button button-quiet" type="button" onClick={onDelete}>Delete</button>}<button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-dark">Save note <span>→</span></button></div></div>
  </form></section></div>;
}

function SearchDialog({ query, setQuery, results, onClose, onSelect }) {
  return <div className="modal-backdrop search-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="search-dialog search-card" role="dialog" aria-modal="true"><div className="search-input-wrap"><span>⌕</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes, todos, journal…" /><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div><div className="search-results">{!query ? <p className="muted">Search across your workspace.</p> : results.length ? results.map(item => <button key={`${item.kind}-${item.id}`} className="search-result" onClick={() => onSelect(item)}><strong>{item.title || 'Untitled'}</strong><small>{item.label} · {fmtDate(item.entryDate || item.dueDate || item.updatedAt)}</small></button>) : <p className="muted">No matches. Try another phrase.</p>}</div></section></div>;
}

createRoot(document.getElementById('root')).render(<App />);
