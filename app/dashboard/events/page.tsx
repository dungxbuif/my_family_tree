import { MemberListProvider } from "@/context/MemberListContext";
import EventsList from "@/components/EventsList";
import MemberDetailModal from "@/components/modal/MemberDetailModal";
import { getDataClient } from "@/utils/data/queries";

export const metadata = {
  title: "Sự kiện gia phả",
};

export default async function EventsPage() {
  const db = getDataClient();

  const [personsRes, customEventsRes] = await Promise.all([
    db.from("persons").select(
      "id, full_name, birth_year, birth_month, birth_day, death_year, death_month, death_day, death_lunar_year, death_lunar_month, death_lunar_day, is_deceased, avatar_url",
    ),
    db
      .from("custom_events")
      .select("id, name, content, event_date, location, created_by"),
  ]);

  const persons = (personsRes.data as {
    id: string;
    full_name: string;
    birth_year: number | null;
    birth_month: number | null;
    birth_day: number | null;
    death_year: number | null;
    death_month: number | null;
    death_day: number | null;
    death_lunar_year: number | null;
    death_lunar_month: number | null;
    death_lunar_day: number | null;
    is_deceased: boolean;
    avatar_url: string | null;
  }[]) || [];
  const customEvents = (customEventsRes.data as {
    id: string;
    name: string;
    content: string | null;
    event_date: string;
    location: string | null;
    created_by: string | null;
  }[]) || [];

  return (
    <MemberListProvider>
      <div className="flex-1 w-full relative flex flex-col pb-12">
        <div className="w-full relative z-20 py-6 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
          <h1 className="title">Sự kiện gia phả</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Sinh nhật, ngày giỗ (âm lịch) và các sự kiện tuỳ chỉnh
          </p>
        </div>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1">
          <EventsList
            persons={persons ?? []}
            customEvents={customEvents ?? []}
          />
        </main>
      </div>

      {/* Modal for member details when clicking an event card */}
      <MemberDetailModal />
    </MemberListProvider>
  );
}
