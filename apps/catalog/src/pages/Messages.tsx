import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";

export default function Messages() {
  const { threads, sendMessage, role } = useStore();
  const [params] = useSearchParams();
  // Arriving from a bid deep-links straight into that conversation.
  const requested = params.get("thread");
  const [activeId, setActiveId] = useState(requested ?? threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (requested) setActiveId(requested);
  }, [requested]);

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];
  const mySide = role === "buyer" ? "buyer" : "developer";

  function send() {
    if (!active || !draft.trim()) return;
    sendMessage(active.id, draft.trim());
    setDraft("");
  }

  return (
    <>
      <header className="topbar">
        <h1>Messages</h1>
      </header>
      <div className="content">
        {threads.length === 0 ? (
          <div className="card empty">
            <strong>No conversations yet</strong>
            Messages open once a bid is placed on a locked requirement.
          </div>
        ) : (
          <div className="messenger">
            <div className="thread-list">
              {threads.map((thread) => (
                <button
                  type="button"
                  key={thread.id}
                  className={`thread-item${thread.id === active?.id ? " active" : ""}`}
                  onClick={() => setActiveId(thread.id)}
                >
                  <strong>{thread.counterpart}</strong>
                  <span>{thread.subject}</span>
                </button>
              ))}
            </div>

            {active && (
              <div className="card">
                <div className="card-head">
                  <h2>{active.counterpart}</h2>
                  <span className="badge">{active.subject}</span>
                </div>
                <div className="bubbles">
                  {active.messages.length === 0 && (
                    <p className="hint thread-empty">
                      No messages yet. Ask anything about the locked scope
                      before work starts — it is cheaper to clarify now.
                    </p>
                  )}
                  {active.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`bubble ${message.from === mySide ? "me" : "them"}`}
                    >
                      {message.body}
                      <span>
                        {message.authorName} · {message.sentAt}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="composer">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") send();
                    }}
                    placeholder="Write a message"
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={send}
                    disabled={!draft.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
