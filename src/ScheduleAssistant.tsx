import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, CalendarDays, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import type { ChatSession } from "firebase/ai";
import type { ScheduleEvent } from "./types";
import { aiAssistantReady } from "./firebase";
import { startScheduleChat } from "./scheduleAssistantModel";

type Message = { role: "user" | "model"; text: string };

const suggestions = ["今天有什麼安排？", "我這週哪天比較空？", "下一個行程是什麼？"];

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

function makePrompt(question: string, events: ScheduleEvent[]) {
  const includeDetails = /地點|位置|地址|在哪|備註|說明|細節/.test(question);
  const eventLines = events.slice(0, 300).map((event) => {
    const timing = event.allDay
      ? "全天"
      : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`;
    const details = includeDetails
      ? `；地點：${event.location || "未設定"}；備註：${event.description || "無"}`
      : "";
    return `- ${formatDate(event.startAt)} ${timing}｜${event.title}｜分類：${event.category}${details}`;
  });

  return [
    `現在日期：${formatDate(new Date())}（台北時間）`,
    `以下是使用者自己的行程資料（共 ${events.length} 筆${events.length > 300 ? "，本次提供最早的 300 筆" : ""}）：`,
    eventLines.length ? eventLines.join("\n") : "（目前沒有行程）",
    `使用者問題：${question}`,
  ].join("\n\n");
}

function friendlyAssistantError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
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
}: {
  open: boolean;
  onClose: () => void;
  events: ScheduleEvent[];
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "你好！我可以幫你查今天、這週或指定日期的行程，也能幫你找空檔。",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatRef = useRef<ChatSession | null>(null);
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
    if (!text || busy) return;

    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);
    try {
      if (!aiAssistantReady) {
        throw new Error("App Check reCAPTCHA site key is not configured");
      }
      chatRef.current ??= startScheduleChat();
      const result = await chatRef.current.sendMessage(makePrompt(text, orderedEvents));
      const response = result.response.text().trim();
      setMessages((current) => [...current, {
        role: "model",
        text: response || "我目前沒有足夠資料回答這個問題。",
      }]);
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

  return (
    <>
      {open && <button className="assistant-scrim" onClick={onClose} aria-label="關閉 AI 助理" />}
      <section className={`assistant-panel ${open ? "assistant-panel-open" : ""}`} role="dialog" aria-modal="true" aria-label="AI 行程助理" aria-hidden={!open} inert={!open}>
        <header className="assistant-header">
          <div className="assistant-heading-icon"><Sparkles size={19} /></div>
          <div className="assistant-heading-copy">
            <strong>AI 行程助理</strong>
            <span>只讀取你的行程，協助快速查詢</span>
          </div>
          <button className="assistant-close" type="button" onClick={onClose} aria-label="關閉 AI 助理"><X size={19} /></button>
        </header>

        <div className="assistant-privacy">提問時，輸入內容與相關行程會傳送至 Google Gemini 產生回答；助理不會新增或修改行程。</div>

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
          <div ref={endRef} />
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="詢問行程"
            placeholder={aiAssistantReady ? "例如：下週哪一天比較空？" : "助理安全設定完成後即可開始提問"}
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
            disabled={!aiAssistantReady || busy}
          />
          <button className="assistant-send" type="submit" aria-label="送出問題" disabled={!aiAssistantReady || busy || !input.trim()}>
            {busy ? <LoaderCircle size={17} className="assistant-spinner" /> : <Send size={17} />}
          </button>
        </form>
        <div className="assistant-footer">AI 回答可能不完整，重要資訊請以行程內容為準</div>
      </section>
    </>
  );
}
