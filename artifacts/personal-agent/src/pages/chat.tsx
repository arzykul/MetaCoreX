import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListOpenrouterConversations,
  useCreateOpenrouterConversation,
  useDeleteOpenrouterConversation,
  useListOpenrouterMessages,
  getListOpenrouterConversationsQueryKey,
  getListOpenrouterMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send, Plus, Trash2, Bot, User, MessageSquare,
  CheckSquare, StickyNote, Bell, ChevronLeft, Loader2,
  Zap, Circle, CheckCircle2, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Message = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
};

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
};

type AutonomousSubtaskEvent = { text: string; index: number; total: number };

const TOOL_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  create_task: { label: "Создаю задачу...", icon: CheckSquare },
  create_note: { label: "Создаю заметку...", icon: StickyNote },
  create_reminder: { label: "Создаю напоминание...", icon: Bell },
  list_tasks: { label: "Получаю задачи...", icon: CheckSquare },
  list_notes: { label: "Получаю заметки...", icon: StickyNote },
  list_reminders: { label: "Получаю напоминания...", icon: Bell },
  remember_fact: { label: "Запоминаю...", icon: Brain },
  recall_facts: { label: "Вспоминаю...", icon: Brain },
  web_search: { label: "Ищу в интернете...", icon: Zap },
};

function ToolIndicator({ tool }: { tool: string }) {
  const info = TOOL_LABELS[tool] ?? { label: `${tool}...`, icon: Loader2 };
  const Icon = info.icon;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs w-fit">
      <Loader2 className="w-3 h-3 animate-spin" />
      <Icon className="w-3 h-3" />
      <span>{info.label}</span>
    </div>
  );
}

