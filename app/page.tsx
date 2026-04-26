import type { Metadata } from "next";
import SimulatorPanel from "./components/SimulatorPanel";

export const metadata: Metadata = {
  title: "RaidSense — Simulateur",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <SimulatorPanel />
    </main>
  );
}
