import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { parseRecognitionOutput, type RawBuilding } from "../../../lib/recognition/parser";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert Clash of Clans base analyst. Analyze this screenshot with extreme precision.

## COORDINATE SYSTEM (READ CAREFULLY)
The base uses a 44×44 tile grid in isometric (diamond) perspective.

Screen direction → tile effect:
- Moving RIGHT on screen  → x increases, y decreases
- Moving LEFT on screen   → x decreases, y increases
- Moving DOWN on screen   → both x and y increase
- Moving UP on screen     → both x and y decrease

Diamond anchor points (approximate):
- TOP vertex of diamond   → tile (22, 0)
- RIGHT vertex            → tile (43, 22)
- BOTTOM vertex           → tile (22, 43)
- LEFT vertex             → tile (0, 22)
- CENTER of base          → tile (22, 22)

Always output the TOP-LEFT corner tile of each building footprint.

## BUILDING FOOTPRINT SIZES
Use these to estimate positions accurately (size = footprint side in tiles):

Size 5: town-hall (levels 12+)
Size 4: town-hall (levels 8–11), eagle-artillery, scattershot, monolith, army-camp, gold-storage, elixir-storage
Size 3: cannon, archer-tower, mortar, air-defense, wizard-tower, x-bow, inferno-tower, bomb-tower,
        clan-castle, barracks, dark-barracks, laboratory, spell-factory, workshop, blacksmith,
        pet-house, gold-mine, elixir-collector, dark-elixir-storage
Size 2: hidden-tesla, builder-hut, air-sweeper, giant-bomb, dark-spell-factory, hero-hall,
        dark-elixir-drill, tornado-trap
Size 1: bomb, air-bomb, spring-trap, seeking-air-mine  (traps — look carefully, they are small)
Size 1: each individual wall tile

## VALID BUILDING IDs (use EXACTLY these strings)
Defenses: cannon, archer-tower, mortar, air-defense, wizard-tower, x-bow, inferno-tower,
          eagle-artillery, scattershot, monolith, bomb-tower, hidden-tesla, air-sweeper, builder-hut
Traps:    bomb, giant-bomb, air-bomb, spring-trap, seeking-air-mine, tornado-trap
Buildings: town-hall, clan-castle, army-camp, barracks, dark-barracks, laboratory,
           spell-factory, dark-spell-factory, workshop, hero-hall, blacksmith, pet-house,
           gold-mine, elixir-collector, dark-elixir-drill,
           gold-storage, elixir-storage, dark-elixir-storage

## METHODOLOGY
1. Locate the Town Hall first — it is the most elaborate building, often near the center.
   Use it as your calibration anchor.
2. Identify all defenses and structures, respecting building sizes so they do not overlap.
3. Look carefully for small traps on the ground between buildings.
4. Identify wall tiles — walls form compartment rings. Output each individual wall tile as x,y.
5. Estimate level from visual appearance (more ornate = higher level). Default to 1 if unsure.

## RULES
- NEVER invent IDs not in the lists above.
- Ensure buildings of size N occupy tiles x..x+N-1, y..y+N-1 — do not let them overlap.
- Wall tiles are individual 1×1 positions; output as many as you can see.
- Clamp all coordinates to 0–43.`;

export async function POST(req: Request) {
  try {
    const { image, mediaType } = await req.json() as {
      image:     string;
      mediaType: "image/png" | "image/jpeg" | "image/webp";
    };

    if (!image) {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not set in environment" },
        { status: 500 },
      );
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:      "claude-opus-4-7",
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      tools: [
        {
          name:        "report_base",
          description: "Report all buildings, traps, and walls identified in the screenshot.",
          input_schema: {
            type: "object",
            properties: {
              buildings: {
                type: "array",
                description: "All defenses, traps, and non-wall buildings.",
                items: {
                  type: "object",
                  properties: {
                    id:    { type: "string",  description: "Exact building ID from the provided lists." },
                    x:     { type: "integer", description: "Top-left tile column (0–43)." },
                    y:     { type: "integer", description: "Top-left tile row (0–43)." },
                    level: { type: "integer", description: "Estimated level (1–20)." },
                  },
                  required: ["id", "x", "y", "level"],
                },
              },
              walls: {
                type: "array",
                description: "Individual wall tile positions (each 1×1).",
                items: {
                  type: "object",
                  properties: {
                    x: { type: "integer", description: "Tile column (0–43)." },
                    y: { type: "integer", description: "Tile row (0–43)." },
                  },
                  required: ["x", "y"],
                },
              },
            },
            required: ["buildings", "walls"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_base" },
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mediaType, data: image },
            },
            {
              type: "text",
              text: "Analyze this Clash of Clans base screenshot. Identify every building, trap, and wall tile with accurate tile coordinates.",
            },
          ],
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Claude did not return a tool call" }, { status: 500 });
    }

    const input = toolBlock.input as {
      buildings: RawBuilding[];
      walls:     { x: number; y: number }[];
    };

    const result = parseRecognitionOutput(input.buildings ?? []);
    const walls  = (input.walls ?? []).map((w) => ({
      x: Math.max(0, Math.min(43, Math.round(Number(w.x) || 0))),
      y: Math.max(0, Math.min(43, Math.round(Number(w.y) || 0))),
    }));

    return NextResponse.json({ ...result, walls });
  } catch (err) {
    console.error("[/api/recognize-base]", err);
    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}
