import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { io, type Socket } from "socket.io-client";

const BASE = import.meta.env.VITE_CAPACITOR === "true" && import.meta.env.VITE_API_BASE_URL
  ? `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, "")}/api`
  : `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/api`;

function getToken() { return localStorage.getItem("ajkmart_vendor_token") || ""; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json.data !== undefined ? json.data : json;
}

interface OtherUser { id: string; name: string | null; ajkId: string | null; roles?: string | null; }
interface Conversation { id: string; otherUser: OtherUser; lastMessage: { content: string } | null; unreadCount: number; lastMessageAt: string | null; }
interface Message { id: string; content: string; senderId: string; messageType: string; createdAt: string; deliveryStatus: string; voiceNoteUrl?: string; imageUrl?: string; }
interface CommRequest { id: string; status: string; senderId: string; sender?: { name: string; ajkId: string; roles?: string | null }; }
interface SearchResult { id: string; name: string; ajkId: string; role: string; isOnline?: boolean; }
interface IncomingCallData { callId: string; callerId: string; callerName?: string; callerAjkId?: string; }
interface CallSignal { callId: string; callerId?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; }

export default function Chat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [sending, setSending] = useState(false);
  const [ajkId, setAjkId] = useState("");
  const [requests, setRequests] = useState<CommRequest[]>([]);
  const [tab, setTab] = useState<"chats" | "requests" | "search">("chats");
  const [typing, setTyping] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const showError = (msg: string) => { setErrorToast(msg); setTimeout(() => setErrorToast(null), 4000); };
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch("/communication/me/ajk-id").then(d => setAjkId(d.ajkId)).catch(() => {});
    loadConversations();
    loadRequests();

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token: getToken() },
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;

    socket.on("comm:message:new", (msg: Message) => {
      setMessages(prev => [...prev, msg]);
      loadConversations();
    });
    socket.on("comm:typing:start", () => setTyping(true));
    socket.on("comm:typing:stop", () => setTyping(false));
    socket.on("comm:message:read", () => {
      setMessages(prev => prev.map(m => ({ ...m, deliveryStatus: "read" })));
    });
    socket.on("comm:request:new", () => loadRequests());
    socket.on("comm:request:accepted", () => { loadConversations(); loadRequests(); });
    socket.on("comm:call:incoming", (data: IncomingCallData) => setIncomingCall(data));
    socket.on("comm:call:ended", () => endCall());
    socket.on("comm:call:rejected", () => endCall());
    socket.on("comm:call:offer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("comm:call:answer", { callId: data.callId, targetUserId: data.callerId, sdp: answer });
    });
    socket.on("comm:call:answer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    });
    socket.on("comm:call:ice-candidate", async (data: CallSignal) => {
      if (!pcRef.current || !data.candidate) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    return () => { socket.disconnect(); };
  }, []);

  const loadConversations = () => apiFetch("/communication/conversations").then(d => setConversations(d)).catch(() => {});
  const loadRequests = () => apiFetch("/communication/requests?type=received").then(d => setRequests(d)).catch(() => {});

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    socketRef.current?.emit("join", `conversation:${conv.id}`);
    const msgs = await apiFetch(`/communication/conversations/${conv.id}/messages`);
    setMessages(msgs);
    await apiFetch(`/communication/conversations/${conv.id}/read-all`, { method: "PATCH" });
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/communication/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: input, messageType: "text" }),
      });
      setMessages(prev => [...prev, msg]);
      setInput("");
      loadConversations();
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    }
    setSending(false);
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try {
      const result = await apiFetch(`/communication/search/${searchId.toUpperCase()}`);
      setSearchResult(result);
    } catch { setSearchResult(null); }
  };

  const sendRequest = async (receiverId: string) => {
    await apiFetch("/communication/requests", { method: "POST", body: JSON.stringify({ receiverId }) });
    setSearchResult(null);
    setSearchId("");
  };

  const acceptRequest = async (id: string) => {
    await apiFetch(`/communication/requests/${id}/accept`, { method: "PATCH" });
    loadRequests();
    loadConversations();
  };

  const rejectRequest = async (id: string) => {
    await apiFetch(`/communication/requests/${id}/reject`, { method: "PATCH" });
    loadRequests();
  };

  const translateMsg = async (text: string, lang: string) => {
    const result = await apiFetch("/communication/translate", { method: "POST", body: JSON.stringify({ text, targetLang: lang }) });
    return result.translated;
  };

  const startCall = async (calleeId: string) => {
    try {
      const data = await apiFetch("/communication/calls/initiate", { method: "POST", body: JSON.stringify({ calleeId, conversationId: selectedConv?.id }) });
      setCallId(data.callId);
      setCallActive(true);
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: data.iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit("comm:call:ice-candidate", { callId: data.callId, targetUserId: calleeId, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("comm:call:offer", { callId: data.callId, targetUserId: calleeId, sdp: offer });
    } catch (err) {
      endCall();
      const isPermission = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      showError(isPermission ? "Microphone access denied. Please allow microphone access to make calls." : "Could not start call. Please try again.");
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    const answerData = await apiFetch(`/communication/calls/${incomingCall.callId}/answer`, { method: "POST" });
    setCallId(incomingCall.callId);
    setCallActive(true);
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    localStreamRef.current = stream;

    const iceServers = answerData.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit("comm:call:ice-candidate", { callId: incomingCall.callId, targetUserId: incomingCall.callerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.srcObject = e.streams[0];
      audio.play();
    };

    setIncomingCall(null);
  };

  const endCall = useCallback(() => {
    if (callId) {
      apiFetch(`/communication/calls/${callId}/end`, { method: "POST", body: JSON.stringify({ duration: callTimer }) }).catch(() => {});
      const otherId = selectedConv ? (selectedConv.otherUser?.id) : null;
      if (otherId) socketRef.current?.emit("comm:call:end", { callId, targetUserId: otherId });
    }
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setCallActive(false);
    setCallId(null);
    setCallTimer(0);
    setIncomingCall(null);
  }, [callId, callTimer, selectedConv]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Error Toast */}
      {errorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold max-w-xs text-center">
          {errorToast}
        </div>
      )}

      {/* Incoming Call Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full mx-4">
            <div className="text-6xl mb-4">📞</div>
            <h2 className="text-xl font-bold mb-2">Incoming Call</h2>
            <p className="text-gray-500 mb-6">{incomingCall.callerName} ({incomingCall.callerAjkId})</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { setIncomingCall(null); apiFetch(`/communication/calls/${incomingCall.callId}/reject`, { method: "POST" }); }} className="w-16 h-16 rounded-full bg-red-500 text-white text-2xl flex items-center justify-center">✕</button>
              <button onClick={answerCall} className="w-16 h-16 rounded-full bg-green-500 text-white text-2xl flex items-center justify-center">📞</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Bar */}
      {callActive && (
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold">🔊 Call Active — {fmt(callTimer)}</span>
          <div className="flex gap-2">
            <button onClick={toggleMute} className={`px-3 py-1 rounded-lg text-sm font-bold ${muted ? "bg-red-500" : "bg-white/20"}`}>{muted ? "Unmute" : "Mute"}</button>
            <button onClick={endCall} className="px-3 py-1 rounded-lg text-sm font-bold bg-red-500">End</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-gray-800">💬 Messages</h1>
          {ajkId && (
            <button onClick={() => navigator.clipboard.writeText(ajkId)} className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full font-bold hover:bg-orange-200 transition">
              {ajkId} 📋
            </button>
          )}
        </div>

        {!selectedConv && (
          <div className="flex gap-1 mb-3">
            {(["chats", "requests", "search"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === t ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "chats" ? "Chats" : t === "requests" ? `Requests${requests.length ? ` (${requests.length})` : ""}` : "Search"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4" ref={scrollRef}>
        {selectedConv ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 py-3 border-b mb-3">
              <button onClick={() => setSelectedConv(null)} className="text-orange-500 font-bold">← Back</button>
              <div className="flex-1">
                <p className="font-bold text-gray-800">{selectedConv.otherUser?.name || "User"}</p>
                <p className="text-xs text-gray-400">{selectedConv.otherUser?.ajkId} · {selectedConv.otherUser?.roles}</p>
              </div>
              <button onClick={() => startCall(selectedConv.otherUser?.id)} className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-lg">📞</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${msg.senderId === user?.id ? "bg-orange-500 text-white rounded-br-md" : "bg-gray-100 text-gray-800 rounded-bl-md"}`}>
                    {msg.messageType === "image" && msg.imageUrl && <img src={msg.imageUrl} alt="" className="rounded-xl mb-1 max-w-full" />}
                    {msg.messageType === "voice_note" && msg.voiceNoteUrl && (
                      <audio controls src={msg.voiceNoteUrl} className="max-w-full" />
                    )}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[10px] ${msg.senderId === user?.id ? "text-orange-200" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.senderId === user?.id && (
                        <span className="text-[10px]">{msg.deliveryStatus === "read" ? "✓✓" : msg.deliveryStatus === "delivered" ? "✓✓" : "✓"}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {typing && <div className="text-xs text-gray-400 italic">typing...</div>}
            </div>
          </div>
        ) : tab === "chats" ? (
          <div className="space-y-2">
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => selectConversation(conv)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition text-left">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                  {(conv.otherUser?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-gray-800 truncate">{conv.otherUser?.name || "User"}</p>
                    {conv.lastMessageAt && <span className="text-[10px] text-gray-400">{new Date(conv.lastMessageAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate">{conv.lastMessage?.content || "No messages yet"}</p>
                    {conv.unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">{conv.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="text-center py-12">
                <p className="text-5xl mb-4">💬</p>
                <p className="text-lg font-bold text-gray-600">No conversations yet</p>
                <p className="text-sm text-gray-400 mt-1">Search for users by AJK ID to start chatting</p>
              </div>
            )}
          </div>
        ) : tab === "requests" ? (
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{req.sender?.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{req.sender?.ajkId} · {req.sender?.roles}</p>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => acceptRequest(req.id)} className="px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-bold">Accept</button>
                    <button onClick={() => rejectRequest(req.id)} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-sm font-bold">Reject</button>
                  </div>
                )}
              </div>
            ))}
            {requests.length === 0 && <p className="text-center py-12 text-gray-400">No pending requests</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Enter AJK ID (e.g., AJK-ABC123)" className="flex-1 h-12 px-4 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-sm" />
              <button onClick={searchUser} className="h-12 px-6 bg-orange-500 text-white rounded-xl font-bold text-sm">Search</button>
            </div>
            {searchResult && (
              <div className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{searchResult.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{searchResult.ajkId} · {searchResult.role}</p>
                  <span className={`text-xs ${searchResult.isOnline ? "text-green-500" : "text-gray-400"}`}>{searchResult.isOnline ? "Online" : "Offline"}</span>
                </div>
                <button onClick={() => sendRequest(searchResult.id)} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold">Send Request</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Input */}
      {selectedConv && (
        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <input value={input} onChange={e => { setInput(e.target.value); socketRef.current?.emit("comm:typing:start", { conversationId: selectedConv.id, userId: user?.id }); }} onBlur={() => socketRef.current?.emit("comm:typing:stop", { conversationId: selectedConv.id, userId: user?.id })} placeholder="Type a message..." className="flex-1 h-12 px-4 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-sm" onKeyDown={e => e.key === "Enter" && sendMessage()} />
            <button onClick={sendMessage} disabled={sending || !input.trim()} className="h-12 px-6 bg-orange-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
