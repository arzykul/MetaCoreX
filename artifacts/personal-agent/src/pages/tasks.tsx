import { useState } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Circle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Task = {
  id: number;
  title: string;
  description?: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  in_progress: "В работе",
  done: "Выполнено",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-600",
};

function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "high") return <AlertCircle className="w-3.5 h-3.5" />;
  if (priority === "in_progress") return <Clock className="w-3.5 h-3.5" />;
  return null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (status === "in_progress") return <Clock className="w-5 h-5 text-blue-500" />;
  return <Circle className="w-5 h-5 text-muted-foreground" />;
}

function CreateTaskDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const createTask = useCreateTask();

  const handleSubmit = () => {
    if (!title.trim()) return;
    createTask.mutate(
      { data: { title: title.trim(), description: description || undefined, priority: priority as "low" | "medium" | "high", dueDate: dueDate || undefined } },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setPriority("medium");
          setDueDate("");
          setOpen(false);
          onCreated();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-task" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Задача
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Название</Label>
            <Input
              data-testid="input-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать?"
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div>
            <Label>Описание (необязательно)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подробности..."
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дедлайн</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            data-testid="button-submit-task"
            onClick={handleSubmit}
            disabled={!title.trim() || createTask.isPending}
            className="w-full"
          >
            {createTask.isPending ? "Создаю..." : "Создать задачу"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({ task, onUpdate, onDelete }: { task: Task; onUpdate: () => void; onDelete: () => void }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const cycleStatus = () => {
    const next: Record<string, "pending" | "in_progress" | "done"> = {
      pending: "in_progress",
      in_progress: "done",
      done: "pending",
    };
    updateTask.mutate(
      { id: task.id, data: { status: next[task.status] } },
      { onSuccess: onUpdate }
    );
  };

  const handleDelete = () => {
    deleteTask.mutate({ id: task.id }, { onSuccess: onDelete });
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg group hover:bg-muted/40 transition-colors ${task.status === "done" ? "opacity-60" : ""}`}
      data-testid={`task-row-${task.id}`}
    >
      <button
        onClick={cycleStatus}
        className="shrink-0 hover:scale-110 transition-transform"
        data-testid={`button-toggle-task-${task.id}`}
        disabled={updateTask.isPending}
      >
        <StatusIcon status={task.status} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
        )}
        {task.dueDate && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString("ru-RU")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className={`text-xs ${PRIORITY_COLORS[task.priority]} border-0`}>
          {PRIORITY_LABELS[task.priority]}
        </Badge>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          data-testid={`button-delete-task-${task.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: tasks, isLoading } = useListTasks(
    statusFilter !== "all" ? { status: statusFilter as "pending" | "in_progress" | "done" } : {}
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const groups = {
    pending: tasks?.filter((t) => t.status === "pending") ?? [],
    in_progress: tasks?.filter((t) => t.status === "in_progress") ?? [],
    done: tasks?.filter((t) => t.status === "done") ?? [],
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Задачи</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tasks ? `${tasks.filter(t => t.status === "done").length} из ${tasks.length} выполнено` : ""}
          </p>
        </div>
        <CreateTaskDialog onCreated={invalidate} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "in_progress", "done"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            data-testid={`filter-status-${s}`}
          >
            {s === "all" ? "Все" : STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Задач пока нет. Создайте первую!</p>
        </div>
      ) : statusFilter !== "all" ? (
        <div className="space-y-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task as Task} onUpdate={invalidate} onDelete={invalidate} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([status, items]) =>
            items.length > 0 ? (
              <div key={status}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {STATUS_LABELS[status]} · {items.length}
                </p>
                <div className="space-y-1">
                  {items.map((task) => (
                    <TaskRow key={task.id} task={task as Task} onUpdate={invalidate} onDelete={invalidate} />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
