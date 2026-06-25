import { redirect } from "next/navigation";
// Entry: send users to the takeoff workspace. Middleware guards auth.
export default function Home() { redirect("/takeoff"); }
