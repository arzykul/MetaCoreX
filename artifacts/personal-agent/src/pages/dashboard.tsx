import { useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { CheckSquare, StickyNote, Bell, MessageSquare, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | undefined;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            {value === undefined ? (
              <Skeleton className="h-9 w-16 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ElementType> = {
    task: CheckSquare,
    note: StickyNote,
    reminder: Bell,
    chat: MessageSquare,
  };
  const Icon = icons[type] ?? CheckSquare;
  return <Icon className="w-4 h-4 text-muted-foreground" />;
}

function ActivityTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    task: "Задача",
    note: "Заметка",
    reminder: "Напоминание",
    chat: "Чат",
  };
  return (
    <Badge variant="secondary" className="text-xs">
      {labels[type] ?? type}
    </Badge>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const completionRate =
    stats && stats.totalTasks > 0
      ? Math.round((stats.doneTasks / stats.totalTasks) * 100)
      : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-serif font-bold text-foreground">Обзор</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ваш персональный дашборд
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Задачи"
          value={stats?.totalTasks}
          subtitle={`${stats?.doneTasks ?? 0} выполнено`}
          icon={CheckSquare}
          color="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          title="Заметки"
          value={stats?.totalNotes}
          icon={StickyNote}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          title="Напоминания"
          value={stats?.totalReminders}
          subtitle={`${stats?.upcomingReminders ?? 0} предстоит`}
          icon={Bell}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          title="Выполнено"
          value={stats ? completionRate : undefined}
          subtitle="% задач"
          icon={TrendingUp}
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Последняя активность
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !activity || activity.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">
                Активности пока нет. Создайте задачу или заметку!
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="activity-list">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid={`activity-item-${item.id}`}
                >
                  <div className="shrink-0">
                    <ActivityTypeIcon type={item.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ActivityTypeBadge type={item.type} />
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
