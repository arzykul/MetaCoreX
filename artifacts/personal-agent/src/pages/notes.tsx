import { useState } from "react";
import {
  useListNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  getListNotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pin, PinOff, Trash2, Edit3, StickyNote, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Note = {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function CreateNoteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const createNote = useCreateNote();

  const handleSubmit = () => {
    if (!title.trim()) return;
    createNote.mutate(
      { data: { title: title.trim(), content } },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setOpen(false);
          onCreated();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-note" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Заметка
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая заметка</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Заголовок</Label>
            <Input
              data-testid="input-note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название заметки"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label>Содержание</Label>
            <Textarea
              data-testid="input-note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Запишите свои мысли..."
              className="mt-1"
              rows={5}
            />
          </div>
          <Button
            data-testid="button-submit-note"
            onClick={handleSubmit}
            disabled={!title.trim() || createNote.isPending}
            className="w-full"
          >
            {createNote.isPending ? "Сохраняю..." : "Сохранить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NoteCard({ note, onUpdate, onDelete }: { note: Note; onUpdate: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const togglePin = () => {
    updateNote.mutate({ id: note.id, data: { pinned: !note.pinned } }, { onSuccess: onUpdate });
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    updateNote.mutate(
      { id: note.id, data: { title: editTitle.trim(), content: editContent } },
      {
        onSuccess: () => {
          setEditing(false);
          onUpdate();
        },
      }
    );
  };

  const handleDelete = () => {
    deleteNote.mutate({ id: note.id }, { onSuccess: onDelete });
  };

  if (editing) {
    return (
      <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-card shadow-sm">
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="font-semibold"
          autoFocus
        />
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={4}
          placeholder="Содержание заметки..."
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveEdit} disabled={!editTitle.trim() || updateNote.isPending} className="gap-1">
            <Check className="w-3.5 h-3.5" /> Сохранить
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditTitle(note.title); setEditContent(note.content); }} className="gap-1">
            <X className="w-3.5 h-3.5" /> Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group border border-border rounded-xl p-4 bg-card hover:shadow-md transition-all"
      data-testid={`note-card-${note.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-foreground text-sm leading-tight flex items-center gap-2">
          {note.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          {note.title}
        </h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={togglePin}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-amber-500 transition-colors"
            data-testid={`button-pin-note-${note.id}`}
          >
            {note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`button-edit-note-${note.id}`}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            data-testid={`button-delete-note-${note.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {note.content && (
        <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{note.content}</p>
      )}
      <p className="text-xs text-muted-foreground/60 mt-3">
        {new Date(note.updatedAt ?? note.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
      </p>
    </div>
  );
}

export default function NotesPage() {
  const queryClient = useQueryClient();
  const { data: notes, isLoading } = useListNotes();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });

  const pinned = notes?.filter((n) => n.pinned) ?? [];
  const unpinned = notes?.filter((n) => !n.pinned) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Заметки</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {notes ? `${notes.length} заметок` : ""}
          </p>
        </div>
        <CreateNoteDialog onCreated={invalidate} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      ) : !notes || notes.length === 0 ? (
        <div className="text-center py-16">
          <StickyNote className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Заметок пока нет. Создайте первую!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Pin className="w-3 h-3" /> Закреплённые
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinned.map((note) => (
                  <NoteCard key={note.id} note={note as Note} onUpdate={invalidate} onDelete={invalidate} />
                ))}
              </div>
            </div>
          )}
          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Все заметки</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unpinned.map((note) => (
                  <NoteCard key={note.id} note={note as Note} onUpdate={invalidate} onDelete={invalidate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
