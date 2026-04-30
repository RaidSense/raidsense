import type { Metadata } from "next";
import SimulatorPanel from "./components/SimulatorPanel";

export const metadata: Metadata = {
  title: "RaidSense — Simulateur",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-slate-100">
      <SimulatorPanel />
    </main>
  );
}
