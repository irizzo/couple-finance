import { redirect } from "next/navigation";
import { currentMonth } from "@/lib/month";

/**
 * There is no separate home screen: the monthly ledger *is* the home screen.
 * `force-dynamic` because `currentMonth()` reads the clock — a statically
 * prerendered redirect would pin the app to whatever month it was built in.
 */
export const dynamic = "force-dynamic";

export default function Home() {
	redirect(`/transactions?month=${currentMonth()}`);
}
