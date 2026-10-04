"use client";
import { useEffect, useState } from "react";
import { api, entries, session, usePoll, type Session } from "@/lib/api";
import { useCountdown } from "@/components/ui";

/** Everything every fan page needs about one drop: the live public drop, the server-clock offset, who is signed in and whether this browser holds an entry. */
export function useFan(id: string) {
  const { data: d, error } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const [sess, setSess] = useState<Session | null>(null);
  const [hasEntry, setHasEntry] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setSess(session.get()); setHasEntry(!!entries.get(id)?.receipt); setReady(true); }, [id]);
  const off = d ? d.server_time_ms - Date.now() : 0;
  const toOpen = useCountdown(d?.state === "SCHEDULED" ? d.opens_at_ms : undefined, off);
  const toClose = useCountdown(d?.state === "OPEN" ? d.closes_at_ms : undefined, off);
  // eligibility: the phone must have been verified before the cutoff the drop published
  const eligible: boolean | null = d && sess ? sess.verified_at_ms <= d.cutoff_at_ms : null;
  return { d, error, off, sess, hasEntry, setHasEntry, ready, toOpen, toClose, eligible };
}
