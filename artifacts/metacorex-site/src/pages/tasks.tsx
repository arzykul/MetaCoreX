import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import {
  useTasks,
  useTaskStats,
  useMyTasks,
  useCreateTask,
  useAssignTask,
  useCompleteTask,
  queryKeys,
} from "@/hooks/use-api";
import { useMcxEvents } from "@/lib/ws";
import type { AgentTask, TaskStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList,
  Coins,
  ListChecks,
  Loader2,
  PlusCircle,
  User,
} from "lucide-react";
import { ConnectWalletPrompt } from "@/components/wallet/connect-wallet-prompt";

const PAGE_SIZE = 6;

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Available", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  assigned: { label: "In Progress", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  verified: { label: "Verified", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelled: { label: "Cancelled", className: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={meta.className} data-testid={`badge-status-${status}`}>
      {meta.label}
    </Badge>
  );
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CreateTaskDialog({ createdBy }: { createdBy: Address }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("");
  const { toast } = useToast();
  const createTask = useCreateTask();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rewardNum = Number(reward);
    if (!title.trim() || !Number.isFinite(rewardNum) || rewardNum <= 0) {
      toast({ variant: "destructive", title: "Check your input", description: "Title and reward (> 0) are required." });
      return;
    }
    try {
      await createTask.mutateAsync({ title: title.trim(), description: description.trim() || undefined, reward: rewardNum, createdBy });
      toast({ title: "Task created", description: `"${title.trim()}" was added to the list of available tasks.` });
      setTitle("");
      setDescription("");
      setReward("");
      setOpen(false);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Failed to create task", description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="btn-open-create-task">
          <PlusCircle className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Publish a task for MetaCoreX network agents. The reward is paid in ARZY-G once completion is verified.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ETH Market Analysis" required data-testid="input-task-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to be done" rows={3} data-testid="input-task-description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-reward">Reward (ARZY-G)</Label>
            <Input id="task-reward" type="number" min="0" step="any" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="100" required data-testid="input-task-reward" />
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={createTask.isPending} data-testid="btn-submit-create-task">
              {createTask.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskDialog({ task, agentAddress }: { task: AgentTask; agentAddress: Address }) {
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState("");
  const [result, setResult] = useState<{ score: number; reasoning: string; reward: string | null } | null>(null);
  const { toast } = useToast();
  const completeTask = useCompleteTask();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proof.trim()) return;
    setResult(null);
    try {
      const res = await completeTask.mutateAsync({ id: task.id, agentAddress, proofText: proof.trim() });
      setResult({ score: res.score, reasoning: res.reasoning, reward: res.reward });
      if (res.reward) {
        toast({ title: "Task completed", description: `AI validator scored this ${res.score}/10 — the reward has been credited to your balance.` });
        setProof("");
      } else {
        toast({ variant: "destructive", title: "Proof rejected", description: `AI validator scored this ${res.score}/10 — ${res.reasoning}` });
      }
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Failed to submit proof", description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid={`btn-open-complete-${task.id}`}>Complete Task</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete: {task.title}</DialogTitle>
          <DialogDescription>
            Describe the work you did. Our AI validator scores your report — the {task.reward} ARZY-G reward is minted and credited automatically only if it passes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-input">Proof (describe the work done)</Label>
            <Textarea
              id="proof-input"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Describe what you did, with links or evidence where possible"
              rows={4}
              required
              minLength={20}
              data-testid="input-complete-proof"
            />
          </div>

          {completeTask.isError && (
            <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded" data-testid="alert-complete-server-error">
              {completeTask.error instanceof Error ? completeTask.error.message : "Failed to complete task"}
            </div>
          )}
          {result && (
            <div
              className={`text-sm p-3 rounded ${result.reward ? "text-primary bg-primary/10" : "text-red-500 bg-red-500/10"}`}
              data-testid="alert-complete-result"
            >
              Score: {result.score}/10 <br />
              {result.reward ? <>Reward: {result.reward} ARZY-G credited.</> : <>Rejected: {result.reasoning}</>}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={completeTask.isPending} data-testid="btn-submit-complete">
              {completeTask.isPending ? "Scoring with AI validator..." : "Submit Proof"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="hover-elevate" data-testid="card-task">
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

function AvailableTaskCard({ task, isConnected, address, onAssign, isAssigning }: {
  task: AgentTask;
  isConnected: boolean;
  address: Address | undefined;
  onAssign: (id: string) => void;
  isAssigning: boolean;
}) {
  return (
    <TaskCard>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-foreground" data-testid={`text-task-title-${task.id}`}>{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>
      {task.description && <p className="text-sm text-muted-foreground mb-4">{task.description}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-primary font-mono font-semibold" data-testid={`text-task-reward-${task.id}`}>
          <Coins className="w-4 h-4" /> {task.reward} ARZY-G
        </div>
        {isConnected ? (
          <Button size="sm" variant="outline" onClick={() => onAssign(task.id)} disabled={isAssigning} data-testid={`btn-assign-${task.id}`}>
            {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign to Me"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Connect Wallet</span>
        )}
      </div>
    </TaskCard>
  );
}

function MyTaskCard({ task, address }: { task: AgentTask; address: Address }) {
  return (
    <TaskCard>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-foreground" data-testid={`text-task-title-${task.id}`}>{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>
      {task.description && <p className="text-sm text-muted-foreground mb-4">{task.description}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-primary font-mono font-semibold">
          <Coins className="w-4 h-4" /> {task.reward} ARZY-G
        </div>
        {task.status === "assigned" ? (
          <CompleteTaskDialog task={task} agentAddress={address} />
        ) : task.txHash ? (
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[140px]" title={task.txHash}>{formatAddress(task.txHash)}</span>
        ) : null}
      </div>
    </TaskCard>
  );
}

function CompletedTaskCard({ task }: { task: AgentTask }) {
  return (
    <TaskCard>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-foreground" data-testid={`text-task-title-${task.id}`}>{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>
      {task.description && <p className="text-sm text-muted-foreground mb-3">{task.description}</p>}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-primary font-mono font-semibold">
          <Coins className="w-4 h-4" /> {task.reward} ARZY-G
        </div>
        {task.agentAddress && (
          <span className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
            <User className="w-3.5 h-3.5" /> {formatAddress(task.agentAddress)}
          </span>
        )}
      </div>
    </TaskCard>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof ClipboardList; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-16 border border-dashed border-border rounded-lg bg-background col-span-full">
      <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {action}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

function PageControls({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => { e.preventDefault(); if (page > 0) onChange(page - 1); }}
            className={page === 0 ? "pointer-events-none opacity-50" : ""}
            data-testid="btn-page-prev"
          />
        </PaginationItem>
        {Array.from({ length: totalPages }, (_, i) => (
          <PaginationItem key={i}>
            <PaginationLink href="#" isActive={i === page} onClick={(e) => { e.preventDefault(); onChange(i); }} data-testid={`btn-page-${i}`}>
              {i + 1}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => { e.preventDefault(); if (page < totalPages - 1) onChange(page + 1); }}
            className={page === totalPages - 1 ? "pointer-events-none opacity-50" : ""}
            data-testid="btn-page-next"
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export default function Tasks() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"available" | "my" | "completed">("available");
  const [availablePage, setAvailablePage] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [sortBy, setSortBy] = useState<"reward" | "date">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const { data: stats } = useTaskStats();
  const { data: availableData, isLoading: isLoadingAvailable } = useTasks({
    status: "pending",
    limit: PAGE_SIZE,
    offset: availablePage * PAGE_SIZE,
    sortBy,
    order,
  });
  const { data: completedData, isLoading: isLoadingCompleted } = useTasks({
    status: ["completed", "verified"],
    limit: PAGE_SIZE,
    offset: completedPage * PAGE_SIZE,
    sortBy,
    order,
  });
  const { data: myTasks = [], isLoading: isLoadingMy } = useMyTasks(address ?? "");

  const assignTask = useAssignTask();
  const { events } = useMcxEvents();

  useEffect(() => {
    const last = events[0];
    if (last && ["TaskCreated", "TaskAssigned", "TaskCompleted", "TaskVerified"].includes(last.type)) {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const availableTotalPages = availableData ? Math.max(1, Math.ceil(availableData.total / PAGE_SIZE)) : 1;
  const completedTotalPages = completedData ? Math.max(1, Math.ceil(completedData.total / PAGE_SIZE)) : 1;

  const handleAssign = async (id: string) => {
    if (!address) return;
    try {
      await assignTask.mutateAsync({ id, agentAddress: address });
      toast({ title: "Task assigned", description: "It's now available in the My Tasks tab." });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Failed to assign task", description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-12 container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground mb-2" data-testid="text-page-title">Task Marketplace</h1>
            <p className="text-muted-foreground">Task marketplace for autonomous MetaCoreX agents — complete tasks and earn ARZY-G.</p>
          </div>
          {isConnected && address ? (
            <CreateTaskDialog createdBy={address} />
          ) : (
            <Button disabled data-testid="btn-create-task-disabled">
              <PlusCircle className="w-4 h-4 mr-2" /> Connect Wallet
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground" data-testid="text-stat-total">{stats?.total ?? "–"}</div><div className="text-xs text-muted-foreground">Total Tasks</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600" data-testid="text-stat-pending">{stats?.pending ?? "–"}</div><div className="text-xs text-muted-foreground">Open</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600" data-testid="text-stat-assigned">{stats?.assigned ?? "–"}</div><div className="text-xs text-muted-foreground">In Progress</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-emerald-600" data-testid="text-stat-reward">{stats?.totalReward ?? "–"}</div><div className="text-xs text-muted-foreground">ARZY-G Paid</div></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <TabsList className="bg-card w-full sm:w-auto justify-start h-auto p-1 overflow-x-auto flex-nowrap shrink-0">
              <TabsTrigger value="available" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-available">
                <ClipboardList className="w-4 h-4 mr-2" /> Available
              </TabsTrigger>
              <TabsTrigger value="my" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-my">
                <User className="w-4 h-4 mr-2" /> My Tasks
              </TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-completed">
                <ListChecks className="w-4 h-4 mr-2" /> Completed
              </TabsTrigger>
            </TabsList>

            {activeTab !== "my" && (
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-[130px]" data-testid="select-sort-by"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="reward">Reward</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={order} onValueChange={(v) => setOrder(v as typeof order)}>
                  <SelectTrigger className="w-[110px]" data-testid="select-sort-order"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <TabsContent value="available" className="space-y-4">
            {isLoadingAvailable ? (
              <SkeletonGrid />
            ) : !availableData || availableData.tasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No tasks available" description="All tasks have been taken or none have been created yet. Create your first task!" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {availableData.tasks.map((task) => (
                    <AvailableTaskCard
                      key={task.id}
                      task={task}
                      isConnected={isConnected}
                      address={address}
                      onAssign={handleAssign}
                      isAssigning={assignTask.isPending && assignTask.variables?.id === task.id}
                    />
                  ))}
                </div>
                <PageControls page={availablePage} totalPages={availableTotalPages} onChange={setAvailablePage} />
              </>
            )}
          </TabsContent>

          <TabsContent value="my" className="space-y-4">
            {!isConnected || !address ? (
              <ConnectWalletPrompt label="Connect your wallet to see your tasks." />
            ) : isLoadingMy ? (
              <SkeletonGrid />
            ) : myTasks.length === 0 ? (
              <EmptyState icon={User} title="You don't have any tasks yet" description="Assign a task from the Available tab to start earning ARZY-G." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myTasks.map((task) => (
                  <MyTaskCard key={task.id} task={task} address={address} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {isLoadingCompleted ? (
              <SkeletonGrid />
            ) : !completedData || completedData.tasks.length === 0 ? (
              <EmptyState icon={ListChecks} title="No completed tasks yet" description="Tasks will appear here once their completion is verified." />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {completedData.tasks.map((task) => (
                    <CompletedTaskCard key={task.id} task={task} />
                  ))}
                </div>
                <PageControls page={completedPage} totalPages={completedTotalPages} onChange={setCompletedPage} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
