import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useSocket } from "../lib/socket";
import { playRequestSound, stopSound } from "../lib/notificationSound";

interface OtherUser { id: string; name: string | null; ajkId: string | null; }
interface Conversation { id: string; otherUser: OtherUser; lastMessage: { content: string } | null; unreadCount: number; lastMessageAt: string | null; }
interface Message { id: string; content: string; senderId: string; messageType: string; createdAt: string; deliveryStatus: string; voiceNoteUrl?: string; }
interface CommRequest { id: string; status: string; sender?: { name: string; ajkId: string }; }
interface SearchResult { id: string; name: string; ajkId: string; role: string; }
interface IncomingCallData { callId: string; callerId: string; callerName?: string; callerAjkId?: string; }
interface CallSignal { callId: string; callerId?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; }

export default function Chat() {
  const { user } = useAuth();
  const { socket } = useSocket();
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
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trickleIceRef = useRef<boolean | null>(null);

  /* Initialize remote audio element (reused for all tracks) */
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      remoteAudioRef.current = audio;
    }
  }, []);

  /* Socket event listeners - keyed on user?.id to rebind on user change */
  useEffect(() => {
    if (!socket || !user?.id) return;

    api.apiFetch("/communication/me/ajk-id").then(d => setAjkId(d.ajkId)).catch(() => {});
    loadConversations();
    loadRequests();

    socket.on("comm:message:new", (msg: Message) => { setMessages(prev => [...prev, msg]); loadConversations(); });
    socket.on("comm:typing:start", () => setTyping(true));
    socket.on("comm:typing:stop", () => setTyping(false));
    socket.on("comm:message:read", () => setMessages(prev => prev.map(m => ({ ...m, deliveryStatus: "read" }))));
    socket.on("comm:request:new", () => loadRequests());
    socket.on("comm:request:accepted", () => { loadConversations(); loadRequests(); });
    socket.on("comm:call:incoming", async (data: IncomingCallData) => {
      setIncomingCall(data);
      playRequestSound(); /* Play ring tone on incoming call (C7, PWA7) */
    });
    socket.on("comm:call:ended", () => { stopSound(); endCall(); });
    socket.on("comm:call:rejected", () => { stopSound(); endCall(); });
    socket.on("comm:call:offer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      if (trickleIceRef.current === false) {
        await new Promise<void>(resolve => {
          if (!pcRef.current) { resolve(); return; }
          pcRef.current.onicegatheringstatechange = () => { if (pcRef.current?.iceGatheringState === "complete") resolve(); };
          setTimeout(resolve, 5000);
        });
      }
      socket.emit("comm:call:answer", { callId: data.callId, targetUserId: data.callerId, sdp: pcRef.current?.localDescription });
    });
    socket.on("comm:call:answer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    });
    socket.on("comm:call:ice-candidate", async (data: CallSignal) => {
      if (!pcRef.current || !data.candidate) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    return () => {
      socket.removeAllListeners("comm:message:new");
      socket.removeAllListeners("comm:typing:start");
      socket.removeAllListeners("comm:typing:stop");
      socket.removeAllListeners("comm:message:read");
      socket.removeAllListeners("comm:request:new");
      socket.removeAllListeners("comm:request:accepted");
      socket.removeAllListeners("comm:call:incoming");
      socket.removeAllListeners("comm:call:ended");
      socket.removeAllListeners("comm:call:rejected");
      socket.removeAllListeners("comm:call:offer");
      socket.removeAllListeners("comm:call:answer");
      socket.removeAllListeners("comm:call:ice-candidate");
    };
  }, [socket, user?.id]);

  const loadConversations = () => api.apiFetch("/communication/conversations").then(setConversations).catch(() => {});
  const loadRequests = () => api.apiFetch("/communication/requests?type=received").then(setRequests).catch(() => {});

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    if (socket) socket.emit("join", `conversation:${conv.id}`);
    try {
      const msgs = await api.apiFetch(`/communication/conversations/${conv.id}/messages`);
      setMessages(msgs);
      await api.apiFetch(`/communication/conversations/${conv.id}/read-all`, { method: "PATCH" });
      setSendError(null);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to load messages");
    }
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConv || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await api.apiFetch(`/communication/conversations/${selectedConv.id}/messages`, { method: "POST", body: JSON.stringify({ content: input, messageType: "text" }) });
      setMessages(prev => [...prev, msg]);
      setInput("");
      loadConversations();
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to send message");
    }
    setSending(false);
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try { 
      const result = await api.apiFetch(`/communication/search/${searchId.toUpperCase()}`);
      setSearchResult(result);
    } catch { 
      setSearchResult(null); 
    }
  };

  const sendRequest = async (receiverId: string) => {
    try {
      await api.apiFetch("/communication/requests", { method: "POST", body: JSON.stringify({ receiverId }) });
      setSearchResult(null);
      setSearchId("");
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to send request");
    }
  };

  const acceptRequest = async (id: string) => { 
    try {
      await api.apiFetch(`/communication/requests/${id}/accept`, { method: "PATCH" }); 
      loadRequests(); 
      loadConversations(); 
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to accept request");
    }
  };

  const rejectRequest = async (id: string) => { 
    try {
      await api.apiFetch(`/communication/requests/${id}/reject`, { method: "PATCH" }); 
      loadRequests(); 
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to reject request");
    }
  };

  const startCall = async (calleeId: string) => {
    try {
      if (pcRef.current) pcRef.current.close(); /* Close any prior peer connection (S8) */
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      
      const data = await api.apiFetch("/communication/calls/initiate", { method: "POST", body: JSON.stringify({ calleeId, conversationId: selectedConv?.id }) });
      setCallId(data.callId);
      setCallActive(true);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;
      const trickleIce = data.trickleIce !== false;
      trickleIceRef.current = trickleIce;
      
      const pc = new RTCPeerConnection({ iceServers: data.iceServers, iceCandidatePoolSize: 10 });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      
      pc.onicecandidate = (e) => {
        if (e.candidate && trickleIce && socket) {
          socket.emit("comm:call:ice-candidate", { callId: data.callId, targetUserId: calleeId, candidate: e.candidate });
        }
      };
      
      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {
            setSendError("Remote audio playback denied. Tap to enable audio.");
          });
        }
      };
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!trickleIce) {
        await new Promise<void>(resolve => {
          pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") resolve(); };
          setTimeout(resolve, 5000);
        });
      }
      socket?.emit("comm:call:offer", { callId: data.callId, targetUserId: calleeId, sdp: pc.localDescription });
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to start call");
    }
  };

  const endCall = useCallback(() => {
    stopSound();
    if (callId) {
      api.apiFetch(`/communication/calls/${callId}/end`, { method: "POST", body: JSON.stringify({ duration: callTimer }) }).catch(() => {});
      const otherId = selectedConv?.otherUser?.id;
      if (otherId && socket) socket.emit("comm:call:end", { callId, targetUserId: otherId });
    }
    /* Clean up peer connection, media streams, and timer (S6) */
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallActive(false);
    setCallId(null);
    setCallTimer(0);
    setIncomingCall(null);
    trickleIceRef.current = null;
  }, [callId, callTimer, selectedConv, socket]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleAcceptCall = async () => {
    try {
      if (!incomingCall) return;
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      
      const ad = await api.apiFetch(`/communication/calls/${incomingCall.callId}/answer`, { method: "POST" });
      setCallActive(true);
      setCallId(incomingCall.callId);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;
      const trickleIce = ad.trickleIce !== false;
      trickleIceRef.current = trickleIce;
      
      const pc = new RTCPeerConnection({ iceServers: ad.iceServers || [{ urls: "stun:stun.l.google.com:19302" }], iceCandidatePoolSize: 10 });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      
      pc.onicecandidate = (e) => {
        if (e.candidate && trickleIce && socket) {
          socket.emit("comm:call:ice-candidate", { callId: incomingCall.callId, targetUserId: incomingCall.callerId, candidate: e.candidate });
        }
      };
      
      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {
            setSendError("Remote audio playback denied. Tap to enable audio.");
          });
        }
      };
      
      setIncomingCall(null);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to answer call");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full mx-4">
            <div className="text-6xl mb-4">📞</div>
            <h2 className="text-xl font-bold mb-2">Incoming Call</h2>
            <p className="text-gray-500 mb-6">{incomingCall.callerName} ({incomingCall.callerAjkId})</p>
            <div className="flex gap-4 justify-center">
              <button onClick={async () => { 
                setIncomingCall(null); 
                stopSound();
                if (incomingCall) {
                  try {
                    await api.apiFetch(`/communication/calls/${incomingCall.callId}/reject`, { method: "POST" });
                  } catch (e) {
                    setSendError((e as Error)?.message || "Failed to reject call");
                  }
                } 
              }} className="w-16 h-16 rounded-full bg-red-500 text-white text-2xl flex items-center justify-center">✕</button>
              <button onClick={handleAcceptCall} className="w-16 h-16 rounded-full bg-green-500 text-white text-2xl flex items-center justify-center">📞</button>
            </div>
          </div>
        </div>
      )}

      {callActive && (
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold">🔊 Call Active — {fmt(callTimer)}</span>
          <div className="flex gap-2">
            <button onClick={toggleMute} className={`px-3 py-1 rounded-lg text-sm font-bold ${muted ? "bg-red-500" : "bg-white/20"}`}>{muted ? "Unmute" : "Mute"}</button>
            <button onClick={endCall} className="px-3 py-1 rounded-lg text-sm font-bold bg-red-500">End</button>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-gray-800">💬 Messages</h1>
          {ajkId && <button onClick={() => navigator.clipboard.writeText(ajkId)} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-bold">{ajkId} 📋</button>}
        </div>
        {!selectedConv && (
          <div className="flex gap-1 mb-3">
            {(["chats", "requests", "search"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === t ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                {t === "chats" ? "Chats" : t === "requests" ? `Requests${requests.length ? ` (${requests.length})` : ""}` : "Search"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4" ref={scrollRef}>
        {selectedConv ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 py-3 border-b mb-3">
              <button onClick={() => setSelectedConv(null)} className="text-emerald-500 font-bold">← Back</button>
              <div className="flex-1">
                <p className="font-bold text-gray-800">{selectedConv.otherUser?.name || "User"}</p>
                <p className="text-xs text-gray-400">{selectedConv.otherUser?.ajkId}</p>
              </div>
              <button onClick={() => startCall(selectedConv.otherUser?.id)} className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-lg">📞</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${msg.senderId === user?.id ? "bg-emerald-500 text-white rounded-br-md" : "bg-gray-100 text-gray-800 rounded-bl-md"}`}>
                    <p className="text-sm">{msg.content}</p>
                    <span className={`text-[10px] ${msg.senderId === user?.id ? "text-emerald-200" : "text-gray-400"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {msg.senderId === user?.id && (msg.deliveryStatus === "read" ? " ✓✓" : " ✓")}
                    </span>
                  </div>
                </div>
              ))}
              {typing && <div className="text-xs text-gray-400 italic">typing...</div>}
            </div>
          </div>
        ) : tab === "chats" ? (
          <div className="space-y-2">
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => selectConversation(conv)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 text-left">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                  {(conv.otherUser?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between"><p className="font-bold truncate">{conv.otherUser?.name || "User"}</p></div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate">{conv.lastMessage?.content || "No messages"}</p>
                    {conv.unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">{conv.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && <div className="text-center py-12"><p className="text-5xl mb-4">💬</p><p className="font-bold text-gray-600">No conversations yet</p></div>}
          </div>
        ) : tab === "requests" ? (
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div><p className="font-bold">{req.sender?.name || "Unknown"}</p><p className="text-xs text-gray-400">{req.sender?.ajkId}</p></div>
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
              <input value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Enter AJK ID" className="flex-1 h-12 px-4 rounded-xl border outline-none" />
              <button onClick={searchUser} className="h-12 px-6 bg-emerald-500 text-white rounded-xl font-bold text-sm">Search</button>
            </div>
            {searchResult && (
              <div className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div><p className="font-bold">{searchResult.name}</p><p className="text-xs text-gray-400">{searchResult.ajkId} · {searchResult.role}</p></div>
                <button onClick={() => sendRequest(searchResult.id)} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold">Send Request</button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedConv && (
        <div className="p-4 border-t bg-white">
          {sendError && (
            <div className="mb-3 p-3 bg-red-50 rounded-lg text-red-600 text-sm">
              {sendError}
              <button onClick={() => setSendError(null)} className="ml-2 text-red-700 font-bold">✕</button>
            </div>
          )}
          <div className="flex gap-2">
            <input value={input} onChange={e => { setInput(e.target.value); socket?.emit("comm:typing:start", { conversationId: selectedConv.id, userId: user?.id }); }} onBlur={() => socket?.emit("comm:typing:stop", { conversationId: selectedConv.id, userId: user?.id })} placeholder="Type a message..." className="flex-1 h-12 px-4 rounded-xl border outline-none" onKeyDown={e => e.key === "Enter" && sendMessage()} />
            <button onClick={sendMessage} disabled={sending} className="h-12 px-6 bg-emerald-500 text-white rounded-xl font-bold disabled:opacity-50">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
