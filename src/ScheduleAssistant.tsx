import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, CalendarDays, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import type { Category, ScheduleEvent, ScheduleMutation, ScheduleValues } from "./types";
import { aiAssistantReady } from "./firebase";
import { askScheduleAssistant, type ScheduleMutationProposal } from "./scheduleAssistantModel";

type Message = { role: "user" | "model"; text: string };

const suggestions = ["今天有什麼安排？", "幫我新增明天下午 3 點的行程", "修改下一個行程時間", "刪除取消的行程"];
const categoryIds: Category[] = ["work", "personal", "health", "learning", "family", "other"];
const categoryNames: Record<Category, string> = {
  work: "工作", personal: "個人", health: "健康", learning: "學習", family: "家庭", other: "其他",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function makePrompt(question: string, events: ScheduleEvent[]) {
  const mutationIntent = /新增|建立|安排|加到|修改|編輯|更新|改成|刪除|取消|移除/.test(question);
  const includeDetails = /地點|位置|地址|在哪|備註|說明|細節/.test(question);
  const eventLines = events.slice(0, 300).map((event) => {
    const timing = event.allDay
      ? "全天"
      : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`;
    const details = includeDetails
      ? `；地點：${event.location || "未設定"}；備註：${event.description || "無"}`
      : "";
    const id = mutationIntent ? `ID=${event.id}；` : "";
    return `- ${id}${formatDate(event.startAt)} ${timing}｜${event.title}｜分類：${categoryNames[event.category]}${details}`;
  });

  return [
    `現在日期：${formatDate(new Date())}（台北時間）`,
    `以下是使用者自己的行程資料（共 ${events.length} 筆${events.length > 300 ? "，本次提供前 300 筆" : ""}）：`,
    eventLines.length ? eventLines.join("\n") : "（目前沒有行程）",
    `使用者問題：${question}`,
  ].join("\n\n");
}

function createPendingMutation(
  proposal: ScheduleMutationProposal,
  events: ScheduleEvent[],
): { mutation?: ScheduleMutation; clarification?: string } {
  if (proposal.operation === "clarify") {
    return { clarification: proposal.clarificationQuestion || "請再提供一些行程細節，我才能安全地處理。" };
  }

  if (proposal.operation === "delete" || proposal.operation === "update") {
    let matches = proposal.eventId ? events.filter((event) => event.id === proposal.eventId) : [];
    if (!matches.length && proposal.title) {
      matches = events.filter((event) =>
        event.title.trim().toLocaleLowerCase() === proposal.title!.trim().toLocaleLowerCase()
        && (!proposal.date || dateKey(event.startAt) === proposal.date),
      );
    }
    if (matches.length !== 1) {
      return { clarification: matches.length > 1
        ? "我找到多筆相似行程，請告訴我日期或時間，確認要處理哪一筆。"
        : "我找不到這筆行程，請提供行程名稱和日期。" };
    }
    const target = matches[0];
    if (proposal.operation === "delete") return { mutation: { operation: "delete", eventId: target.id } };

    const isAllDay = proposal.allDay ?? target.allDay;
    if (!isAllDay && target.allDay && (!proposal.startTime || !proposal.endTime)) {
      return { clarification: "這筆目前是全天行程。請告訴我修改後的開始和結束時間。" };
    }
    const values: ScheduleValues = {
      title: proposal.title?.trim() || target.title,
      date: proposal.date || dateKey(target.startAt),
      startTime: proposal.startTime || (target.allDay ? "09:00" : formatTime(target.startAt)),
      endTime: proposal.endTime || (target.allDay ? "10:00" : formatTime(target.endAt)),
      allDay: isAllDay,
      category: proposal.category && categoryIds.includes(proposal.category) ? proposal.category : target.category,
      location: proposal.location ?? target.location,
      description: proposal.description ?? target.description,
    };
    if (!validValues(values)) return { clarification: "修改內容中的日期或時間格式不正確，請重新說明。" };
    return { mutation: { operation: "update", eventId: target.id, values } };
  }

  if (proposal.operation === "create") {
    const isAllDay = proposal.allDay ?? false;
    if (!proposal.title?.trim() || !proposal.date || (!isAllDay && (!proposal.startTime || !proposal.endTime))) {
      return { clarification: proposal.clarificationQuestion || "請提供行程名稱、日期及開始和結束時間；如果是全天行程也可以告訴我。" };
    }
    const values: ScheduleValues = {
      title: proposal.title.trim(),
      date: proposal.date,
      startTime: proposal.startTime || "09:00",
      endTime: proposal.endTime || "10:00",
      allDay: isAllDay,
      category: proposal.category && categoryIds.includes(proposal.category) ? proposal.category : "other",
      location: proposal.location || "",
      description: proposal.description || "",
    };
    if (!validValues(values)) return { clarification: "日期或時間格式不正確，請再提供一次。" };
    return { mutation: { operation: "create", values } };
  }

  return { clarification: "我還不確定要如何處理，請換個方式描述你的行程需求。" };
}

function validValues(values: ScheduleValues) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) return false;
  const [year, month, day] = values.date.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  if (!values.allDay && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.startTime)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.endTime))) return false;
  if (!values.allDay && values.endTime <= values.startTime) return false;
  return Boolean(values.title.trim()) && values.title.length <= 120
    && values.description.length <= 1000 && values.location.length <= 160;
}

function mutationSummary(mutation: ScheduleMutation, events: ScheduleEvent[]) {
  if (mutation.operation === "delete") {
    const target = events.find((event) => event.id === mutation.eventId);
    return `刪除「${target?.title ?? "行程"}」（${target ? formatDate(target.startAt) : ""}）`;
  }
  const { values } = mutation;
  const time = values.allDay ? "全天" : `${values.startTime}–${values.endTime}`;
  const operation = mutation.operation === "create" ? "新增" : "修改為";
  return `${operation}「${values.title}」\n${values.date} ${time}\n${categoryNames[values.category]}${values.location ? ` · ${values.location}` : ""}`;
}

function friendlyAssistantError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied") return "沒有權限修改這筆行程，請重新整理後再試。";
  if (/app.?check|recaptcha|attestation/i.test(message)) {
    return "AI 助理的網站安全驗證尚未完成，請稍後再試。";
  }
  if (/quota|429|resource exhausted/i.test(message)) {
    return "AI 助理目前使用量較多，請稍後再試。";
  }
  return "目前無法取得 AI 回覆，請稍後再試。";
}

export function ScheduleAssistant({
  open,
  onClose,
  events,
  onApplyMutation,
}: {
  open: boolean;
  onClose: () => void;
  events: ScheduleEvent[];
  onApplyMutation: (mutation: ScheduleMutation) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "你好！我可以查詢行程，也能依照你的指示新增、修改或刪除行程。每次變更都會先讓你確認。",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingMutation, setPendingMutation] = useState<ScheduleMutation | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const orderedEvents = useMemo(
    () => [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    [events],
  );

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, busy]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function submit(question = input) {
    const text = question.trim();
    if (!text || busy || pendingMutation) return;

    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);
    try {
      if (!aiAssistantReady) {
        throw new Error("App Check reCAPTCHA site key is not configured");
      }
      const result = await askScheduleAssistant(makePrompt(text, orderedEvents));
      if (result.proposal) {
        const prepared = createPendingMutation(result.proposal, orderedEvents);
        if (prepared.mutation) {
          setPendingMutation(prepared.mutation);
          setMessages((current) => [...current, { role: "model", text: "我整理好這項變更，請確認內容後再執行。" }]);
        } else {
          setMessages((current) => [...current, { role: "model", text: prepared.clarification || "請補充行程資訊。" }]);
        }
      } else {
        setMessages((current) => [...current, {
          role: "model",
          text: result.text || "我目前沒有足夠資料回答這個問題。",
        }]);
      }
    } catch (sendError) {
      setError(friendlyAssistantError(sendError));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  async function confirmMutation() {
    if (!pendingMutation || busy) return;
    setBusy(true);
    setError("");
    try {
      await onApplyMutation(pendingMutation);
      const result = pendingMutation.operation === "create" ? "行程已新增。"
        : pendingMutation.operation === "update" ? "行程已更新。" : "行程已刪除。";
      setMessages((current) => [...current, { role: "model", text: result }]);
      setPendingMutation(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error && !/quota|429|resource exhausted/i.test(mutationError.message)
        ? mutationError.message
        : friendlyAssistantError(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && <button className="assistant-scrim" onClick={onClose} aria-label="關閉 AI 助理" />}
      <section className={`assistant-panel ${open ? "assistant-panel-open" : ""}`} role="dialog" aria-modal="true" aria-label="AI 行程助理" aria-hidden={!open} inert={!open}>
        <header className="assistant-header">
          <div className="assistant-heading-icon"><Sparkles size={19} /></div>
          <div className="assistant-heading-copy">
            <strong>AI 行程助理</strong>
            <span>查詢與管理行程，變更前會先請你確認</span>
          </div>
          <button className="assistant-close" type="button" onClick={onClose} aria-label="關閉 AI 助理"><X size={19} /></button>
        </header>

        <div className="assistant-privacy">提問時，輸入內容與相關行程會傳送至 Google Gemini。新增、修改或刪除前會先顯示提案供你確認。</div>

        <div className="assistant-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={`${index}-${message.role}`}>
              {message.role === "model" && <span className="assistant-message-icon"><Bot size={15} /></span>}
              <div className="assistant-bubble">{message.text}</div>
            </div>
          ))}
          {messages.length === 1 && !busy && (
            <div className="assistant-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void submit(suggestion)} disabled={!aiAssistantReady}>
                  <CalendarDays size={14} />{suggestion}
                </button>
              ))}
            </div>
          )}
          {busy && <div className="assistant-thinking"><LoaderCircle size={16} className="assistant-spinner" />正在整理你的行程…</div>}
          {error && <div className="assistant-error" role="alert">{error}</div>}
          {pendingMutation && (
            <div className="assistant-proposal" role="group" aria-label="確認行程變更">
              <strong>待確認變更</strong>
              <p>{mutationSummary(pendingMutation, orderedEvents)}</p>
              <div className="assistant-proposal-actions">
                <button type="button" className="assistant-reject" onClick={() => { setPendingMutation(null); setMessages((current) => [...current, { role: "model", text: "已取消，沒有變更行程。" }]); }}>取消</button>
                <button type="button" className="assistant-confirm" onClick={() => void confirmMutation()} disabled={busy}>{busy ? "處理中…" : "確認執行"}</button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="詢問行程"
            placeholder={!aiAssistantReady ? "助理安全設定完成後即可開始提問" : pendingMutation ? "請先確認或取消上方的變更" : "例如：下週哪一天比較空？"}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            maxLength={1000}
            rows={1}
            disabled={!aiAssistantReady || busy || Boolean(pendingMutation)}
          />
          <button className="assistant-send" type="submit" aria-label="送出問題" disabled={!aiAssistantReady || busy || Boolean(pendingMutation) || !input.trim()}>
            {busy ? <LoaderCircle size={17} className="assistant-spinner" /> : <Send size={17} />}
          </button>
        </form>
        <div className="assistant-footer">AI 回答可能不完整，重要資訊請以行程內容為準</div>
      </section>
    </>
  );
}
