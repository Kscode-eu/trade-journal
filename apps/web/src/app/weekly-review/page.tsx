"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { shiftDay, weekOf, type WeeklyReviewPayload } from "@/lib/weekly-review";
import { WeeklyReview } from "@/components/weekly-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function WeeklyReviewPage() {
  const [date, setDate] = useState("");
  const [version, setVersion] = useState(0);
  const { data, error, loading, refresh } = useApi<WeeklyReviewPayload>(
    `/api/ai/weekly-review${date ? `?date=${date}` : ""}`,
  );
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Weekly review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your trading week, the lessons in your notes, and a plan for next week.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            disabled={!data}
            onClick={() => data && setDate(shiftDay(data.start, -7))}
          >
            <ChevronLeft />
          </Button>
          <label className="space-y-1 text-xs text-muted-foreground">
            Week containing
            <Input
              type="date"
              aria-label="Week containing"
              value={date || data?.start || ""}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                  setDate(weekOf(e.target.value).start);
              }}
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            disabled={!data}
            onClick={() => data && setDate(shiftDay(data.start, 7))}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setVersion((v) => v + 1);
              refresh();
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        data && <WeeklyReview key={`${data.start}:${data.timeZone}:${version}`} initial={data} />
      )}
    </div>
  );
}
