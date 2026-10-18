import { redirect } from "next/navigation";

/** The printed persona card is gone (judges use their own data); old links land on the race board. */
export default function RaceCard() {
  redirect("/race");
}