function PlanPanel({
  plan,
  currentIdx,
  completed,
  phase,
}: {
  plan: string[];
  currentIdx: number;
  completed: Set<number>;
  phase: string | null;
}) {
  return (
    <div className="mx-auto max-w-[80%] ml-10 mb-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 mb-2.5 text-primary font-semibold text-xs uppercase tracking-wide">
        <Zap className="w-3.5 h-3.5" />
        <span>Автономный план</span>
        {phase === "planning" && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </div>
      <div className="space-y-1.5">
        {plan.map((task, i) => (
          <div key={i} className={cn(
            "flex items-start gap-2 transition-all",
            currentIdx === i && "text-foreground font-medium",
            completed.has(i) && "opacity-50",
          )}>
            {completed.has(i) ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            ) : currentIdx === i ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
            )}
            <span className={cn(completed.has(i) && "line-through")}>{task}</span>
          </div>
        ))}
      </div>
      {phase === "reflection" && (
        <div className="mt-2.5 pt-2 border-t border-primary/10 text-xs text-muted-foreground flex items-center gap-1.5">
          <Brain className="w-3 h-3" />
          <span>Анализирую результаты и сохраняю навыки...</span>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={cn("max-w-[80%] flex flex-col", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm"
        )}>
          {message.content}
        </div>
        <span className="text-xs text-muted-foreground/50 mt-1 px-1">
          {new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function StreamingBubble({ content, tool }: { content: string; tool: string | null }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-1">
        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="max-w-[80%] flex flex-col items-start gap-2">
        {tool && <ToolIndicator tool={tool} />}
        {content ? (
          <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border text-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {content}
            <span className="inline-block w-0.5 h-4 bg-foreground/50 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        ) : !tool ? (
          <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border">
            <div className="flex gap-1 items-center h-4">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm text-foreground">Диалоги</h2>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onNew} data-testid="button-new-conversation">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Нет диалогов</p>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center justify-between gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                activeId === c.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
              onClick={() => onSelect(c.id)}
              data-testid={`conversation-item-${c.id}`}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                  activeId === c.id ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"
                )}
                data-testid={`button-delete-conversation-${c.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function generateTitle(content: string): string {
  const trimmed = content.trim().slice(0, 40);
  return trimmed.length < content.trim().length ? trimmed + "…" : trimmed;
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Autonomous mode state
  const [autoMode, setAutoMode] = useState(false);
  const [autonomousPlan, setAutonomousPlan] = useState<string[] | null>(null);
  const [currentSubtaskIdx, setCurrentSubtaskIdx] = useState<number>(-1);
  const [completedSubtasks, setCompletedSubtasks] = useState<Set<number>>(new Set());
  const [autonomousPhase, setAutonomousPhase] = useState<string | null>(null);

  const { data: conversations = [] } = useListOpenrouterConversations();
  const { data: messages = [], isLoading: msgsLoading } = useListOpenrouterMessages(
    activeConvId ?? 0,
    { query: { queryKey: getListOpenrouterMessagesQueryKey(activeConvId ?? 0), enabled: activeConvId !== null } }
  );
  const createConversation = useCreateOpenrouterConversation();
  const deleteConversation = useDeleteOpenrouterConversation();

  const invalidateConversations = () =>
    queryClient.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
  const invalidateMessages = useCallback(() => {
    if (activeConvId !== null)
      queryClient.invalidateQueries({ queryKey: getListOpenrouterMessagesQueryKey(activeConvId) });
  }, [queryClient, activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, activeTool, autonomousPlan, currentSubtaskIdx]);

  const resetAutonomousState = () => {
    setAutonomousPlan(null);
    setCurrentSubtaskIdx(-1);
    setCompletedSubtasks(new Set());
    setAutonomousPhase(null);
  };

  const handleNewConversation = () => {
    createConversation.mutate(
      { data: { title: "Новый диалог" } },
      {
        onSuccess: (conv) => {
          invalidateConversations();
          setActiveConvId(conv.id);
          setShowSidebar(false);
        },
      }
    );
  };

  const handleDeleteConversation = (id: number) => {
    deleteConversation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateConversations();
          if (activeConvId === id) setActiveConvId(null);
        },
      }
    );
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    let convId = activeConvId;

    if (convId === null) {
      const title = generateTitle(content);
      const conv = await new Promise<Conversation>((resolve) => {
        createConversation.mutate(
          { data: { title } },
          { onSuccess: (c) => { invalidateConversations(); resolve(c as Conversation); } }
        );
      });
      convId = conv.id;
      setActiveConvId(convId);
      setShowSidebar(false);
    }

    setInput("");
    setStreaming(true);
    setStreamContent("");
    setActiveTool(null);
    resetAutonomousState();

    await queryClient.invalidateQueries({ queryKey: getListOpenrouterMessagesQueryKey(convId) });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/openrouter/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, autonomous: autoMode }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              tool?: string;
              content?: string;
              done?: boolean;
              error?: string;
              status?: string;
              autonomous_phase?: string;
              autonomous_plan?: string[];
              autonomous_subtask?: AutonomousSubtaskEvent;
              autonomous_subtask_done?: number;
            };

            if (data.tool) {
              setActiveTool(data.tool);
            } else if (data.content) {
              setActiveTool(null);
              setStreamContent((prev) => prev + data.content);
            } else if (data.autonomous_plan) {
              setAutonomousPlan(data.autonomous_plan);
              setCurrentSubtaskIdx(-1);
              setCompletedSubtasks(new Set());
            } else if (data.autonomous_subtask) {
              setCurrentSubtaskIdx(data.autonomous_subtask.index);
              setStreamContent("");
            } else if (data.autonomous_subtask_done !== undefined) {
              setCompletedSubtasks((prev) => new Set([...prev, data.autonomous_subtask_done as number]));
              setCurrentSubtaskIdx(-1);
              setStreamContent("");
            } else if (data.autonomous_phase) {
              setAutonomousPhase(data.autonomous_phase);
              if (data.autonomous_phase === "reflection") setStreamContent("");
            } else if (data.done) {
              setStreaming(false);
              setStreamContent("");
              setActiveTool(null);
              invalidateMessages();
              setTimeout(resetAutonomousState, 2000);
            } else if (data.error) {
              setStreamContent(data.error);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setStreamContent("Ошибка подключения. Попробуйте ещё раз.");
      }
    } finally {
      setStreaming(false);
      setActiveTool(null);
    }
  };

  const SUGGESTIONS = [
    "Помоги организовать мой день",
    "Создай задачу: купить продукты",
    "Что я должен сделать сегодня?",
    "Запомни заметку: идея для проекта",
  ];

  const AUTO_SUGGESTIONS = [
    "Исследуй тему искусственного интеллекта",
    "Спланируй мою рабочую неделю",
    "Помоги мне стать продуктивнее",
  ];

  return (
    <div className="flex h-[calc(100dvh-0px)] overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "border-r bg-sidebar flex-col shrink-0 transition-all",
        showSidebar ? "flex w-64" : "hidden md:flex md:w-64"
      )}>
        <ConversationList
          conversations={conversations as Conversation[]}
          activeId={activeConvId}
          onSelect={(id) => { setActiveConvId(id); setShowSidebar(false); }}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3 shrink-0">
          <button
            className="md:hidden p-1 rounded hover:bg-muted"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? <ChevronLeft className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-serif font-bold text-foreground truncate">
              {activeConvId
                ? (conversations as Conversation[]).find(c => c.id === activeConvId)?.title ?? "Диалог"
                : "Ассистент"}
            </h1>
            <p className="text-xs text-muted-foreground">
              LLaMA 3.3 70B · {autoMode ? "🤖 Автономный режим" : "Обычный режим"}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeConvId === null ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Bot className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Начните разговор</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {autoMode
                    ? "Авторежим: агент сам составит план и выполнит каждый шаг."
                    : "Я могу создавать задачи, заметки и напоминания прямо из чата."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {(autoMode ? AUTO_SUGGESTIONS : SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : msgsLoading ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-2/3 rounded-2xl" />)}
            </div>
          ) : (
            <>
              {(messages as Message[]).map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {streaming && (
                <>
                  {autonomousPlan && (
                    <PlanPanel
                      plan={autonomousPlan}
                      currentIdx={currentSubtaskIdx}
                      completed={completedSubtasks}
                      phase={autonomousPhase}
                    />
                  )}
                  <StreamingBubble content={streamContent} tool={activeTool} />
                </>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2 items-end">
            {/* Auto mode toggle */}
            <button
              onClick={() => setAutoMode((v) => !v)}
              title={autoMode ? "Выключить автономный режим" : "Включить автономный режим"}
              className={cn(
                "shrink-0 h-11 w-11 rounded-lg flex items-center justify-center transition-all border",
                autoMode
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                  : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              <Zap className={cn("w-4 h-4", autoMode && "fill-current")} />
            </button>

            <Textarea
              data-testid="input-chat-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={autoMode
                ? "Дайте сложную задачу — агент сам составит план..."
                : "Напишите сообщение... (Enter — отправить)"}
              className="resize-none min-h-[44px] max-h-32 flex-1"
              rows={1}
              disabled={streaming}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              data-testid="button-send-message"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              size="icon"
              className="shrink-0 h-11 w-11"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            {autoMode
              ? "⚡ Автономный режим — агент планирует, выполняет и учится"
              : "Shift+Enter — новая строка · Агент сам создаёт задачи, заметки и напоминания"}
          </p>
        </div>
      </div>
    </div>
  );
}
