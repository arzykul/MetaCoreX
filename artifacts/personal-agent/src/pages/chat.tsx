import { useState, useRef, useEffect } from "react";
import {
  useListChatMessages,
  useSendChatMessage,
  useDeleteChatMessage,
  getListChatMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, Bot, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function MessageBubble({ message, onDelete }: { message: Message; onDelete: () => void }) {
  const isUser = message.role === "user";
  const deleteMsg = useDeleteChatMessage();

  return (
    <div className={`flex gap-3 group ${isUser ? "flex-row-reverse" : "flex-row"}`} data-testid={`message-${message.id}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm"
        }`}>
          {message.content}
        </div>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-xs text-muted-foreground/60">
            {new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={() => deleteMsg.mutate({ id: message.id }, { onSuccess: onDelete })}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            data-testid={`button-delete-message-${message.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useListChatMessages({ limit: 100 });
  const sendMessage = useSendChatMessage();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey() });

  const handleSend = () => {
    const content = input.trim();
    if (!content || sendMessage.isPending) return;
    setInput("");
    sendMessage.mutate({ data: { content } }, { onSuccess: invalidate });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-2rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-border shrink-0">
        <h1 className="text-2xl font-serif font-bold text-foreground">Ассистент</h1>
        <p className="text-muted-foreground text-sm mt-1">Ваш персональный AI-помощник</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-3/4 rounded-2xl" />)}
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="font-medium text-foreground">Начните разговор</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Спросите меня о чём угодно — задачах, напоминаниях, заметках или просто поговорите.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {["Помоги организовать день", "Что я должен сделать?", "Создай список задач"].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg as Message} onDelete={invalidate} />
            ))}
            {sendMessage.isPending && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            data-testid="input-chat-message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишите сообщение..."
            className="resize-none min-h-[44px] max-h-32 flex-1"
            rows={1}
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
            disabled={!input.trim() || sendMessage.isPending}
            size="icon"
            className="shrink-0 h-11 w-11"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">Enter — отправить · Shift+Enter — новая строка</p>
      </div>
    </div>
  );
}
