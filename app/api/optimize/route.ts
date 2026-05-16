import { NextResponse } from "next/server";
import { createBestDeployment, type OptimizerOptions, type TroopTemplate } from "../../../lib/engine/optimizer";
import type { DefensePlacement, BuildingPlacement } from "../../../lib/engine/calculator";
import type { WallPlacement } from "../../../lib/data/walls";

// Raise the serverless function timeout on Vercel Pro (ignored on free tier / local)
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      templates:  TroopTemplate[];
      defenses:   DefensePlacement[];
      buildings:  BuildingPlacement[];
      walls:      WallPlacement[];
      options:    OptimizerOptions;
    };

    const { templates, defenses, buildings, walls, options } = body;

    if (!templates?.length || !defenses?.length) {
      return NextResponse.json({ error: "templates and defenses are required" }, { status: 400 });
    }

    const result = createBestDeployment(templates, defenses, buildings, options, walls);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/optimize]", err);
    return NextResponse.json({ error: "Optimization failed" }, { status: 500 });
  }
}
