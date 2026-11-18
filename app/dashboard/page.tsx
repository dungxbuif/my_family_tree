import {
  HeritageBanner,
  HeritageEventRow,
  HeritageMetricCard,
  HeritagePersonCard,
} from "@/components/heritage";
import type { Person, Relationship } from "@/types";
import { getDataClient, getUser } from "@/utils/data/queries";
import { computeEvents, type CustomEventRecord } from "@/utils/eventHelpers";
import { Cake, CalendarDays, Flower2, GitBranch, Layers3, Star, Users } from "lucide-react";
import Link from "next/link";

const eventIcons = {
  birthday: Cake,
  death_anniversary: Flower2,
  custom_event: Star,
};

export default async function DashboardLaunchpad() {
  const [user, personsRes, relationshipsRes, customEventsRes] = await Promise.all([
    getUser(),
    getDataClient().from<Person>("persons").select("*").order("updated_at", { ascending: false }),
    getDataClient().from<Relationship>("relationships").select("*"),
    getDataClient().from<CustomEventRecord>("custom_events").select("id, name, content, event_date, location, created_by"),
  ]);

  const persons = personsRes.data ?? [];
  const relationships = relationshipsRes.data ?? [];
  const events = computeEvents(persons, customEventsRes.data ?? []).filter((event) => event.daysUntil >= 0);
  const generations = new Set(persons.map((person) => person.generation).filter(Boolean)).size;
  const childIds = new Set(relationships.filter((relationship) => relationship.type.includes("child")).map((relationship) => relationship.person_b));
  const branches = Math.max(1, persons.filter((person) => !childIds.has(person.id)).length);
  const displayName = user?.email?.split("@")[0]?.split(/[._-]/)[0] || "bạn";
  const greetingName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-28 pt-4 sm:px-6 md:pb-10 lg:px-8">
      <HeritageBanner title={`Chào mừng, ${greetingName}`} subtitle="Quản lý gia phả dòng họ của bạn" />

      <section className="grid grid-cols-2 gap-3">
        <HeritageMetricCard label="Thành viên" value={persons.length} icon={Users} href="/dashboard/members?view=list" />
        <HeritageMetricCard label="Thế hệ" value={generations || "—"} icon={Layers3} href="/dashboard/members?view=tree" />
        <HeritageMetricCard label="Sự kiện" value={events.length} icon={CalendarDays} href="/dashboard/events" />
        <HeritageMetricCard label="Chi nhánh" value={branches} icon={GitBranch} href="/dashboard/lineage" />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-[22px] font-bold text-primary"><Users className="size-6 text-amber-700" />Gia đình gần đây</h2>
          <Link href="/dashboard/members?view=list" className="text-sm font-semibold text-amber-800">Xem tất cả ›</Link>
        </div>
        {persons.length ? (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
            {persons.slice(0, 3).map((person, index) => (
              <HeritagePersonCard
                key={person.id}
                name={person.full_name}
                label={person.generation ? `Đời ${person.generation}` : person.is_deceased ? "Đã mất" : "Thành viên"}
                avatarUrl={person.avatar_url}
                gender={person.gender}
                href={`/dashboard/members/${person.id}`}
                featured={index < 2}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-border bg-surface p-6 text-center text-secondary">Chưa có thành viên trong gia phả.</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-[22px] font-bold text-primary"><CalendarDays className="size-6 text-amber-700" />Sự kiện sắp tới</h2>
          <Link href="/dashboard/events" className="text-sm font-semibold text-amber-800">Xem tất cả ›</Link>
        </div>
        {events.length ? (
          <div className="space-y-2.5">
            {events.slice(0, 3).map((event, index) => {
              const date = event.nextOccurrence;
              const Icon = eventIcons[event.type];
              return (
                <HeritageEventRow
                  key={`${event.personId}-${event.type}-${index}`}
                  icon={Icon}
                  day={String(date.getDate()).padStart(2, "0")}
                  month={`Thg ${date.getMonth() + 1}`}
                  title={`${event.type === "birthday" ? "Sinh nhật" : event.type === "death_anniversary" ? "Giỗ" : ""} ${event.personName}`.trim()}
                  subtitle={date.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  countdown={event.daysUntil === 0 ? "Hôm nay" : `Còn ${event.daysUntil} ngày`}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-border bg-surface p-6 text-center text-secondary">Chưa có sự kiện sắp tới.</div>
        )}
      </section>
    </main>
  );
}
