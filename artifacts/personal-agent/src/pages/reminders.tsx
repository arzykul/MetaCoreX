import { useState } from "react";
import {
  useListReminders,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  getListRemindersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Bell, BellOff, Trash2, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Reminder = {
  id: number;
  title: string;
  remindAt: string;
  done: boolean;
  createdAt: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(iso: string, done: boolean) {
  return !done && new Date(iso) < new Date();
}

function isUpcoming(iso: string, done: boolean) {
  const diff = new Date(iso).getTime() - Date.now();
  return !done && diff > 0 && diff < 24 * 60 * 60 * 1000;
}

function CreateReminderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [datetime, setDatetime] = useState("");
  const createReminder = useCreateReminder();

  const handleSubmit = () => {
    if (!title.trim() || !datetime) return;
    createReminder.mutate(
      { data: { title: title.trim(), remindAt: new Date(datetime).toISOString() } },
      {
        onSuccess: () => {
          setTitle("");
          setDatetime("");
          setOpen(false);
          onCreated();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-reminder" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Напоминание
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое напоминание</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Что напомнить</Label>
            <Input
              data-testid="input-reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="О чём напомнить?"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label>Дата и время</Label>
            <Input
              data-testid="input-reminder-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            data-testid="button-submit-reminder"
            onClick={handleSubmit}
            disabled={!title.trim() || !datetime || createReminder.isPending}
            className="w-full"
          >
            {createReminder.isPending ? "Создаю..." : "Создать напоминание"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderRow({ reminder, onUpdate, onDelete }: { reminder: Reminder; onUpdate: () => void; onDelete: () => void }) {
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();

  const toggleDone = () => {
    updateReminder.mutate({ id: reminder.id, data: { done: !reminder.done } }, { onSuccess: onUpdate });
  };

  const handleDelete = () => {
    deleteReminder.mutate({ id: reminder.id }, { onSuccess: onDelete });
  };

  const overdue = isOverdue(reminder.remindAt, reminder.done);
  const upcoming = isUpcoming(reminder.remindAt, reminder.done);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg group hover:bg-muted/40 transition-colors ${reminder.done ? "opacity-50" : ""}`}
      data-testid={`reminder-row-${reminder.id}`}
    >
      <button
        onClick={toggleDone}
        className="shrink-0 hover:scale-110 transition-transform"
        data-testid={`button-toggle-reminder-${reminder.id}`}
        disabled={updateReminder.isPending}
      >
        {reminder.done ? (
          <BellOff className="w-5 h-5 text-muted-foreground" />
        ) : (
          <Bell className={`w-5 h-5 ${overdue ? "text-red-500" : upcoming ? "text-amber-500" : "text-blue-500"}`} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${reminder.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {reminder.title}
        </p>
        <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
          <Clock className="w-3 h-3" />
          {formatDateTime(reminder.remindAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {overdue && !reminder.done && <Badge className="text-xs bg-red-100 text-red-600 border-0">Просрочено</Badge>}
        {upcoming && <Badge className="text-xs bg-amber-100 text-amber-700 border-0">Скоро</Badge>}
        {reminder.done && <Badge variant="secondary" className="text-xs">Выполнено</Badge>}
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          data-testid={`button-delete-reminder-${reminder.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function RemindersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "upcoming" | "done">("all");
  const { data: reminders, isLoading } = useListReminders(
    filter === "upcoming" ? { upcoming: true } : {}
  );
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });

  const displayed =
    filter === "done" ? reminders?.filter((r) => r.done) : reminders;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Напоминания</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {reminders ? `${reminders.filter((r) => !r.done).length} активных` : ""}
          </p>
        </div>
        <CreateReminderDialog onCreated={invalidate} />
      </div>

      <div className="flex gap-2">
        {(["all", "upcoming", "done"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-reminder-${f}`}
          >
            {f === "all" ? "Все" : f === "upcoming" ? "Предстоящие" : "Выполненные"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : !displayed || displayed.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Напоминаний нет. Создайте первое!</p>
        </div>
      ) : (
        <div className="space-y-1">
          {displayed.map((r) => (
            <ReminderRow key={r.id} reminder={r as Reminder} onUpdate={invalidate} onDelete={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
