"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_TEST_API_BASE_URL || "http://127.0.0.1:8080";
const DEFAULT_CHAT_URL =
  process.env.NEXT_PUBLIC_TEST_CHAT_URL || "http://127.0.0.1:3001";
const QUICK_EMOJIS = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "❤️", "😎", "🤝"];

function makeRoom(localUserId, peerUserId) {
  const a = Number(localUserId);
  const b = Number(peerUserId);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  if (a === b) return "";
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function ReceiptTicks({ message }) {
  if (!message.fromMe) return null;
  if (message.read) {
    return <span className="receipt read" title="Read">✓✓ read</span>;
  }
  if (message.delivered) {
    return <span className="receipt delivered" title="Delivered">✓ delivered</span>;
  }
  return <span className="receipt sent" title="Sent">sent</span>;
}

function applyReceiptFlags(message, { delivered, read }) {
  return {
    ...message,
    delivered: read || delivered || message.delivered,
    read: read || message.read,
  };
}

function inferMediaKind(message) {
  const type = String(message?.type || "").toLowerCase();
  if (type === "image" || type === "video" || type === "audio" || type === "file") return type;
  const mime = String(message?.mediaMimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function extensionFromName(name = "") {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function fileCategory(message) {
  const mime = String(message?.mediaMimeType || "").toLowerCase();
  const ext = extensionFromName(message?.mediaFileName || message?.mediaUrl || "");
  if (mime.startsWith("text/") || ["txt", "md", "csv", "json", "xml", "log"].includes(ext)) {
    return { icon: "📄", label: ext ? ext.toUpperCase() : "TEXT", canPreviewText: true };
  }
  if (
    mime.includes("word") ||
    mime === "application/msword" ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return { icon: "📝", label: ext ? ext.toUpperCase() : "DOC", canPreviewText: false };
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["xls", "xlsx", "ods", "csv"].includes(ext)
  ) {
    return { icon: "📊", label: ext ? ext.toUpperCase() : "SHEET", canPreviewText: ext === "csv" };
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return { icon: "📕", label: "PDF", canPreviewText: false };
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    ["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)
  ) {
    return { icon: "🗜️", label: ext ? ext.toUpperCase() : "ARCHIVE", canPreviewText: false };
  }
  return { icon: "📎", label: ext ? ext.toUpperCase() : "FILE", canPreviewText: false };
}

function FileAttachment({ message }) {
  const [previewText, setPreviewText] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileName = message?.mediaFileName || "Attachment";
  const sizeLabel = formatBytes(message?.mediaFileSize);
  const category = fileCategory(message);

  const tryPreview = async () => {
    setPreviewError("");
    setLoadingPreview(true);
    try {
      const res = await fetch(message.mediaUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setPreviewText(text.slice(0, 1200));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div
      style={{
        display: "inline-block",
        width: "fit-content",
        maxWidth: 300,
        border: "1px solid #384152",
        borderRadius: 8,
        padding: 8,
        background: "rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span>{category.icon}</span>
        <strong>{fileName}</strong>
      </div>
      <div className="small" style={{ marginBottom: 8 }}>
        {category.label}
        {sizeLabel ? ` • ${sizeLabel}` : ""}
        {message?.mediaMimeType ? ` • ${message.mediaMimeType}` : ""}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={message.mediaUrl} target="_blank" rel="noreferrer" style={{ color: "#bfdbfe" }}>
          Open
        </a>
        <a href={message.mediaUrl} download style={{ color: "#bfdbfe" }}>
          Download
        </a>
        {category.canPreviewText ? (
          <button
            type="button"
            onClick={tryPreview}
            style={{
              width: "auto",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #384152",
              background: "#0d111a",
            }}
            disabled={loadingPreview}
          >
            {loadingPreview ? "Loading..." : "Preview text"}
          </button>
        ) : null}
      </div>
      {previewError ? (
        <div className="small" style={{ marginTop: 8, color: "#fca5a5" }}>
          Preview error: {previewError}
        </div>
      ) : null}
      {previewText ? (
        <pre
          style={{
            marginTop: 8,
            maxHeight: 180,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 6,
            padding: 8,
          }}
        >
          {previewText}
        </pre>
      ) : null}
    </div>
  );
}

export default function Page() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [email, setEmail] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [chatUrl, setChatUrl] = useState(DEFAULT_CHAT_URL);
  const [token, setToken] = useState("");
  const [localUserId, setLocalUserId] = useState("");
  const [peerUserId, setPeerUserId] = useState("");
  const [messageType, setMessageType] = useState("text");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaMimeType, setMediaMimeType] = useState("");
  const [mediaFileName, setMediaFileName] = useState("");
  const [mediaFileSize, setMediaFileSize] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [activeRoom, setActiveRoom] = useState("");
  const [eventLog, setEventLog] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState({ online: false, lastSeenAt: "" });
  const [lastReceiptAck, setLastReceiptAck] = useState(null);

  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const markDeliveredTimerRef = useRef(null);
  const receiptEmitRef = useRef({ markDelivered: null, markRead: null });
  const isTypingRef = useRef(false);

  const room = useMemo(
    () => makeRoom(localUserId.trim(), peerUserId.trim()),
    [localUserId, peerUserId]
  );

  const loadHistory = async () => {
    setError("");
    const api = apiBaseUrl.trim();
    const tk = token.trim();
    const peer = Number(peerUserId.trim());
    if (!api || !tk || !Number.isFinite(peer) || peer <= 0) return;
    try {
      const res = await fetch(`${api}/api/chat/messages/${peer}?limit=100`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const json = await res.json();
      const items = Array.isArray(json?.data) ? json.data : [];
      items.sort((a, b) => {
        const ta = a?.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b?.createdAt ? Date.parse(b.createdAt) : 0;
        return ta - tb;
      });
      setMessages(
        items.map((m) => ({
          id: `db-${m.id}`,
          messageId: m.id,
          body: m.message || "",
          type: m.messageType || "text",
          mediaUrl: m.mediaUrl || "",
          mediaMimeType: m.mediaMimeType || "",
          mediaFileName: m.mediaFileName || "",
          reactions: Array.isArray(m.reactions) ? m.reactions : [],
          at: m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : "",
          fromMe: String(m.userId) === localUserId.trim(),
          delivered: Boolean(m.delivered),
          read: Boolean(m.read),
        }))
      );
      setEventLog((prev) => [...prev.slice(-30), `history loaded (${items.length})`]);
    } catch (e) {
      setEventLog((prev) => [...prev.slice(-30), "history load failed"]);
    }
  };

  const peerOnline = Boolean(peerPresence.online);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setPeerPresence({ online: false, lastSeenAt: "" });
    setPeerTyping(false);
  }, [peerUserId]);

  const disconnect = () => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (markDeliveredTimerRef.current) {
      clearTimeout(markDeliveredTimerRef.current);
      markDeliveredTimerRef.current = null;
    }
    isTypingRef.current = false;
    setPeerTyping(false);
    setPeerPresence({ online: false, lastSeenAt: "" });
    receiptEmitRef.current = { markDelivered: null, markRead: null };
    setLastReceiptAck(null);
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus("disconnected");
    setActiveRoom("");
  };

  const connect = () => {
    setError("");
    if (!chatUrl.trim() || !token.trim() || !room) {
      setError("Set chat URL, token, valid local user id, and peer user id.");
      return;
    }

    disconnect();

    const selectedRoom = room;
    const peerIdAtConnect = peerUserId.trim();

    const emitMarkDelivered = () => {
      if (!socketRef.current) return;
      socketRef.current.emit("message", {
        room: selectedRoom,
        message: { type: "mark_delivered" },
      });
      setEventLog((prev) => [...prev.slice(-30), `send mark_delivered -> ${selectedRoom}`]);
    };

    const emitMarkRead = () => {
      if (!socketRef.current) return;
      socketRef.current.emit("message", {
        room: selectedRoom,
        message: { type: "mark_read" },
      });
      setEventLog((prev) => [...prev.slice(-30), `send mark_read -> ${selectedRoom}`]);
    };

    const scheduleMarkDelivered = () => {
      if (markDeliveredTimerRef.current) clearTimeout(markDeliveredTimerRef.current);
      markDeliveredTimerRef.current = setTimeout(() => {
        markDeliveredTimerRef.current = null;
        emitMarkDelivered();
      }, 500);
    };

    const socket = io(chatUrl.trim(), {
      auth: { token: token.trim() },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = socket;
    setStatus("connecting");

    socket.on("receipt_mark_result", (payload) => {
      const kind = payload?.kind || "?";
      const count =
        kind === "delivered"
          ? payload?.data?.messagesMarkedDelivered
          : payload?.data?.messagesMarkedRead;
      setLastReceiptAck({ kind, count: Number(count) || 0, at: new Date().toLocaleTimeString() });
      setEventLog((prev) => [
        ...prev.slice(-30),
        `receipt_mark_result ${kind}: ${count ?? 0} updated`,
      ]);
    });

    socket.on("connect", () => {
      setStatus("connected");
      setActiveRoom(selectedRoom);
      setEventLog((prev) => [...prev.slice(-30), `connect -> join_room ${selectedRoom}`]);
      socket.emit("join_room", selectedRoom);
      const peer = Number(peerUserId.trim());
      if (Number.isFinite(peer) && peer > 0) {
        socket.emit("presence_query", [peer]);
      }
      void loadHistory();
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
      setEventLog((prev) => [...prev.slice(-30), "disconnect"]);
    });

    socket.on("connect_error", (err) => {
      setError(err?.message || "connect_error");
      setEventLog((prev) => [...prev.slice(-30), `connect_error: ${err?.message || "unknown"}`]);
    });

    socket.on("error", (payload) => {
      setError(payload?.message || "socket error");
      setEventLog((prev) => [
        ...prev.slice(-30),
        `server error: ${payload?.message || "socket error"} (${payload?.status || "?"})`,
      ]);
    });

    socket.on(`message_${selectedRoom}`, (payload) => {
      if (payload?.type === "typing") {
        setPeerTyping(true);
        setEventLog((prev) => [...prev.slice(-30), `recv typing ${selectedRoom}`]);
        return;
      }
      if (payload?.type === "stopped_typing") {
        setPeerTyping(false);
        setEventLog((prev) => [...prev.slice(-30), `recv stopped_typing ${selectedRoom}`]);
        return;
      }
      if (payload?.type === "reaction_update") {
        const messageId = Number(
          payload?.messageId ?? payload?.serverMessageId ?? payload?.id
        );
        if (!Number.isFinite(messageId) || messageId <= 0) return;
        setMessages((prev) =>
          prev.map((m) =>
            Number(m.messageId) === messageId
              ? { ...m, reactions: Array.isArray(payload?.reactions) ? payload.reactions : [] }
              : m
          )
        );
        setEventLog((prev) => [...prev.slice(-30), `recv reaction_update ${messageId}`]);
        return;
      }
      if (payload?.type === "receipt_update") {
        const recipientId = String(payload?.recipientUserId ?? "");
        if (recipientId !== peerIdAtConnect) return;
        const delivered = Boolean(payload.delivered);
        const read = Boolean(payload.read);
        const bulk = Boolean(payload.bulk);
        const ids = Array.isArray(payload.messageIds)
          ? payload.messageIds.map((id) => Number(id)).filter((id) => id > 0)
          : [];
        setMessages((prev) => {
          if (bulk) {
            return prev.map((m) =>
              m.fromMe ? applyReceiptFlags(m, { delivered, read }) : m
            );
          }
          const idSet = new Set(ids);
          return prev.map((m) =>
            m.fromMe && m.messageId && idSet.has(Number(m.messageId))
              ? applyReceiptFlags(m, { delivered, read })
              : m
          );
        });
        setEventLog((prev) => [
          ...prev.slice(-30),
          `recv receipt_update ${read ? "read" : "delivered"} ids=${bulk ? "bulk" : ids.length}`,
        ]);
        return;
      }
      const body = payload?.message || "";
      const recipient = String(payload?.userId ?? "");
      const fromMe = recipient === peerIdAtConnect;
      const resolvedMessageId = Number(
        payload?.serverMessageId ?? payload?.messageId ?? payload?.id
      );
      setEventLog((prev) => [...prev.slice(-30), `recv message_${selectedRoom}`]);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          messageId:
            Number.isFinite(resolvedMessageId) && resolvedMessageId > 0
              ? resolvedMessageId
              : null,
          body,
          type: payload?.type || "text",
          mediaUrl: payload?.mediaUrl || "",
          mediaMimeType: payload?.mediaMimeType || "",
          mediaFileName: payload?.mediaFileName || "",
          reactions: Array.isArray(payload?.reactions) ? payload.reactions : [],
          at: new Date().toLocaleTimeString(),
          fromMe,
          delivered: false,
          read: false,
        },
      ]);
      if (!fromMe) {
        scheduleMarkDelivered();
      }
    });

    receiptEmitRef.current = { markDelivered: emitMarkDelivered, markRead: emitMarkRead };

    socket.on("presence_update", (payload) => {
      const peerId = peerUserId.trim();
      if (!peerId) return;
      if (String(payload?.userId ?? "") !== peerId) return;
      setPeerPresence({
        online: Boolean(payload?.online),
        lastSeenAt: String(payload?.lastSeenAt || ""),
      });
      setEventLog((prev) => [
        ...prev.slice(-30),
        `presence_update ${peerId}: ${payload?.online ? "online" : "offline"}`,
      ]);
    });

    socket.on("presence_snapshot", (payload) => {
      const peerId = peerUserId.trim();
      if (!peerId) return;
      const p = payload?.users?.[peerId];
      if (!p) return;
      setPeerPresence({
        online: Boolean(p?.online),
        lastSeenAt: String(p?.lastSeenAt || ""),
      });
      setEventLog((prev) => [
        ...prev.slice(-30),
        `presence_snapshot ${peerId}: ${p?.online ? "online" : "offline"}`,
      ]);
    });
  };

  const send = () => {
    if (!socketRef.current || status !== "connected") {
      setError("Socket is not connected.");
      return;
    }
    if (!activeRoom) {
      setError("No active room. Reconnect to join a room.");
      return;
    }
    const msg = text.trim();
    const selectedType = messageType;
    const selectedMediaUrl = mediaUrl.trim();
    if (selectedType === "text" && !msg) return;
    if (selectedType !== "text" && !selectedMediaUrl) {
      setError("mediaUrl is required for image/video/file messages.");
      return;
    }
    setPeerTyping(false);

    const recipient = Number(peerUserId.trim());
    socketRef.current.emit("join_room", activeRoom);
    const payload = {
      type: selectedType,
      userId: recipient,
    };
    if (selectedType === "text") {
      payload.message = msg;
    } else {
      if (msg) payload.message = msg; // optional caption
      payload.mediaUrl = selectedMediaUrl;
      if (mediaMimeType.trim()) payload.mediaMimeType = mediaMimeType.trim();
      if (mediaFileName.trim()) payload.mediaFileName = mediaFileName.trim();
      if (mediaFileSize.trim()) {
        const n = Number(mediaFileSize.trim());
        if (!Number.isFinite(n) || n < 0) {
          setError("mediaFileSize must be a non-negative number.");
          return;
        }
        payload.mediaFileSize = n;
      }
    }
    socketRef.current.emit("message", {
      room: activeRoom,
      message: payload,
    });
    setEventLog((prev) => [...prev.slice(-30), `send ${selectedType} -> room ${activeRoom}`]);
    if (isTypingRef.current) {
      socketRef.current.emit("message", {
        room: activeRoom,
        message: { type: "stopped_typing" },
      });
      isTypingRef.current = false;
      setEventLog((prev) => [...prev.slice(-30), `send stopped_typing -> room ${activeRoom}`]);
    }
    setText("");
    if (selectedType !== "text") {
      setMediaUrl("");
      setMediaMimeType("");
      setMediaFileName("");
      setMediaFileSize("");
    }
  };

  const handleTextChange = (nextValue) => {
    setText(nextValue);
    if (!socketRef.current || status !== "connected" || !activeRoom) return;
    const hasContent = nextValue.trim().length > 0;
    if (hasContent && !isTypingRef.current) {
      socketRef.current.emit("message", {
        room: activeRoom,
        message: { type: "typing" },
      });
      isTypingRef.current = true;
      setEventLog((prev) => [...prev.slice(-30), `send typing -> room ${activeRoom}`]);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      if (!socketRef.current || !activeRoom || !isTypingRef.current) return;
      socketRef.current.emit("message", {
        room: activeRoom,
        message: { type: "stopped_typing" },
      });
      isTypingRef.current = false;
      setEventLog((prev) => [...prev.slice(-30), `send stopped_typing -> room ${activeRoom}`]);
    }, 1200);
  };

  const addEmoji = (emoji) => {
    handleTextChange(`${text}${emoji}`);
  };

  const toggleReaction = (message, emoji) => {
    if (!socketRef.current || !activeRoom || !message?.messageId) return;
    const existing =
      Array.isArray(message.reactions) &&
      message.reactions.find((r) => r?.emoji === emoji && r?.reactedByMe);
    socketRef.current.emit("message", {
      room: activeRoom,
      message: {
        type: existing ? "reaction_remove" : "reaction_add",
        messageId: Number(message.messageId),
        emoji,
      },
    });
    setEventLog((prev) => [
      ...prev.slice(-30),
      `${existing ? "remove" : "add"} reaction ${emoji} -> ${message.messageId}`,
    ]);
  };

  const quickLogin = async () => {
    setError("");
    if (!apiBaseUrl.trim() || !email.trim()) {
      setError("Set API base URL and email first.");
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch(`${apiBaseUrl.trim()}/api/auth/tmp-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      const accessToken = json?.data?.accessToken;
      const userId = json?.data?.user?.id;
      if (!accessToken || !userId) {
        throw new Error(json?.error?.message || "tmp-login failed");
      }
      setToken(String(accessToken));
      setLocalUserId(String(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "tmp-login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMediaMimeType(file.type || "");
    setMediaFileName(file.name || "");
    setMediaFileSize(String(file.size || ""));
  };

  const uploadSelectedFile = async () => {
    setError("");
    if (!token.trim()) {
      setError("Set JWT token first (required for /api/auth/asset upload).");
      return;
    }
    if (!apiBaseUrl.trim()) {
      setError("Set API base URL first.");
      return;
    }
    if (!selectedFile) {
      setError("Select a file first.");
      return;
    }
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch(`${apiBaseUrl.trim()}/api/auth/asset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
        body: form,
      });
      const json = await res.json();
      const url = json?.data;
      if (!res.ok || !url) {
        throw new Error(json?.error?.message || "File upload failed");
      }
      setMediaUrl(String(url));
      setEventLog((prev) => [...prev.slice(-30), "upload asset -> mediaUrl set"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "File upload failed");
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <main>
      <h1 className="headline">Modern Chat Test Client</h1>
      <p className="subline">
        Connect to <code>ck_chat</code>, join one DM room, send/receive live messages, and test
        delivery/read receipts over Socket.IO (<code>mark_delivered</code>, <code>mark_read</code>,
        <code>receipt_update</code>).
      </p>
      <p className="small">
        Defaults come from <code>NEXT_PUBLIC_TEST_API_BASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_TEST_CHAT_URL</code> (or localhost fallbacks). You can still edit both
        URLs in the form below.
      </p>

      <div className="card">
        <h3 className="section-title">Quick Auth (Dev)</h3>
        <div className="grid" style={{ marginBottom: 10 }}>
          <input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="API base URL (e.g. http://127.0.0.1:8080)"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="User email for /api/auth/tmp-login"
          />
        </div>
        <div className="toolbar">
          <button disabled={loggingIn} onClick={quickLogin}>
            {loggingIn ? "Logging in..." : "Quick Login (tmp-login)"}
          </button>
        </div>
        <p className="small">
          Fills JWT + My user id automatically. Works only when backend runs with dev profile.
        </p>
      </div>

      <div className="card">
        <h3 className="section-title">Session & Payload</h3>
        <div className="grid">
          <input
            value={chatUrl}
            onChange={(e) => setChatUrl(e.target.value)}
            placeholder="Chat URL (e.g. http://127.0.0.1:3001)"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="JWT token"
          />
          <input
            value={localUserId}
            onChange={(e) => setLocalUserId(e.target.value)}
            placeholder="My user id"
          />
          <input
            value={peerUserId}
            onChange={(e) => setPeerUserId(e.target.value)}
            placeholder="Peer user id"
          />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select
            value={messageType}
            onChange={(e) => setMessageType(e.target.value)}
            style={{ borderRadius: 8, border: "1px solid #384152", background: "#0d111a", color: "#e5e7eb", padding: 10 }}
          >
            <option value="text">text</option>
            <option value="image">image</option>
            <option value="video">video</option>
            <option value="file">file</option>
          </select>
          <input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Media URL (required for image/video/file)"
          />
        </div>
        {messageType !== "text" ? (
          <div className="row" style={{ marginTop: 10 }}>
            <input type="file" onChange={onFileChange} />
            <button onClick={uploadSelectedFile} disabled={uploadingFile || !selectedFile}>
              {uploadingFile ? "Uploading..." : "Upload via /api/auth/asset"}
            </button>
          </div>
        ) : null}
        {messageType !== "text" && selectedFile ? (
          <p className="small">
            Selected file: <code>{selectedFile.name}</code>
          </p>
        ) : null}
        {messageType !== "text" ? (
          <div className="grid" style={{ marginTop: 10 }}>
            <input
              value={mediaMimeType}
              onChange={(e) => setMediaMimeType(e.target.value)}
              placeholder="mediaMimeType (optional)"
            />
            <input
              value={mediaFileName}
              onChange={(e) => setMediaFileName(e.target.value)}
              placeholder="mediaFileName (optional)"
            />
            <input
              value={mediaFileSize}
              onChange={(e) => setMediaFileSize(e.target.value)}
              placeholder="mediaFileSize bytes (optional)"
            />
          </div>
        ) : null}
        <div className="toolbar">
          <button onClick={connect}>Connect + Join Room</button>
          <button onClick={disconnect}>Disconnect</button>
          <button onClick={() => void loadHistory()}>Reload History</button>
          <button onClick={() => setMessages([])}>Clear Messages</button>
        </div>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button
            type="button"
            disabled={status !== "connected"}
            onClick={() => receiptEmitRef.current.markDelivered?.()}
          >
            Mark delivered (socket)
          </button>
          <button
            type="button"
            disabled={status !== "connected"}
            onClick={() => receiptEmitRef.current.markRead?.()}
          >
            Mark read (socket)
          </button>
        </div>
        <p className="small">
          <span className="chip">Status: {status}</span>{" "}
          <span className="chip">Room input: {room || "(invalid)"}</span>{" "}
          <span className="chip">Active room: {activeRoom || "(not joined yet)"}</span>
          {lastReceiptAck ? (
            <span className="chip">
              Last ack: {lastReceiptAck.kind} ({lastReceiptAck.count}) @ {lastReceiptAck.at}
            </span>
          ) : null}
        </p>
        <p className="small">
          Inbound messages auto-send <code>mark_delivered</code> (500ms debounce). Use{" "}
          <code>mark_read</code> when the thread is read. Outbound bubbles show receipt ticks; peer
          updates arrive as <code>receipt_update</code> on <code>message_&lt;room&gt;</code>.
        </p>
        <p className="small">If you change either user id, click Connect + Join Room again.</p>
        {error ? <p style={{ color: "#f87171" }}>Error: {error}</p> : null}
        {eventLog.length ? (
          <p className="small">
            Last events: <code>{eventLog.slice(-4).join(" | ")}</code>
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="section-title">Conversation</h3>
        <div className="status-row">
          <span className={`status-dot ${status === "connected" ? "online" : "offline"}`} />
          <span className="small">You: {status === "connected" ? "online" : "offline"}</span>
          <span className={`status-dot ${peerOnline ? "online" : "offline"}`} />
          <span className="small">
            Peer:{" "}
            {peerTyping
              ? "typing..."
              : peerOnline
                ? "online"
                : peerPresence.lastSeenAt
                  ? `offline (last seen ${new Date(peerPresence.lastSeenAt).toLocaleTimeString()})`
                  : "offline/unknown"}
          </span>
        </div>
        <div className="messages" ref={messagesRef}>
          {messages.length === 0 ? (
            <p className="small">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`msg ${m.fromMe ? "mine" : "other"}`}>
                <div>
                  {(() => {
                    const text =
                      m.body ||
                      m.mediaFileName ||
                      (m.mediaUrl
                        ? decodeURIComponent(String(m.mediaUrl).split("/").pop() || "Attachment")
                        : "");
                    return text.length > 20 ? text.slice(0, 20) + "…" : text;
                  })()}
                </div>
           
                {m.mediaUrl ? (
                  <div className="small" style={{ marginTop: 8 }}>
                    {(() => {
                      const kind = inferMediaKind(m);
                      if (kind === "image") {
                        return (
                          <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                            <img
                              src={m.mediaUrl}
                              alt={m.mediaFileName || "image"}
                              style={{
                                width: 120,
                                height: 120,
                                objectFit: "cover",
                                borderRadius: 8,
                                display: "block",
                              }}
                            />
                          </a>
                        );
                      }
                      if (kind === "video") {
                        return (
                          <video
                            src={m.mediaUrl}
                            controls
                            preload="metadata"
                            style={{ maxWidth: 280, maxHeight: 220, borderRadius: 8, display: "block" }}
                          />
                        );
                      }
                      if (kind === "audio") {
                        return <audio src={m.mediaUrl} controls style={{ width: 260 }} />;
                      }
                      return <FileAttachment message={m} />;
                    })()}
                  </div>
                ) : null}
                <div className="meta">
                  {m.at}
                  <ReceiptTicks message={m} />
                </div>
                {Array.isArray(m.reactions) && m.reactions.length > 0 ? (
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {m.reactions.map((r) => (
                      <button
                        key={`${m.id}-${r.emoji}`}
                        type="button"
                        onClick={() => toggleReaction(m, r.emoji)}
                        style={{
                          width: "auto",
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: r.reactedByMe ? "1px solid #93c5fd" : "1px solid #475569",
                          background: r.reactedByMe ? "rgba(59,130,246,0.25)" : "rgba(15,23,42,0.55)",
                          color: "#dbeafe",
                          fontSize: 12,
                        }}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.messageId ? (
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["👍", "❤️", "😂", "🔥", "🙏"].map((emoji) => (
                      <button
                        key={`${m.id}-quick-${emoji}`}
                        type="button"
                        onClick={() => toggleReaction(m, emoji)}
                        className="emoji-btn"
                        style={{ height: 26, minWidth: 28, padding: "2px 6px", fontSize: 14 }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
          {peerTyping ? <p className="small">Peer is typing...</p> : null}
        </div>
        <div className="emoji-row">
          {QUICK_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="emoji-btn" onClick={() => addEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        <div className="composer">
          <input
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Type message..."
          />
          <button onClick={send} style={{ maxWidth: 160 }}>
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
