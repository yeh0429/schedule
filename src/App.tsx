import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  Download,
  LayoutDashboard,
  ListFilter,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { auth, db, googleProvider } from "./firebase";
import { ScheduleAssistant } from "./ScheduleAssistant";
import type { Category, ScheduleEvent, ScheduleMutation } from "./types";

type EventDraft = {
  title: string;
  description: string;
  location: string;
  category: Category;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
};

const categories: { id: Category; label: string; color: string }[] = [
  { id: "work", label: "工作", color: "blue" },
  { id: "personal", label: "個人", color: "violet" },
  { id: "health", label: "健康", color: "green" },
  { id: "learning", label: "學習", color: "amber" },
  { id: "family", label: "家庭", color: "rose" },
  { id: "other", label: "其他", color: "slate" },
];
const weekDays = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const today = new Date();

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function atDate(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(date);
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function sameDate(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function weekStart(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function dayEnd(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return result;
}

function newDraft(date: Date): EventDraft {
  return {
    title: "",
    description: "",
    location: "",
    category: "work",
    date: dateKey(date),
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
  };
}

function categoryInfo(category: Category) {
  return categories.find((item) => item.id === category) ?? categories[categories.length - 1];
}

function friendlyError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/unauthorized-domain") return "此網站網址尚未加入 Firebase 授權網域，請在 Firebase Authentication 設定中加入網域。";
  if (code === "permission-denied") return "目前無法存取行程資料，請確認 Firestore 資料庫與安全規則已完成部署。";
  if (code === "auth/popup-closed-by-user") return "登入視窗已關閉，請再試一次。";
  return "連線發生問題，請稍後再試。";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [selectedCategory, setSelectedCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"month" | "list">("month");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => newDraft(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      return;
    }
    const eventsQuery = query(
      collection(db, "users", user.uid, "events"),
      where("ownerId", "==", user.uid),
      orderBy("startAt", "asc"),
    );
    return onSnapshot(eventsQuery, (snapshot) => {
      setEvents(snapshot.docs.map((eventDoc) => {
        const data = eventDoc.data();
        return {
          id: eventDoc.id,
          title: data.title as string,
          description: (data.description as string) ?? "",
          location: (data.location as string) ?? "",
          category: data.category as Category,
          startAt: (data.startAt as Timestamp).toDate(),
          endAt: (data.endAt as Timestamp).toDate(),
          allDay: Boolean(data.allDay),
        };
      }));
      setError("");
    }, (snapshotError) => setError(friendlyError(snapshotError)));
  }, [user]);

  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesCategory = selectedCategory === "all" || event.category === selectedCategory;
    const queryText = search.trim().toLocaleLowerCase();
    const matchesSearch = !queryText || `${event.title} ${event.description} ${event.location}`.toLocaleLowerCase().includes(queryText);
    return matchesCategory && matchesSearch;
  }), [events, selectedCategory, search]);

  const selectedEvents = useMemo(() => visibleEvents.filter((event) => sameDate(event.startAt, selectedDay)), [visibleEvents, selectedDay]);
  const upcoming = useMemo(() => visibleEvents.filter((event) => event.endAt >= new Date()).slice(0, 3), [visibleEvents]);
  const weekEvents = events.filter((event) => event.startAt >= weekStart(today) && event.startAt < dayEnd(new Date(weekStart(today).getTime() + 6 * 86400000))).length;
  const monthEvents = events.filter((event) => event.startAt.getMonth() === currentMonth.getMonth() && event.startAt.getFullYear() === currentMonth.getFullYear()).length;
  const gridDays = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [currentMonth]);

  function openCreate(date = selectedDay) {
    setEditingEvent(null);
    setDraft(newDraft(date));
    setError("");
    setModalOpen(true);
  }

  function openEdit(event: ScheduleEvent) {
    setEditingEvent(event);
    setDraft({
      title: event.title,
      description: event.description,
      location: event.location,
      category: event.category,
      date: dateKey(event.startAt),
      startTime: timeLabel(event.startAt),
      endTime: timeLabel(event.endAt),
      allDay: event.allDay,
    });
    setError("");
    setModalOpen(true);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !draft.title.trim()) return;
    const date = new Date(`${draft.date}T00:00:00`);
    const startAt = draft.allDay ? date : atDate(date, draft.startTime);
    const endAt = draft.allDay ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) : atDate(date, draft.endTime);
    if (endAt <= startAt) {
      setError("結束時間需要晚於開始時間。若行程跨日，請分成兩筆行程安排。");
      return;
    }
    if (draft.title.trim().length > 120 || draft.description.length > 1000 || draft.location.length > 160) {
      setError("標題最多 120 字、備註最多 1,000 字、地點最多 160 字。 ");
      return;
    }
    setBusy(true);
    setError("");
    const documentRef = editingEvent
      ? doc(db, "users", user.uid, "events", editingEvent.id)
      : collection(db, "users", user.uid, "events");
    const data = {
      ownerId: user.uid,
      title: draft.title.trim(),
      description: draft.description.trim(),
      location: draft.location.trim(),
      category: draft.category,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      allDay: draft.allDay,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editingEvent) {
        await updateDoc(documentRef as ReturnType<typeof doc>, data);
      } else {
        await addDoc(documentRef as ReturnType<typeof collection>, { ...data, createdAt: serverTimestamp() });
      }
      setSelectedDay(date);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setModalOpen(false);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(event: ScheduleEvent) {
    if (!user || !window.confirm(`確定刪除「${event.title}」？`)) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "events", event.id));
      setModalOpen(false);
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    }
  }

  async function applyAssistantMutation(mutation: ScheduleMutation) {
    if (!user) throw new Error("請先登入，再管理你的行程。");
    if (mutation.operation === "delete") {
      const target = events.find((event) => event.id === mutation.eventId);
      if (!target) throw new Error("找不到這筆行程，資料可能已更新；請重新查詢後再試。");
      await deleteDoc(doc(db, "users", user.uid, "events", target.id));
      return;
    }

    const { values } = mutation;
    const date = new Date(`${values.date}T00:00:00`);
    const startAt = values.allDay ? date : atDate(date, values.startTime);
    const endAt = values.allDay
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      : atDate(date, values.endTime);
    if (!values.title.trim() || endAt <= startAt) {
      throw new Error("行程資料不完整或時間不正確，請重新描述後再試。");
    }
    if (values.title.length > 120 || values.description.length > 1000 || values.location.length > 160) {
      throw new Error("行程名稱、地點或備註超過可接受的長度。");
    }

    const data = {
      ownerId: user.uid,
      title: values.title.trim(),
      description: values.description.trim(),
      location: values.location.trim(),
      category: values.category,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      allDay: values.allDay,
      updatedAt: serverTimestamp(),
    };
    if (mutation.operation === "update") {
      if (!events.some((event) => event.id === mutation.eventId)) {
        throw new Error("找不到這筆行程，資料可能已更新；請重新查詢後再試。");
      }
      await updateDoc(doc(db, "users", user.uid, "events", mutation.eventId), data);
    } else {
      await addDoc(collection(db, "users", user.uid, "events"), { ...data, createdAt: serverTimestamp() });
    }
    setSelectedDay(date);
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  async function logIn() {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (loginError) {
      setError(friendlyError(loginError));
    }
  }

  if (authLoading) return <div className="loading-screen"><div className="brand-mark"><CalendarDays size={21} /></div><span>正在準備你的行程…</span></div>;
  if (!user) return <SignIn onSignIn={logIn} error={error} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><CalendarDays size={19} strokeWidth={2.2} /></div><span>schedule<span className="brand-dot">.</span></span><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="關閉選單"><X size={18} /></button></div>
        <button className="create-button" onClick={() => openCreate()}><Plus size={17} strokeWidth={2.3} />新增行程 <span className="shortcut">⌘ K</span></button>
        <nav className="side-nav" aria-label="主選單">
          <div className="nav-label">工作區</div>
          <button className="nav-link active"><LayoutDashboard size={17} />我的行程</button>
          <button className={`nav-link ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}><ListFilter size={17} />行程清單</button>
          <div className="nav-label category-heading">行程分類 <button className="tiny-icon" aria-label="新增分類"><Plus size={15} /></button></div>
          <button className={`category-link ${selectedCategory === "all" ? "category-active" : ""}`} onClick={() => setSelectedCategory("all")}><span className="category-dot dot-all" />全部行程</button>
          {categories.map((category) => <button className={`category-link ${selectedCategory === category.id ? "category-active" : ""}`} key={category.id} onClick={() => setSelectedCategory(selectedCategory === category.id ? "all" : category.id)}><span className={`category-dot dot-${category.color}`} />{category.label}<span className="category-count">{events.filter((event) => event.category === category.id).length || ""}</span></button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="week-card"><div className="week-card-top"><span>本週安排</span><ArrowDownWideNarrow size={15} /></div><div className="week-number">{weekEvents}<span> 個行程</span></div><div className="week-track"><span style={{ width: `${Math.min(100, weekEvents * 10)}%` }} /></div><p>每一步，都朝著重要的事前進。</p></div>
          <div className="user-profile"><div className="avatar">{user.photoURL ? <img src={user.photoURL} alt="" /> : <span>{user.displayName?.[0] ?? "U"}</span>}</div><div className="user-info"><strong>{user.displayName || "我的帳戶"}</strong><span>{user.email}</span></div><button className="icon-button logout-button" onClick={() => signOut(auth)} title="登出" aria-label="登出"><LogOut size={16} /></button></div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="關閉選單" />}

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="開啟選單"><Menu size={19} /></button><span>工作區</span><span className="crumb-divider">/</span><strong>我的行程</strong></div>
          <div className="topbar-actions"><div className="search-box"><Search size={16} /><input aria-label="搜尋行程" placeholder="搜尋行程…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd><Command size={10} /> K</kbd></div><button className="icon-button notification-button" aria-label="通知"><Bell size={17} /><i /></button><div className="topbar-avatar">{user.photoURL ? <img src={user.photoURL} alt="" /> : user.displayName?.[0] ?? "U"}</div></div>
        </header>

        <div className="page-content">
          <div className="greeting-row"><div><div className="eyebrow"><Sparkles size={14} /> 好好安排，從容生活</div><h1>把時間，留給重要的事<span className="title-period">.</span></h1><p className="subheading">今天是 {longDate(today)}，準備好迎接新的一天了嗎？</p></div><button className="primary-button greeting-add" onClick={() => openCreate()}><Plus size={17} />新增行程</button></div>

          <section className="stats-row" aria-label="行程摘要">
            <div className="stat-card"><div className="stat-icon stat-icon-blue"><CalendarDays size={17} /></div><div><span>本月行程</span><strong>{monthEvents}<small> 項</small></strong></div><div className="stat-decoration stat-blue">{monthEvents}<span>+</span></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-green"><Clock3 size={17} /></div><div><span>本週安排</span><strong>{weekEvents}<small> 項</small></strong></div><div className="stat-decoration stat-green"><span>W</span>{Math.min(9, weekEvents)}</div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-violet"><Check size={17} /></div><div><span>今日行程</span><strong>{events.filter((event) => sameDate(event.startAt, today)).length}<small> 項</small></strong></div><div className="stat-decoration stat-violet"><span>✓</span></div></div>
          </section>

          {error && <div className="inline-error"><span>{error}</span><button className="tiny-icon" onClick={() => setError("")} aria-label="關閉錯誤訊息"><X size={15} /></button></div>}

          <section className="calendar-layout">
            <div className="calendar-card">
              <div className="calendar-toolbar"><div><h2>{monthLabel(currentMonth)}</h2><span className="calendar-count"><i />{monthEvents} 個行程</span></div><div className="calendar-actions"><button className="today-button" onClick={() => { setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(new Date(today.getFullYear(), today.getMonth(), today.getDate())); }}>今天</button><div className="month-switcher"><button className="icon-button" aria-label="上個月" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}><ArrowLeft size={16} /></button><button className="icon-button" aria-label="下個月" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}><ArrowRight size={16} /></button></div><div className="view-switch"><button className={view === "month" ? "view-active" : ""} onClick={() => setView("month")}>月</button><button className={view === "list" ? "view-active" : ""} onClick={() => setView("list")}>清單</button></div></div></div>
              {view === "month" ? <div className="month-grid"><div className="weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div><div className="days-grid">{gridDays.map((day) => {
                const dayEvents = visibleEvents.filter((event) => sameDate(event.startAt, day));
                const inMonth = day.getMonth() === currentMonth.getMonth();
                return <button key={dateKey(day)} className={`day-cell ${inMonth ? "" : "outside-month"} ${sameDate(day, selectedDay) ? "selected-day" : ""} ${sameDate(day, today) ? "today-cell" : ""}`} onClick={() => { setSelectedDay(day); if (!inMonth) setCurrentMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}><span className="day-number">{day.getDate()}</span><span className="mobile-event-count">{dayEvents.length ? `· ${dayEvents.length}` : ""}</span><span className="day-events">{dayEvents.slice(0, 2).map((event) => <span key={event.id} className={`event-pill event-${categoryInfo(event.category).color}`} onClick={(click) => { click.stopPropagation(); openEdit(event); }}><span className="pill-time">{event.allDay ? "全天" : timeLabel(event.startAt)}</span><span className="pill-title">{event.title}</span></span>)}{dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2} 個行程</span>}</span></button>;
              })}</div></div> : <div className="list-view">{visibleEvents.filter((event) => event.startAt.getMonth() === currentMonth.getMonth() && event.startAt.getFullYear() === currentMonth.getFullYear()).map((event) => <button key={event.id} className="list-event" onClick={() => { setSelectedDay(event.startAt); openEdit(event); }}><span className={`list-event-bar event-bar-${categoryInfo(event.category).color}`} /><span className="list-event-date"><strong>{event.startAt.getDate()}</strong><small>{new Intl.DateTimeFormat("zh-TW", { weekday: "short" }).format(event.startAt)}</small></span><span className="list-event-info"><strong>{event.title}</strong><small>{event.allDay ? "全天" : `${timeLabel(event.startAt)} – ${timeLabel(event.endAt)}`}{event.location ? ` · ${event.location}` : ""}</small></span><span className={`category-tag tag-${categoryInfo(event.category).color}`}>{categoryInfo(event.category).label}</span><MoreHorizontal size={18} className="muted-icon" /></button>)}{visibleEvents.filter((event) => event.startAt.getMonth() === currentMonth.getMonth() && event.startAt.getFullYear() === currentMonth.getFullYear()).length === 0 && <EmptyState title="這個月還沒有安排" text="把想做的事放進行程，讓每一天更有方向。" onAdd={() => openCreate()} />}</div>}
              <div className="calendar-footer"><div className="legend">{categories.slice(0, 5).map((category) => <span key={category.id}><i className={`legend-dot dot-${category.color}`} />{category.label}</span>)}</div><button className="footer-link" onClick={() => setView(view === "month" ? "list" : "month")}>{view === "month" ? "查看清單" : "查看月曆"}<ArrowRight size={14} /></button></div>
            </div>

            <aside className="day-panel"><div className="day-panel-head"><div><span className="panel-overline">選定日期</span><h3>{longDate(selectedDay)}</h3></div><button className="icon-button" onClick={() => openCreate(selectedDay)} aria-label="在選定日期新增行程"><Plus size={17} /></button></div><div className="day-panel-count"><span className="count-dot" />{selectedEvents.length ? `今天有 ${selectedEvents.length} 項安排` : "留一點空白給自己"}</div><div className="agenda-list">{selectedEvents.map((event) => <button className="agenda-event" key={event.id} onClick={() => openEdit(event)}><div className={`agenda-timeline agenda-${categoryInfo(event.category).color}`}><span /></div><div className="agenda-copy"><span className="agenda-time">{event.allDay ? "全天" : `${timeLabel(event.startAt)} – ${timeLabel(event.endAt)}`}</span><strong>{event.title}</strong>{event.location && <span className="agenda-location"><MapPin size={12} />{event.location}</span>}<span className={`category-tag tag-${categoryInfo(event.category).color}`}>{categoryInfo(event.category).label}</span></div></button>)}{selectedEvents.length === 0 && <div className="empty-agenda"><div className="empty-icon"><CalendarDays size={21} /></div><strong>目前沒有行程</strong><span>休息也是行程的一部分。</span><button onClick={() => openCreate(selectedDay)}><Plus size={14} />安排一件事</button></div>}</div><div className="upcoming-block"><div className="upcoming-title"><strong>接下來</strong><button className="text-button" onClick={() => setView("list")}>全部</button></div>{upcoming.length ? upcoming.map((event) => <button className="upcoming-item" key={event.id} onClick={() => { setSelectedDay(event.startAt); setCurrentMonth(new Date(event.startAt.getFullYear(), event.startAt.getMonth(), 1)); }}><span className={`upcoming-dot dot-${categoryInfo(event.category).color}`} /><span><strong>{event.title}</strong><small>{sameDate(event.startAt, today) ? "今天" : new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(event.startAt)} · {event.allDay ? "全天" : timeLabel(event.startAt)}</small></span></button>) : <p className="upcoming-empty">新增行程後，會顯示在這裡。</p>}</div></aside>
          </section>
          <footer className="page-footer"><span>Schedule <i>·</i> 讓時間安排更自在</span><span><Download size={13} /> 你的行程會自動儲存在 Firebase</span></footer>
        </div>
      </main>

      {modalOpen && <EventModal draft={draft} setDraft={setDraft} event={editingEvent} busy={busy} error={error} onClose={() => setModalOpen(false)} onSave={saveEvent} onDelete={editingEvent ? () => removeEvent(editingEvent) : undefined} />}
      <button
        type="button"
        className={`assistant-launcher ${assistantOpen ? "assistant-launcher-hidden" : ""}`}
        onClick={() => setAssistantOpen(true)}
        aria-label="開啟 AI 行程助理"
        aria-expanded={assistantOpen}
      >
        <MessageCircle size={20} />
        <span>問問行程</span>
      </button>
      <ScheduleAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} events={events} onApplyMutation={applyAssistantMutation} />
    </div>
  );
}

function EmptyState({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><CalendarDays size={22} /></div><strong>{title}</strong><span>{text}</span><button className="text-button" onClick={onAdd}><Plus size={15} />新增第一個行程</button></div>;
}

function SignIn({ onSignIn, error }: { onSignIn: () => void; error: string }) {
  return <div className="signin-page"><header className="signin-top"><div className="brand"><div className="brand-mark"><CalendarDays size={19} /></div><span>schedule<span className="brand-dot">.</span></span></div><span className="signin-top-note">留一點空間，給美好的日常。</span></header><main className="signin-main"><div className="signin-copy"><div className="eyebrow"><Sparkles size={14} /> 一起好好安排</div><h1>時間有了方向，<br /><span>生活就有餘裕。</span></h1><p>工作、學習、生活中的每件小事，都能在這裡找到剛剛好的位置。從容安排，留白也很重要。</p><button className="google-button" onClick={onSignIn}><GoogleMark /><span>使用 Google 帳戶繼續</span><ArrowRight size={16} /></button>{error && <div className="signin-error">{error}</div>}<span className="privacy-note">登入後，只有你能看見自己的行程。</span><div className="signin-points"><span><Check size={14} />快速新增與編輯</span><span><Check size={14} />行程即時同步</span><span><Check size={14} />資料安全儲存</span></div></div><div className="signin-preview"><div className="preview-orb orb-one" /><div className="preview-orb orb-two" /><div className="preview-window"><div className="preview-head"><div className="preview-brand"><span /><span /><span /></div><div className="preview-avatar">S</div></div><div className="preview-greeting"><div className="preview-small-label">星期四，11 月 19 日</div><strong>讓今天，剛剛好。</strong></div><div className="preview-week">{["一", "二", "三", "四", "五", "六", "日"].map((day, index) => <div className={index === 3 ? "preview-selected" : ""} key={day}><span>{day}</span><strong>{[16, 17, 18, 19, 20, 21, 22][index]}</strong>{index === 3 && <i />}</div>)}</div><div className="preview-agenda-title"><span>今天的安排</span><span>2 個行程</span></div><div className="preview-event"><span className="preview-line line-blue" /><div><strong>專案進度討論</strong><span>09:30 – 10:30 · 工作</span></div><span className="preview-event-dot" /></div><div className="preview-event"><span className="preview-line line-violet" /><div><strong>午後咖啡與靈感</strong><span>14:00 – 15:00 · 個人</span></div><span className="preview-event-dot dot-violet" /></div><div className="preview-bottom-note"><Sparkles size={13} /> 每個重要時刻，都值得好好安排。</div></div><div className="floating-note"><span><Check size={14} /></span><div><strong>行程已同步</strong><small>你的時間安排得很好。</small></div></div></div></main><footer className="signin-footer"><span>© 2026 Schedule</span><span>用一點秩序，換更多從容。</span></footer></div>;
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-2 4.6-4.2 6v5.1h6.8c4-3.7 6-9.1 6-14.8z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.8-5.1c-1.9 1.3-4.1 2.1-6.7 2.1-5.2 0-9.6-3.5-11.2-8.2H5.8v5.2A20 20 0 0 0 24 44z" /><path fill="#4A90E2" d="M12.8 28c-.4-1.2-.7-2.6-.7-4s.2-2.7.7-4v-5.2H5.8A20 20 0 0 0 4 24c0 3.2.8 6.3 2.1 9.2l6.7-5.2z" /><path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3.1l5.8-5.8C34 5.7 29.4 4 24 4A20 20 0 0 0 5.8 14.8l7 5.2c1.6-4.7 6-8.2 11.2-8.2z" /></svg>;
}

function EventModal({ draft, setDraft, event, busy, error, onClose, onSave, onDelete }: { draft: EventDraft; setDraft: (draft: EventDraft) => void; event: ScheduleEvent | null; busy: boolean; error: string; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete?: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(click) => { if (click.target === click.currentTarget) onClose(); }}><form className="event-modal" onSubmit={onSave}><div className="modal-head"><div><span className="modal-kicker">{event ? "編輯行程" : "新的安排"}</span><h2>{event ? "調整你的行程" : "為重要的事，留個位置。"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉"><X size={18} /></button></div><label className="field-label">行程名稱 <span>必填</span><input autoFocus maxLength={120} placeholder="例如：團隊週會" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></label><div className="form-two-columns"><label className="field-label">日期<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required /></label><label className="field-label category-select-label">分類<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select><ChevronDown size={15} /></label></div><label className="all-day-toggle"><input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} /><span className="custom-checkbox"><Check size={12} /></span>全天行程</label>{!draft.allDay && <div className="form-two-columns time-columns"><label className="field-label">開始時間<input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} required /></label><label className="field-label">結束時間<input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} required /></label></div>}<label className="field-label">地點 <small>選填</small><div className="input-with-icon"><MapPin size={15} /><input maxLength={160} placeholder="新增地點" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></div></label><label className="field-label">備註 <small>選填</small><textarea maxLength={1000} placeholder="寫下需要記住的細節…" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>{error && <div className="modal-error">{error}</div>}<div className="modal-footer">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>刪除行程</button>}<div className="modal-footer-actions"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy || !draft.title.trim()}>{busy ? "儲存中…" : event ? "儲存變更" : "建立行程"}</button></div></div></form></div>;
}

